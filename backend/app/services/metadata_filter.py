import logging
from collections.abc import Iterable

from app.core.config import settings

logger = logging.getLogger(__name__)


def _normalize_name(value: str) -> str:
    return str(value or "").strip().lower()


def _parse_names(value: str) -> set[str]:
    return {_normalize_name(item) for item in str(value or "").split(",") if item.strip()}


def _excluded_catalogs() -> set[str]:
    return _parse_names(settings.METADATA_EXCLUDED_CATALOGS)


def _excluded_schemas() -> set[str]:
    return _parse_names(settings.METADATA_EXCLUDED_SCHEMAS)


def _excluded_tables() -> set[str]:
    return _parse_names(settings.METADATA_EXCLUDED_TABLES)


def _debug(message: str, *args) -> None:
    if settings.METADATA_FILTER_DEBUG:
        logger.info(message, *args)


def is_system_catalog(catalog: str) -> bool:
    return _normalize_name(catalog) in _excluded_catalogs()


def is_system_schema(schema: str) -> bool:
    return _normalize_name(schema) in _excluded_schemas()


def is_system_table(schema: str, table: str) -> bool:
    return is_system_schema(schema) and _normalize_name(table) in _excluded_tables()


def filter_catalogs(catalogs: Iterable[str]) -> list[str]:
    visible: list[str] = []
    for catalog in catalogs:
        if is_system_catalog(catalog):
            _debug("Filtered system catalog: %s", catalog)
            continue
        visible.append(catalog)
    return visible


def filter_schemas(catalog: str, schemas: Iterable[str]) -> list[str]:
    visible: list[str] = []
    for schema in schemas:
        if is_system_schema(schema):
            _debug("Filtered system schema: %s.%s", catalog, schema)
            continue
        visible.append(schema)
    return visible


def filter_tables(catalog: str, schema: str, tables: Iterable[str]) -> list[str]:
    visible: list[str] = []
    for table in tables:
        if is_system_table(schema, table):
            _debug("Filtered system table: %s.%s.%s", catalog, schema, table)
            continue
        visible.append(table)
    return visible
