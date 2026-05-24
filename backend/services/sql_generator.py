import re
import json
import logging
from typing import List, Dict, Any

from app.services.prompt_loader import load_prompt
from app.services.copilot_sdk import get_copilot_chat_completion
from app.core.config import settings

logger = logging.getLogger(__name__)


def _ensure_list(value: Any) -> list:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        return [value]
    return []


def _safe_schema(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return {}
    return {}


def _extract_table_name(selected_tables: Any) -> str:
    selected_tables = _ensure_list(selected_tables)

    if not selected_tables:
        return ""

    first = selected_tables[0]

    if isinstance(first, dict):
        return (
            first.get("table")
            or first.get("table_name")
            or first.get("name")
            or ""
        )

    return str(first)


def _extract_json_from_response(response_text: str) -> Dict[str, Any]:
    if not response_text:
        raise ValueError("Empty LLM response text")

    # Case 1: direct JSON
    try:
        return json.loads(response_text)
    except Exception:
        pass

    # Case 2: Copilot SDK SessionEvent wrapper: content='...'
    match = re.search(
        r"content=(['\"])(.*?)\1,\s*message_id=",
        response_text,
        re.DOTALL,
    )

    if match:
        raw_content = match.group(2)

        try:
            content = bytes(raw_content, "utf-8").decode("unicode_escape")
            return json.loads(content)
        except Exception as e:
            logger.warning("Failed content= parser: %s", e)

    # Case 3: extract JSON block inside wrapper
    start = response_text.find("{")
    end = response_text.rfind("}")

    if start != -1 and end != -1 and end > start:
        json_block = response_text[start:end + 1]
        json_block = (
            json_block
            .replace("\\n", "\n")
            .replace("\\'", "'")
            .replace('\\"', '"')
        )
        return json.loads(json_block)

    raise ValueError("Could not extract JSON from LLM response")


async def generate_sql(
    question: str,
    selected_tables: List[Any] | None = None,
    conversation_history: List[Dict[str, str]] | None = None,
    schema_json: str | Dict[str, Any] | None = None,
    schema: Dict[str, Any] | None = None,
    intent: Dict[str, Any] | None = None,
    recent_sqls: list | None = None,
    history: list | None = None,
    sample_values: dict | None = None,
    copilot_token: str | None = None,
    **kwargs,
) -> Dict[str, Any]:

    selected_tables = _ensure_list(selected_tables or kwargs.get("tables"))
    conversation_history = _ensure_list(conversation_history or history)
    recent_sqls = _ensure_list(recent_sqls)

    schema_context = schema or _safe_schema(schema_json)
    table_name = _extract_table_name(selected_tables)

    print("\n========== SQL GENERATOR DEBUG ==========")
    print("QUESTION:", question)
    print("SELECTED TABLES:", selected_tables)
    print("TABLE NAME USED:", table_name)
    print("SCHEMA TYPE:", type(schema_context))
    print("SCHEMA PREVIEW:", str(schema_context)[:500])
    print("RECENT SQLS:", recent_sqls[-3:])

    try:
        prompt_template = load_prompt("sql_generator.txt")

        context = {
            "question": question,
            "tables": selected_tables,
            "selected_tables": selected_tables,
            "schema": schema_context,
            "history": conversation_history[-3:],
            "recent_sqls": recent_sqls[-3:],
            "sample_values": sample_values or {},
            "intent": intent or {},
        }

        prompt = prompt_template.format(**context)

        print("\n----- PROMPT SENT TO COPILOT -----")
        print(prompt[:3000])
        print("----- END PROMPT PREVIEW -----\n")

        resolved_token = (
            copilot_token
            or kwargs.get("github_token")
            or settings.GITHUB_COPILOT_TOKEN
        )

        print("SQL GENERATOR RECEIVED TOKEN:", bool(copilot_token))
        print("ENV TOKEN EXISTS:", bool(settings.GITHUB_COPILOT_TOKEN))
        print("FINAL TOKEN EXISTS:", bool(resolved_token))

        response = await get_copilot_chat_completion(
            github_token=resolved_token,
            model=settings.LLM_MODEL,
            prompt=prompt,
        )

        print("----- RAW COPILOT SDK RESPONSE -----")
        print(response)
        print("----- END RAW RESPONSE -----")

        if not response.get("success"):
            raise RuntimeError(
                response.get("error_message", "LLM generation failed")
            )

        response_text = response.get("response_text", "")

        print("----- RAW LLM TEXT -----")
        print(response_text)
        print("----- END RAW LLM TEXT -----")

        generated = _extract_json_from_response(response_text)

        if "sql" not in generated:
            raise ValueError("LLM response JSON missing 'sql' key")
        
        generated["sql"] = generated["sql"].strip().rstrip(";").strip()

        # Sanitize Trino SQL (replace ILIKE with LOWER(col) LIKE LOWER(val))
        from app.services.sql_repair import sanitize_trino_sql
        generated["sql"] = sanitize_trino_sql(generated["sql"])

        print("✅ LLM GENERATED SQL SUCCESSFULLY")
        print("SQL (Sanitized):", generated["sql"])
        print("=========================================\n")

        return generated

    except Exception as e:
        print("SQL generation failed.")
        print("FAILURE REASON:", repr(e))
        print("=========================================\n")

        logger.error("LLM SQL generation failed: %s", e)
        raise RuntimeError(f"SQL generation failed: {e}") from e
