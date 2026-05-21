import logging
from typing import List, Dict, Any, Optional

from app.services.intent_classifier import classify_intent
from app.services.table_selector import select_tables
from app.services.sql_generator import generate_sql
from app.services.sql_repair import repair_sql
from app.services.result_shaper import shape_result
from app.services.summary_generator import generate_summary
from app.validators.sql_validator import validate_sql
from app.services.schema_loader import load_schema
from app.executors.starburst_executor import StarburstExecutor
from app.services.entity_resolution_service import extract_entities
from app.services.relationship_inference_service import infer_relationships

logger = logging.getLogger(__name__)

class NLtoSQLPipeline:
    def __init__(self):
        self.recent_sqls: List[str] = []
        self.executor = StarburstExecutor()
        self.mock_mode = self.executor.mock_mode

    async def process(
        self,
        question: str,
        session_id: Optional[str] = None,
        copilot_token: Optional[str] = None,
    ) -> Dict[str, Any]:

        print("PIPELINE SESSION ID:", session_id)
        print("PIPELINE RECEIVED COPILOT TOKEN:", bool(copilot_token))

        schema = load_schema()
        if schema is None:
            raise RuntimeError("Choose data sources for AI context before asking a question.")

        intent = await classify_intent(question, schema)
        
        matched_entities = extract_entities(question, schema)

        selected = await select_tables(
            question,
            schema,
            intent=intent,
            recent_sqls=self.recent_sqls,
            matched_entities=matched_entities
        )
        
        selected_table_names = [s["table"] for s in selected]
        inferred_relationships = infer_relationships(schema, selected_tables=selected_table_names)

        sql_output = await generate_sql(
            question=question,
            selected_tables=selected,
            schema=schema,
            intent=intent,
            recent_sqls=self.recent_sqls,
            session_id=session_id,
            copilot_token=copilot_token,
            matched_entities=matched_entities,
            inferred_relationships=inferred_relationships,
        )

        sql = sql_output["sql"]

        validation = None

        for attempt in range(3):
            validation = await validate_sql(sql, schema)

            if validation["valid"]:
                break

            if attempt == 2:
                raise RuntimeError(
                    f"SQL validation failed after retries: {validation['errors']}"
                )

            repair = await repair_sql(
                question=question,
                failed_sql=sql,
                error_message=str(validation["errors"]),
                schema=schema,
                recent_sqls=self.recent_sqls,
                selected_tables=selected,
                intent=intent,
            )

            sql = repair["sql"]

        self.recent_sqls.append(sql)
        self.recent_sqls = self.recent_sqls[-3:]

        try:
            raw_rows = await self.executor.execute(sql)

        except Exception as exc:
            exec_err = str(exc)

            repair = await repair_sql(
                question=question,
                failed_sql=sql,
                error_message=exec_err,
                schema=schema,
                recent_sqls=self.recent_sqls,
                selected_tables=selected,
                intent=intent,
            )

            sql = repair["sql"]
            raw_rows = await self.executor.execute(sql)

        shaped = shape_result(raw_rows)

        summary = await generate_summary(
            question=question,
            sql=sql,
            result=shaped,
            schema=schema,
            recent_sqls=self.recent_sqls,
        )

        response = {
            "intent": intent,
            "selected_tables": selected,
            "sql": sql,
            "validation": validation,
            "execution": {
                "rows": shaped["rows"],
                "preview": shaped["preview_rows"],
            },
            "summary": summary,
            "metadata": {
                "schema_tables": len(schema) if hasattr(schema, "__len__") else 0,
                "mock_mode": self.mock_mode,
                "llm_token_received": bool(copilot_token),
            },
        }

        logger.info("NL-to-SQL pipeline completed")
        return response
