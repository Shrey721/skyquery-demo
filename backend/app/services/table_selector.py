import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)


def normalize_tables(schema: Any) -> Dict[str, Any]:
    if not schema:
        return {}

    if isinstance(schema, dict):
        catalogs = schema.get("catalogs")
        if isinstance(catalogs, dict):
            normalized = {}
            for catalog_name, catalog_meta in catalogs.items():
                schemas = (catalog_meta or {}).get("schemas", {})
                if not isinstance(schemas, dict):
                    continue
                for schema_name, schema_meta in schemas.items():
                    tables = (schema_meta or {}).get("tables", {})
                    if not isinstance(tables, dict):
                        continue
                    for table_name, table_meta in tables.items():
                        if not isinstance(table_meta, dict):
                            continue
                        qualified = f"{catalog_name}.{schema_name}.{table_name}"
                        normalized[qualified] = {
                            **table_meta,
                            "catalog": table_meta.get("catalog") or catalog_name,
                            "schema_name": table_meta.get("schema_name") or schema_name,
                            "table_name": table_meta.get("table_name") or table_name,
                            "qualified_name": qualified,
                        }
            if normalized:
                return normalized

        tables = schema.get("tables", schema)

        if isinstance(tables, dict):
            return tables

        if isinstance(tables, list):
            normalized = {}
            for table in tables:
                if not isinstance(table, dict):
                    continue

                name = (
                    table.get("name")
                    or table.get("table")
                    or table.get("table_name")
                )

                if name:
                    qualified = (
                        table.get("qualified_name")
                        or (
                            f"{table.get('catalog')}.{table.get('schema_name')}.{name}"
                            if table.get("catalog") and table.get("schema_name")
                            else name
                        )
                    )
                    normalized[qualified] = {**table, "qualified_name": qualified}

            return normalized

    if isinstance(schema, list):
        normalized = {}
        for table in schema:
            if not isinstance(table, dict):
                continue

            name = (
                table.get("name")
                or table.get("table")
                or table.get("table_name")
            )

            if name:
                qualified = (
                    table.get("qualified_name")
                    or (
                        f"{table.get('catalog')}.{table.get('schema_name')}.{name}"
                        if table.get("catalog") and table.get("schema_name")
                        else name
                    )
                )
                normalized[qualified] = {**table, "qualified_name": qualified}

        return normalized

    return {}


async def select_tables(
    question: str,
    schema: Dict[str, Any],
    intent: Dict[str, Any] | None = None,
    recent_sqls: list | None = None,
    history: list | None = None,
    matched_entities: list | None = None,
    **kwargs
) -> List[Dict[str, Any]]:

    tables = normalize_tables(schema)

    if not tables:
        return [{
            "table": "unknown",
            "score": 0.5,
            "reason": "fallback table because schema metadata was empty"
        }]

    q = question.lower()
    selected = []
    matched_entities = matched_entities or []
    
    # Pre-calculate which tables had matched entities
    table_entity_hits = {}
    for me in matched_entities:
        t_name = me.get("table")
        if t_name:
            if t_name not in table_entity_hits:
                table_entity_hits[t_name] = []
            table_entity_hits[t_name].append(me)

    import re
    raw_scores = {}
    score_reasons = {}

    for table_name, table_meta in tables.items():
        score = 0.0
        reasons = []

        columns = table_meta.get("columns", []) if isinstance(table_meta, dict) else []

        if isinstance(columns, dict):
            columns = list(columns.keys())

        catalog_name = table_meta.get("catalog", "") if isinstance(table_meta, dict) else ""
        schema_name = table_meta.get("schema_name", "") if isinstance(table_meta, dict) else ""
        raw_table_name = table_meta.get("table_name", table_name) if isinstance(table_meta, dict) else table_name

        # Tokenize catalog, schema, and table names against question words.
        table_parts = re.split(r'[-_\.]', f"{catalog_name}.{schema_name}.{raw_table_name}".lower())
        for part in table_parts:
            if len(part) > 2:
                for word in q.split():
                    word_clean = word.strip(",.!?\"'")
                    if len(word_clean) > 2 and (part in word_clean or word_clean in part):
                        score += 0.3
                        reasons.append(f"table part '{part}' matched '{word_clean}'")
                        break

        # Tokenize column names
        for col in columns:
            if isinstance(col, dict):
                col_name = (
                    col.get("name")
                    or col.get("column")
                    or col.get("column_name")
                    or ""
                )
            else:
                col_name = str(col)

            col_parts = re.split(r'[-_]', col_name.lower())
            for part in col_parts:
                if len(part) > 2:
                    for word in q.split():
                        word_clean = word.strip(",.!?\"'")
                        if len(word_clean) > 2 and (part in word_clean or word_clean in part):
                            score += 0.15
                            reasons.append(f"column part '{part}' matched '{word_clean}'")
                            break

        # Boost score if we found matching entities in sample data for this table
        if table_name in table_entity_hits:
            hits = table_entity_hits[table_name]
            score += 0.5 * len(hits)
            for hit in hits:
                reasons.append(f"entity matched in {hit.get('column')}: {hit.get('entity')}")

        raw_scores[table_name] = score
        score_reasons[table_name] = reasons

    # Boost tables that have inferred relationships with highly-scored tables
    from app.services.relationship_inference_service import infer_relationships
    relationships = infer_relationships(schema)
    
    boosted_scores = raw_scores.copy()
    for rel in relationships:
        t1, t2 = rel["source_table"], rel["target_table"]
        if raw_scores.get(t1, 0) >= 0.4 and raw_scores.get(t2, 0) < 0.35:
            boosted_scores[t2] = 0.35
            score_reasons[t2].append(f"boosted via relationship with {t1}")
        elif raw_scores.get(t2, 0) >= 0.4 and raw_scores.get(t1, 0) < 0.35:
            boosted_scores[t1] = 0.35
            score_reasons[t1].append(f"boosted via relationship with {t2}")

    for table_name, score in boosted_scores.items():
        if score > 0:
            selected_meta = tables.get(table_name, {})
            selected.append({
                "table": table_name,
                "catalog": selected_meta.get("catalog") if isinstance(selected_meta, dict) else None,
                "schema": selected_meta.get("schema_name") if isinstance(selected_meta, dict) else None,
                "table_name": selected_meta.get("table_name") if isinstance(selected_meta, dict) else table_name,
                "score": min(round(score, 2), 1.0),
                "reason": "; ".join(score_reasons[table_name])
            })

    selected = sorted(selected, key=lambda x: x["score"], reverse=True)[:3]

    if not selected:
        first_table = list(tables.keys())[0]
        selected = [{
            "table": first_table,
            "score": 0.1,
            "reason": "fallback selection"
        }]

    logger.info("Selected tables: %s", selected)
    return selected
