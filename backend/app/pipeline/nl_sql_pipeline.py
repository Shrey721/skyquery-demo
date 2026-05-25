import logging
from typing import List, Dict, Any, Optional

from app.services.intent_classifier import classify_intent
from app.services.table_selector import select_tables
from app.services.sql_generator import generate_sql
from app.services.sql_repair import repair_sql
from app.services.result_shaper import shape_result
from app.services.summary_generator import generate_summary
from app.services.execution_errors import (
    build_connector_error_response,
    detect_catalog_from_sql,
    is_connector_connection_failure,
)
from app.services.followup_query_resolver import (
    build_followup_clarification_response,
    classify_followup_routing,
    resolve_followup_query,
    sanity_check_followup_resolution,
)
from app.services.metadata_followup import (
    build_metadata_count_response,
    build_metadata_overview_response,
    build_metadata_followup_response,
    build_metadata_clarification_response,
    build_table_columns_sql,
    is_metadata_table_detail_request,
    is_standalone_metadata_count_request,
    is_standalone_metadata_overview_request,
    resolve_metadata_table_candidates,
    should_handle_metadata_followup,
)
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
        query_context: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
    ) -> Dict[str, Any]:

        print("PIPELINE SESSION ID:", session_id)
        print("PIPELINE REQUEST ID:", request_id)
        print("PIPELINE RECEIVED COPILOT TOKEN:", bool(copilot_token))

        schema = load_schema()
        if schema is None:
            raise RuntimeError("Choose data sources for AI context before asking a question.")

        is_metadata_followup = should_handle_metadata_followup(question, query_context)
        is_metadata_detail_request = is_metadata_table_detail_request(question, query_context)
        is_metadata_count_request = is_standalone_metadata_count_request(question)
        is_metadata_overview_request = is_standalone_metadata_overview_request(question)

        if is_metadata_count_request and not is_metadata_detail_request:
            return await build_metadata_count_response(
                question=question,
                schema=schema,
                executor=self.executor,
                request_id=request_id,
                session_metadata={"llm_token_received": bool(copilot_token)},
            )

        if is_metadata_overview_request and not is_metadata_detail_request:
            return await build_metadata_overview_response(
                question=question,
                schema=schema,
                executor=self.executor,
                request_id=request_id,
                session_metadata={"llm_token_received": bool(copilot_token)},
            )

        if is_metadata_followup or is_metadata_detail_request:
            matches = resolve_metadata_table_candidates(question, schema, query_context)
            if len(matches) == 1:
                resolved_table = matches[0]
                sql = build_table_columns_sql(resolved_table)
                logger.info(
                    "Metadata table query | detected_metadata_intent=true | resolved_table_candidate=%s | chosen_table=%s | generated_metadata_sql=%s | sql_execution_called=true",
                    resolved_table.get("table_name") or resolved_table.get("name") or resolved_table.get("table"),
                    ".".join(
                        str(part)
                        for part in [
                            resolved_table.get("catalog"),
                            resolved_table.get("schema_name") or resolved_table.get("schema"),
                            resolved_table.get("table_name") or resolved_table.get("name") or resolved_table.get("table"),
                        ]
                        if part
                    ),
                    sql,
                )
                print(
                    "METADATA TABLE QUERY DEBUG:",
                    {
                        "detected_metadata_intent": True,
                        "resolved_table_candidate": resolved_table.get("table_name") or resolved_table.get("name") or resolved_table.get("table"),
                        "chosen_catalog": resolved_table.get("catalog"),
                        "chosen_schema": resolved_table.get("schema_name") or resolved_table.get("schema"),
                        "chosen_table": resolved_table.get("table_name") or resolved_table.get("name") or resolved_table.get("table"),
                        "generated_metadata_sql": sql,
                        "sql_execution_called": True,
                    },
                )

                validation = await validate_sql(sql, schema)
                if not validation["valid"]:
                    repair = await repair_sql(
                        question=question,
                        failed_sql=sql,
                        error_message=str(validation["errors"]),
                        schema=schema,
                        intent={"intent": "schema_exploration"},
                    )
                    sql = repair["sql"]
                    validation = await validate_sql(sql, schema)
                    if not validation["valid"]:
                        raise RuntimeError(f"SQL validation failed after metadata repair: {validation['errors']}")

                try:
                    raw_rows = await self.executor.execute(sql)
                except Exception as exc:
                    if is_connector_connection_failure(exc):
                        logger.warning(
                            "Metadata execution failure category=connector_connection_failed | generated_sql=%s | error=%s",
                            sql,
                            exc,
                        )
                        return build_connector_error_response(sql, exc, validation=validation)

                    repair = await repair_sql(
                        question=question,
                        failed_sql=sql,
                        error_message=str(exc),
                        schema=schema,
                        intent={"intent": "schema_exploration"},
                    )
                    sql = repair["sql"]
                    validation = await validate_sql(sql, schema)
                    if not validation["valid"]:
                        raise RuntimeError(f"SQL validation failed after metadata execution repair: {validation['errors']}")
                    try:
                        raw_rows = await self.executor.execute(sql)
                    except Exception as repaired_exc:
                        if is_connector_connection_failure(repaired_exc):
                            logger.warning(
                                "Metadata repaired execution failure category=connector_connection_failed | generated_sql=%s | error=%s",
                                sql,
                                repaired_exc,
                            )
                            return build_connector_error_response(sql, repaired_exc, validation=validation)
                        raise

                shaped = shape_result(raw_rows, question=question, sql=sql, intent={"intent": "schema_exploration"})
                summary = await generate_summary(question=question, sql=sql, result=shaped, schema=schema)
                rendering = shaped["rendering"]
                return {
                    "intent": {"intent": "schema_exploration", "reason": "Resolved metadata table reference and executed information_schema query."},
                    "result_intent": shaped["result_intent"],
                    "selected_tables": [],
                    "sql": sql,
                    "validation": validation,
                    "execution": {
                        "rows": shaped["rows"],
                        "preview": shaped["preview_rows"],
                        "columns": shaped["columns"],
                        "chart_suggestion": shaped["chart_suggestion"],
                        "visualization": shaped["visualization"],
                        "rendering": rendering,
                    },
                    "summary": summary,
                    "metadata": {
                        "schema_tables": len(schema) if hasattr(schema, "__len__") else 0,
                        "mock_mode": self.mock_mode,
                        "llm_token_received": bool(copilot_token),
                        "result_intent": shaped["result_intent"],
                        "metadata_context": rendering.get("metadata_context", {}),
                        "routing_reason": "metadata_table_query",
                        "selected_metadata_strategy": "execute_information_schema_columns",
                        "resolved_table_candidate": resolved_table.get("table_name") or resolved_table.get("name") or resolved_table.get("table"),
                        "chosen_catalog": resolved_table.get("catalog"),
                        "chosen_schema": resolved_table.get("schema_name") or resolved_table.get("schema"),
                        "chosen_table": resolved_table.get("table_name") or resolved_table.get("name") or resolved_table.get("table"),
                        "generated_metadata_sql": sql,
                        "sql_execution_called": True,
                    },
                    "rendering": rendering,
                }

            if len(matches) > 1:
                return build_metadata_clarification_response(question, schema, query_context, matches)

            if is_metadata_followup:
                return await build_metadata_followup_response(
                    question=question,
                    schema=schema,
                    context=query_context,
                    session_metadata={"llm_token_received": bool(copilot_token)},
                )

            return build_metadata_clarification_response(
                question=question,
                schema=schema,
                context=query_context,
            )

        intent = await classify_intent(question, schema)
        logger.info(
            "Query routing | current_query=%s | previous_result_intent=%s | detected_intent=%s | reason=%s | selected_metadata_strategy=%s",
            question,
            (query_context or {}).get("previous_result_intent"),
            intent.get("intent") if isinstance(intent, dict) else intent,
            intent.get("reason") if isinstance(intent, dict) else "classified by pipeline",
            "not_metadata_followup",
        )
        print(
            "QUERY ROUTING DEBUG:",
            {
                "current_query": question,
                "previous_result_intent": (query_context or {}).get("previous_result_intent"),
                "detected_intent": intent,
                "routing_reason": intent.get("reason") if isinstance(intent, dict) else "classified by pipeline",
                "selected_metadata_strategy": "not_metadata_followup",
            },
        )

        followup_routing = classify_followup_routing(question, schema, query_context)
        logger.info(
            "Context routing gate | current_query=%s | routing_decision=%s | routing_confidence=%s | standalone_signals=%s | followup_signals=%s | previous_context_trust_score=%s | fuzzy_corrections_applied=%s | reason=%s",
            question,
            followup_routing.get("routing_decision"),
            followup_routing.get("routing_confidence"),
            followup_routing.get("standalone_signals"),
            followup_routing.get("followup_signals"),
            followup_routing.get("previous_context_trust_score"),
            followup_routing.get("generic_corrections_applied"),
            followup_routing.get("reason"),
        )
        print(
            "CONTEXT ROUTING DEBUG:",
            {
                "current_query": question,
                "routing_decision": followup_routing.get("routing_decision"),
                "routing_confidence": followup_routing.get("routing_confidence"),
                "standalone_signals": followup_routing.get("standalone_signals"),
                "followup_signals": followup_routing.get("followup_signals"),
                "previous_context_trust_score": followup_routing.get("previous_context_trust_score"),
                "fuzzy_corrections_applied": followup_routing.get("generic_corrections_applied"),
                "reason": followup_routing.get("reason"),
            },
        )

        if followup_routing.get("routing_decision") == "ambiguous_needs_clarification":
            return build_followup_clarification_response(
                question,
                schema,
                "I need a table or previous result before I can apply that filter. Choose a discovered table, then ask again.",
            )

        followup_resolution = None
        if followup_routing.get("routing_decision") == "contextual_followup":
            followup_resolution = resolve_followup_query(question, schema, query_context)

        if followup_resolution:
            if followup_resolution.get("status") == "clarification":
                return build_followup_clarification_response(
                    question,
                    schema,
                    "I can use the previous result, but multiple columns could match this filter. Which one should I use?",
                    followup_resolution.get("choices"),
                )

            sanity = sanity_check_followup_resolution(question, schema, query_context, followup_resolution, followup_routing)
            if not sanity["accepted"]:
                logger.info(
                    "Follow-up resolver SQL rejected | current_query=%s | resolver_sql_accepted=false | fallback_to_llm=true | reason=%s | generated_sql=%s",
                    question,
                    sanity["reason"],
                    followup_resolution.get("sql"),
                )
                print(
                    "FOLLOWUP SANITY DEBUG:",
                    {
                        "resolver_sql_accepted": False,
                        "fallback_to_llm": True,
                        "reason": sanity["reason"],
                        "generated_sql": followup_resolution.get("sql"),
                    },
                )
                followup_resolution = None

        if followup_resolution:
            sql = followup_resolution["sql"]
            selected = [
                {
                    "table": ".".join(
                        str(part)
                        for part in [
                            followup_resolution["table"].get("catalog"),
                            followup_resolution["table"].get("schema_name"),
                            followup_resolution["table"].get("table_name"),
                        ]
                        if part
                    ),
                    "catalog": followup_resolution["table"].get("catalog"),
                    "schema": followup_resolution["table"].get("schema_name"),
                    "table_name": followup_resolution["table"].get("table_name"),
                    "score": 1.0,
                    "reason": "previous successful query context",
                }
            ]
            validation = await validate_sql(sql, schema)
            logger.info(
                "Follow-up resolution | current_query=%s | normalized_query=%s | token_corrections=%s | confidence=%s | previous_context_used=true | resolved_table=%s | resolved_filters=%s | generated_sql=%s | validation=%s",
                question,
                followup_resolution.get("normalized_query"),
                followup_resolution.get("token_corrections"),
                followup_resolution.get("normalization_confidence"),
                selected[0]["table"],
                followup_resolution.get("filters"),
                sql,
                validation,
            )
            print(
                "FOLLOWUP QUERY DEBUG:",
                {
                    "current_query": question,
                    "normalized_query": followup_resolution.get("normalized_query"),
                    "token_corrections": followup_resolution.get("token_corrections"),
                    "confidence": followup_resolution.get("normalization_confidence"),
                    "previous_context_used": True,
                    "resolved_table": selected[0]["table"],
                    "resolved_filters": followup_resolution.get("filters"),
                    "generated_sql": sql,
                    "validation": validation,
                    "resolver_sql_accepted": True,
                    "fallback_to_llm": False,
                },
            )
            if not validation["valid"]:
                raise RuntimeError(f"SQL validation failed for context follow-up: {validation['errors']}")

            self.recent_sqls.append(sql)
            self.recent_sqls = self.recent_sqls[-3:]

            try:
                raw_rows = await self.executor.execute(sql)
            except Exception as exc:
                if is_connector_connection_failure(exc):
                    logger.warning(
                        "Execution failure category=connector_connection_failed | catalog=%s | generated_sql=%s | error=%s",
                        detect_catalog_from_sql(sql),
                        sql,
                        exc,
                    )
                    return build_connector_error_response(
                        sql,
                        exc,
                        catalog=detect_catalog_from_sql(sql),
                        validation=validation,
                    )
                raise

            shaped = shape_result(raw_rows, question=question, sql=sql, intent=intent)
            summary = await generate_summary(
                question=question,
                sql=sql,
                result=shaped,
                schema=schema,
                recent_sqls=self.recent_sqls,
            )
            return {
                "intent": {**intent, "followup_context_used": True} if isinstance(intent, dict) else intent,
                "result_intent": shaped["result_intent"],
                "selected_tables": selected,
                "sql": sql,
                "validation": validation,
                "execution": {
                    "rows": shaped["rows"],
                    "preview": shaped["preview_rows"],
                    "columns": shaped["columns"],
                    "chart_suggestion": shaped["chart_suggestion"],
                    "visualization": shaped["visualization"],
                    "rendering": shaped["rendering"],
                },
                "summary": summary,
                "metadata": {
                    "schema_tables": len(schema) if hasattr(schema, "__len__") else 0,
                    "mock_mode": self.mock_mode,
                    "llm_token_received": bool(copilot_token),
                    "result_intent": shaped["result_intent"],
                    "metadata_context": shaped["rendering"].get("metadata_context", {}),
                    "followup_context_used": True,
                    "resolved_filters": followup_resolution.get("filters"),
                },
                "rendering": shaped["rendering"],
            }

        logger.info(
            "Follow-up resolution | current_query=%s | previous_context_used=false | resolver_sql_accepted=false | fallback_to_llm=true | reason=%s",
            question,
            followup_routing.get("reason") or ("no previous SQL/table/filter match" if query_context else "no previous context"),
        )
        
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

            if is_connector_connection_failure(exc):
                logger.warning(
                    "Execution failure category=connector_connection_failed | catalog=%s | generated_sql=%s | error=%s",
                    detect_catalog_from_sql(sql),
                    sql,
                    exec_err,
                )
                return build_connector_error_response(
                    sql,
                    exc,
                    catalog=detect_catalog_from_sql(sql),
                    validation=validation,
                )

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
            try:
                raw_rows = await self.executor.execute(sql)
            except Exception as repaired_exc:
                if is_connector_connection_failure(repaired_exc):
                    logger.warning(
                        "Repaired execution failure category=connector_connection_failed | catalog=%s | generated_sql=%s | error=%s",
                        detect_catalog_from_sql(sql),
                        sql,
                        repaired_exc,
                    )
                    return build_connector_error_response(
                        sql,
                        repaired_exc,
                        catalog=detect_catalog_from_sql(sql),
                        validation=validation,
                    )
                raise

        shaped = shape_result(raw_rows, question=question, sql=sql, intent=intent)

        summary = await generate_summary(
            question=question,
            sql=sql,
            result=shaped,
            schema=schema,
            recent_sqls=self.recent_sqls,
        )

        rendering = shaped["rendering"]
        logger.info(
            "Result rendering selected | result_intent=%s | header=%s | template_source=%s",
            shaped["result_intent"],
            rendering.get("header") or rendering.get("title"),
            rendering.get("template_source"),
        )
        print(
            "RESULT RENDERING DEBUG:",
            {
                "result_intent": shaped["result_intent"],
                "header": rendering.get("header") or rendering.get("title"),
                "template_source": rendering.get("template_source"),
            },
        )

        response = {
            "intent": intent,
            "result_intent": shaped["result_intent"],
            "selected_tables": selected,
            "sql": sql,
            "validation": validation,
            "execution": {
                "rows": shaped["rows"],
                "preview": shaped["preview_rows"],
                "columns": shaped["columns"],
                "chart_suggestion": shaped["chart_suggestion"],
                "visualization": shaped["visualization"],
                "rendering": shaped["rendering"],
            },
            "summary": summary,
            "metadata": {
                "schema_tables": len(schema) if hasattr(schema, "__len__") else 0,
                "mock_mode": self.mock_mode,
                "llm_token_received": bool(copilot_token),
                "result_intent": shaped["result_intent"],
                "metadata_context": shaped["rendering"].get("metadata_context", {}),
            },
            "rendering": shaped["rendering"],
        }

        logger.info("NL-to-SQL pipeline completed")
        return response
