import os
import logging
import json
import re
import ast
import asyncio
from typing import Dict, Any, List

from app.services.prompt_loader import load_prompt
from app.services.copilot_sdk import get_copilot_chat_completion

logger = logging.getLogger(__name__)


def _safe_json_loads(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value

    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return {}

    return {}


def _ensure_list(value: Any) -> list:
    if value is None:
        return []

    if isinstance(value, list):
        return value

    if isinstance(value, dict):
        return [value]

    return []


def _extract_table_name(selected_tables: Any) -> str:
    if not selected_tables:
        return "flight_ops"

    first = selected_tables[0]

    if isinstance(first, dict):
        return (
            first.get("table")
            or first.get("name")
            or first.get("table_name")
            or "flight_ops"
        )

    return str(first)


def _extract_json_from_response(response_text: str) -> Dict[str, Any]:
    """
    Copilot SDK may return either:
    1. raw JSON string
    2. SessionEvent(... content='JSON HERE' ...)
    This extracts the JSON safely.
    """

    if not response_text:
        raise ValueError("Empty LLM response text")

    print(f"----- _extract_json_from_response RAW TEXT -----\n{response_text}\n------------------------------------------------")

    # Case 1: direct JSON
    try:
        return json.loads(response_text)
    except Exception:
        pass

    # Case 2: SessionEvent wrapper with content='...'
    match = re.search(r"content='(.*?)', message_id=", response_text, re.DOTALL)
    if match:
        content_literal = "'" + match.group(1) + "'"
        try:
            content = ast.literal_eval(content_literal)
            if not content.strip():
                raise ValueError("SessionEvent content is empty")
            
            # Remove Markdown formatting if present
            content_clean = re.sub(r"```(?:json)?\s*", "", content)
            content_clean = re.sub(r"```\s*$", "", content_clean).strip()
            
            return json.loads(content_clean)
        except Exception as e:
            raise ValueError(f"Failed to parse JSON from SessionEvent content. Raw content length: {len(match.group(1))}. Error: {e}")

    # Case 3: markdown code block without SessionEvent wrapper
    match = re.search(r"```(?:json)?\s*(.*?)\s*```", response_text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except Exception as e:
            pass

    # Case 4: fallback extract first JSON object
    match = re.search(r"\{.*\}", response_text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except Exception as e:
            pass

    raise ValueError("Could not extract JSON from LLM response. Snippet: " + response_text[:100])


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
    **kwargs
) -> Dict[str, Any]:

    selected_tables = _ensure_list(selected_tables or kwargs.get("tables"))
    conversation_history = _ensure_list(conversation_history or history)
    recent_sqls = _ensure_list(recent_sqls)

    schema_context = schema or _safe_json_loads(schema_json)
    table_name = _extract_table_name(selected_tables)

    print("\n========== SQL GENERATOR DEBUG ==========")
    print("QUESTION:", question)
    print("SELECTED TABLES:", selected_tables)
    print("TABLE NAME USED:", table_name)
    print("SCHEMA TYPE:", type(schema_context))
    print("SCHEMA PREVIEW:", str(schema_context)[:500])
    print("RECENT SQLS:", recent_sqls[-3:])

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
        "matched_entities": kwargs.get("matched_entities", []),
        "inferred_relationships": kwargs.get("inferred_relationships", []),
    }

    prompt = prompt_template.format(**context)

    print("\n----- PROMPT SENT TO COPILOT -----")
    print(prompt[:3000])
    print("----- END PROMPT PREVIEW -----\n")

    resolved_token = (
        copilot_token
        or kwargs.get("github_token")
        or os.getenv("GITHUB_COPILOT_TOKEN", "")
    )

    print("SQL GENERATOR RECEIVED TOKEN:", bool(copilot_token))
    print("ENV TOKEN EXISTS:", bool(os.getenv("GITHUB_COPILOT_TOKEN", "")))
    print("FINAL TOKEN EXISTS:", bool(resolved_token))

    max_retries = 1
    last_error = None
    
    for attempt in range(max_retries + 1):
        if attempt > 0:
            print(f"\n⚠️ RETRYING LLM CALL (Attempt {attempt + 1}/{max_retries + 1}). Waiting 1.5s...")
            await asyncio.sleep(1.5)

        try:
            response = await get_copilot_chat_completion(
                github_token=resolved_token,
                model="gpt-4.1",
                prompt=prompt
            )

            print(f"\n----- RAW COPILOT SDK RESPONSE (Attempt {attempt + 1}) -----")
            print(response)
            print("----- END RAW RESPONSE -----")

            if not response.get("success"):
                raise RuntimeError(response.get("error_message", "LLM SDK returned success=False"))

            response_text = response.get("response_text", "")
            
            if not response_text:
                raise ValueError("response_text is empty or missing")

            generated = _extract_json_from_response(response_text)

            if "sql" not in generated:
                raise ValueError("LLM response JSON missing 'sql' key")

            # Sanitize Trino SQL (replace ILIKE with LOWER(col) LIKE LOWER(val))
            from app.services.sql_repair import sanitize_trino_sql
            generated["sql"] = sanitize_trino_sql(generated["sql"])

            print("✅ LLM GENERATED SQL SUCCESSFULLY")
            print("SQL (Sanitized):", generated["sql"])
            print("=========================================\n")

            logger.info(f"SQL generation succeeded on attempt {attempt + 1}")
            return generated

        except Exception as e:
            last_error = e
            print(f"❌ Attempt {attempt + 1} failed: {repr(e)}")
            logger.warning(f"LLM SQL generation attempt {attempt + 1} failed. Error: {e}")

    print("❌ ALL LLM ATTEMPTS FAILED. USING FALLBACK SQL")
    print("FINAL FALLBACK REASON:", repr(last_error))
    print("=========================================\n")

    fallback_sql = f"""
SELECT COUNT(*) AS result_count
FROM {table_name}
LIMIT 100
""".strip()

    return {
        "assumption": f"Fallback SQL was used because LLM SQL generation failed after retries. Error: {str(last_error)}",
        "sql": fallback_sql,
        "chart_type": "table",
        "explanation": f"Generated a safe fallback SELECT query using table {table_name} due to an error."
    }