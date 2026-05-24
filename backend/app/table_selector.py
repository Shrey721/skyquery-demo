import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)


async def select_tables(
    question: str,
    schema: Dict[str, Any],
    intent: Dict[str, Any] | None = None
) -> List[Dict[str, Any]]:
    """
    Select top relevant tables from schema metadata.
    MVP version uses keyword overlap.
    """
    q = question.lower()
    tables = schema.get("tables", schema)

    selected = []

    for table_name, table_meta in tables.items():
        columns = table_meta.get("columns", [])
        if isinstance(columns, dict):
            columns = list(columns.keys())

        score = 0.0
        reasons = []

        if table_name.lower() in q:
            score += 0.5
            reasons.append("table name matched question")

        for col in columns:
            col_l = str(col).lower()
            if col_l in q:
                score += 0.2
                reasons.append(f"column matched: {col}")

        if score > 0:
            selected.append({
                "table": table_name,
                "score": round(min(score, 1.0), 2),
                "reason": "; ".join(reasons) or "keyword match"
            })

    selected = sorted(selected, key=lambda x: x["score"], reverse=True)[:3]

    logger.info("Selected tables: %s", selected)
    return selected
