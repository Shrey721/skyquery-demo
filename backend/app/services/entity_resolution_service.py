import re
from typing import Dict, Any, List
import logging

logger = logging.getLogger(__name__)

def extract_entities(question: str, schema: Any) -> List[Dict[str, Any]]:
    """
    Extracts entities from the natural language question by matching words
    against the cached sample values in the schema metadata.
    """
    matched_entities = []
    if not schema:
        return matched_entities

    question_lower = question.lower()
    
    # Handle both object and dict-based schemas
    tables = []
    if hasattr(schema, 'tables'):
        tables = schema.tables
    elif isinstance(schema, dict) and "tables" in schema:
        tables = schema["tables"]
    elif isinstance(schema, list):
        tables = schema

    for table in tables:
        table_name = table.table_name if hasattr(table, 'table_name') else (table.get("table_name") or table.get("name") or table.get("table", ""))
        catalog = table.catalog if hasattr(table, 'catalog') else table.get("catalog")
        schema_name = table.schema_name if hasattr(table, 'schema_name') else table.get("schema_name")
        qualified_name = f"{catalog}.{schema_name}.{table_name}" if catalog and schema_name and table_name else table_name
        columns = table.columns if hasattr(table, 'columns') else table.get("columns", [])
        
        for col in columns:
            col_name = col.name if hasattr(col, 'name') else (col.get("name") or col.get("column", ""))
            sample_values = col.sample_values if hasattr(col, 'sample_values') else col.get("sample_values", [])
            
            if not sample_values:
                continue

            for sample in sample_values:
                sample_lower = str(sample).lower()
                
                # Ignore very short strings to avoid false positives on common words
                if len(sample_lower) <= 2:
                    continue
                    
                pattern = r'\b' + re.escape(sample_lower) + r'\b'
                if re.search(pattern, question_lower):
                    matched_entities.append({
                        "entity": sample,
                        "table": qualified_name,
                        "column": col_name
                    })

    if matched_entities:
        logger.info(f"Discovered entities from sample data: {matched_entities}")
        
    return matched_entities
