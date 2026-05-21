from typing import Any, Dict
import re

FORBIDDEN = ["DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "TRUNCATE", "CREATE"]


def _strip_identifier_quotes(value: str) -> str:
    return ".".join(part.strip().strip('"') for part in value.split("."))


def _allowed_tables(schema: Dict[str, Any] | None) -> set[str]:
    if not isinstance(schema, dict):
        return set()

    allowed = set()
    for table in schema.get("tables", []):
        if not isinstance(table, dict):
            continue
        catalog = table.get("catalog")
        schema_name = table.get("schema_name")
        table_name = table.get("table_name") or table.get("name") or table.get("table")
        if catalog and schema_name and table_name:
            allowed.add(f"{catalog}.{schema_name}.{table_name}".lower())
    return allowed


def _referenced_tables(sql: str) -> list[str]:
    refs = []
    pattern = re.compile(r"\b(?:FROM|JOIN)\s+([\"A-Za-z0-9_][\"A-Za-z0-9_.$-]*)", re.IGNORECASE)
    for match in pattern.finditer(sql):
        ref = match.group(1).strip().rstrip(",;")
        if ref.startswith("("):
            continue
        refs.append(_strip_identifier_quotes(ref))
    return refs


async def validate_sql(sql: str, schema: Dict[str, Any] | None = None) -> Dict[str, Any]:
    if not sql or not isinstance(sql, str):
        return {"valid": False, "is_valid": False, "errors": ["SQL is empty"]}

    cleaned = sql.strip()
    upper = cleaned.upper()

    if not upper.startswith("SELECT"):
        return {"valid": False, "is_valid": False, "errors": ["Only SELECT queries are allowed"]}

    for word in FORBIDDEN:
        if re.search(rf"\b{word}\b", upper):
            return {"valid": False, "is_valid": False, "errors": [f"Forbidden SQL keyword used: {word}"]}

    if cleaned.count(";") > 1:
        return {"valid": False, "is_valid": False, "errors": ["Multiple SQL statements are not allowed"]}

    allowed_tables = _allowed_tables(schema)
    if allowed_tables:
        for ref in _referenced_tables(cleaned):
            parts = [part for part in ref.split(".") if part]
            if len(parts) != 3:
                return {
                    "valid": False,
                    "is_valid": False,
                    "errors": ["All table references must use fully qualified table names: catalog.schema.table"],
                }
            if ref.lower() not in allowed_tables:
                return {
                    "valid": False,
                    "is_valid": False,
                    "errors": [
                        "The query references tables outside the selected data sources. The selected data sources do not contain enough information."
                    ],
                }

    return {"valid": True, "is_valid": True, "errors": []}
