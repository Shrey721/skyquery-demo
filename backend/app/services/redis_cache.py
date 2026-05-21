import redis
import json
from typing import Optional
from app.core.config import settings

# Global Redis Client
redis_client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)

SCHEMA_CACHE_KEY = "skyquery:metadata:schema"
SELECTED_SOURCES_KEY = "skyquery:metadata:selected_sources"
SCHEMA_CACHE_TTL = settings.METADATA_CACHE_TTL_SECONDS

def set_metadata(metadata_json: str):
    """
    Saves metadata JSON to Redis with a TTL.
    """
    redis_client.setex(SCHEMA_CACHE_KEY, SCHEMA_CACHE_TTL, metadata_json)

def get_metadata() -> Optional[str]:
    """
    Retrieves metadata JSON from Redis.
    """
    return redis_client.get(SCHEMA_CACHE_KEY)

def clear_metadata():
    """
    Removes cached metadata from Redis.
    Called when connection is reset or fails to prevent stale data.
    """
    redis_client.delete(SCHEMA_CACHE_KEY)


def set_selected_sources(selected_sources_json: str):
    """
    Saves the selected catalog/schema/table scope to Redis with the metadata TTL.
    """
    redis_client.setex(SELECTED_SOURCES_KEY, SCHEMA_CACHE_TTL, selected_sources_json)


def get_selected_sources() -> Optional[str]:
    """
    Retrieves the selected catalog/schema/table scope from Redis.
    """
    return redis_client.get(SELECTED_SOURCES_KEY)


def clear_selected_sources():
    """
    Removes the selected source scope.
    """
    redis_client.delete(SELECTED_SOURCES_KEY)
