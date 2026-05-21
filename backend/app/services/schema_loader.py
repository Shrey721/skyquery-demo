import os
import json
import logging
from typing import Optional, Dict, Any
from app.services.redis_cache import get_metadata, get_selected_sources

logger = logging.getLogger(__name__)

def load_schema() -> Optional[Dict[str, Any]]:
    """Load schema metadata from Redis cache.

    Returns a dict mapping table names to list of column names, or ``None``
    if the cache is empty or malformed.
    """
    if not get_selected_sources():
        logger.warning("No selected data source scope found in Redis.")
        return None

    schema_json = get_metadata()
    if not schema_json:
        logger.warning("No schema metadata found in Redis.")
        return None
    try:
        schema = json.loads(schema_json)
        logger.debug("Loaded schema with %d tables.", len(schema))
        return schema
    except Exception as e:
        logger.exception("Failed to parse schema JSON: %s", e)
        return None
