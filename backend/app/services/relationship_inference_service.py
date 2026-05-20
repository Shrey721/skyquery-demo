from typing import Dict, Any, List
import logging

logger = logging.getLogger(__name__)

def infer_relationships(schema: Any, selected_tables: List[str] = None) -> List[Dict[str, str]]:
    """
    Infers potential foreign key relationships between tables based on column naming conventions.
    Returns a list of dicts: {"source_table": "A", "source_column": "x", "target_table": "B", "target_column": "y"}
    """
    relationships = []
    if not schema:
        return relationships
        
    tables = []
    if hasattr(schema, 'tables'):
        tables = schema.tables
    elif isinstance(schema, dict) and "tables" in schema:
        tables = schema["tables"]
    elif isinstance(schema, list):
        tables = schema
        
    # If selected_tables is provided, only infer relationships between those tables.
    # Otherwise infer across all.
    if selected_tables:
        tables = [t for t in tables if _get_table_name(t) in selected_tables]

    for i in range(len(tables)):
        for j in range(i + 1, len(tables)):
            table_a = tables[i]
            table_b = tables[j]
            
            name_a = _get_table_name(table_a)
            name_b = _get_table_name(table_b)
            base_name_a = name_a.split(".")[-1]
            base_name_b = name_b.split(".")[-1]
            
            cols_a = _get_columns(table_a)
            cols_b = _get_columns(table_b)
            
            # Rule 1: Exact column name match (e.g., customer_id == customer_id)
            # Ignoring generic names like 'id', 'name', 'code', 'status' which might falsely link.
            ignore_exact = {"id", "name", "code", "status", "type", "created_at", "updated_at", "description"}
            for col_a in cols_a:
                for col_b in cols_b:
                    if col_a == col_b and col_a.lower() not in ignore_exact:
                        relationships.append({
                            "source_table": name_a,
                            "source_column": col_a,
                            "target_table": name_b,
                            "target_column": col_b,
                            "reason": "exact column name match"
                        })
            
            # Rule 2: tableA.id == tableB.tableA_id
            for col_a in cols_a:
                if col_a.lower() == "id":
                    expected_fk = f"{base_name_a.rstrip('s').lower()}_id"
                    for col_b in cols_b:
                        if col_b.lower() == expected_fk:
                            relationships.append({
                                "source_table": name_a,
                                "source_column": col_a,
                                "target_table": name_b,
                                "target_column": col_b,
                                "reason": f"standard foreign key pattern ({expected_fk})"
                            })
                            
            # Rule 3: tableB.id == tableA.tableB_id
            for col_b in cols_b:
                if col_b.lower() == "id":
                    expected_fk = f"{base_name_b.rstrip('s').lower()}_id"
                    for col_a in cols_a:
                        if col_a.lower() == expected_fk:
                            relationships.append({
                                "source_table": name_b,
                                "source_column": col_b,
                                "target_table": name_a,
                                "target_column": col_a,
                                "reason": f"standard foreign key pattern ({expected_fk})"
                            })

            # Rule 4: Value overlap matching
            cols_a_meta = _get_columns_with_samples(table_a)
            cols_b_meta = _get_columns_with_samples(table_b)
            for ca in cols_a_meta:
                for cb in cols_b_meta:
                    if not ca["samples"] or not cb["samples"]:
                        continue
                    # Ignore common generic fields with short overlaps like booleans or small categories
                    if ca["name"].lower() in {"status", "type", "country"} or cb["name"].lower() in {"status", "type", "country"}:
                        continue
                    overlap = set(ca["samples"]).intersection(set(cb["samples"]))
                    if len(overlap) >= 2:
                        relationships.append({
                            "source_table": name_a,
                            "source_column": ca["name"],
                            "target_table": name_b,
                            "target_column": cb["name"],
                            "reason": f"value overlap detected: {list(overlap)[:3]}"
                        })

    if relationships:
        logger.info(f"Inferred {len(relationships)} relationships dynamically.")

    return relationships

def _get_table_name(table: Any) -> str:
    if hasattr(table, 'table_name'):
        if getattr(table, "catalog", None) and getattr(table, "schema_name", None):
            return f"{table.catalog}.{table.schema_name}.{table.table_name}"
        return table.table_name
    catalog = table.get("catalog")
    schema_name = table.get("schema_name")
    table_name = table.get("table_name") or table.get("name") or table.get("table", "")
    if catalog and schema_name and table_name:
        return f"{catalog}.{schema_name}.{table_name}"
    return table_name

def _get_columns(table: Any) -> List[str]:
    cols = []
    columns = table.columns if hasattr(table, 'columns') else table.get("columns", [])
    for col in columns:
        col_name = col.name if hasattr(col, 'name') else (col.get("name") or col.get("column", ""))
        if col_name:
            cols.append(col_name)
    return cols

def _get_columns_with_samples(table: Any) -> List[Dict[str, Any]]:
    cols = []
    columns = table.columns if hasattr(table, 'columns') else table.get("columns", [])
    for col in columns:
        col_name = col.name if hasattr(col, 'name') else (col.get("name") or col.get("column", ""))
        sample_values = col.sample_values if hasattr(col, 'sample_values') else col.get("sample_values", [])
        if col_name:
            cols.append({
                "name": col_name,
                "samples": [str(s).strip().upper() for s in sample_values if s is not None]
            })
    return cols
