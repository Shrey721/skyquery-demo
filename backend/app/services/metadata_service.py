import logging
from collections import defaultdict
from sqlalchemy.orm import Session

from app.models.connection import TrinoConnectionRequest
from app.models.metadata import (
    CatalogMetadata,
    ColumnMetadata,
    DiscoveredCatalog,
    DiscoveredSchema,
    GlobalMetadata,
    SelectedSource,
    SelectedSourcesRequest,
    SchemaMetadata,
    SourceDiscoveryResponse,
    TableMetadata,
)
from app.services import connection_store, metadata_filter, redis_cache, trino_service

logger = logging.getLogger(__name__)


def _active_connection_request(db: Session) -> TrinoConnectionRequest:
    conn_req, source = connection_store.resolve_trino_connection_request(db)
    logger.info("Metadata discovery is using Trino connection source=%s", source)
    return conn_req


def _active_metadata_scope(conn_req: TrinoConnectionRequest) -> tuple[str | None, str | None]:
    catalog = (conn_req.default_catalog or "").strip() or None
    schema = (conn_req.default_schema or "").strip() or None
    if schema and not catalog:
        raise ValueError("An active schema requires an active catalog for metadata discovery.")
    return catalog, schema


def _validate_selected_sources_scope(
    selected_sources: list[SelectedSource],
    conn_req: TrinoConnectionRequest,
) -> None:
    active_catalog, active_schema = _active_metadata_scope(conn_req)
    for source in selected_sources:
        if active_catalog and source.catalog != active_catalog:
            raise ValueError(
                f"Selected catalog '{source.catalog}' is outside the active connection scope '{active_catalog}'."
            )
        if active_schema and source.schema != active_schema:
            raise ValueError(
                f"Selected schema '{source.schema}' is outside the active connection scope "
                f"'{active_catalog}.{active_schema}'."
            )


def _first_column(rows) -> list[str]:
    return [row[0] for row in rows if row and row[0]]


def _columns_from_describe(rows) -> list[ColumnMetadata]:
    columns: list[ColumnMetadata] = []
    for row in rows:
        if not row or not row[0]:
            continue

        name = row[0]
        data_type = row[1] if len(row) > 1 and row[1] else "unknown"
        nullable = True
        if len(row) > 2 and row[2] is not None:
            nullable = str(row[2]).upper() in {"YES", "TRUE", ""}

        columns.append(
            ColumnMetadata(
                name=name,
                data_type=data_type,
                is_nullable=nullable,
            )
        )
    return columns


def _normalize_selected_sources(selected_sources: list[SelectedSource]) -> list[SelectedSource]:
    grouped: dict[tuple[str, str], list[str]] = defaultdict(list)
    seen: dict[tuple[str, str], set[str]] = defaultdict(set)

    for source in selected_sources:
        catalog = source.catalog.strip()
        schema = source.schema.strip()
        if not catalog or not schema:
            continue

        key = (catalog, schema)
        for table in source.tables:
            table_name = str(table or "").strip()
            if table_name and table_name not in seen[key]:
                seen[key].add(table_name)
                grouped[key].append(table_name)

    normalized = [
        SelectedSource(catalog=catalog, schema=schema, tables=tables)
        for (catalog, schema), tables in grouped.items()
        if tables
    ]
    if not normalized:
        raise ValueError("Select at least one table for AI context.")
    return normalized


def discoverCatalogs(cur) -> list[str]:
    cur.execute("SHOW CATALOGS")
    return metadata_filter.filter_catalogs(_first_column(cur.fetchall()))


def discoverSchemas(cur, catalog: str) -> list[str]:
    cur.execute(f"SHOW SCHEMAS FROM {trino_service.quote_identifier(catalog)}")
    return metadata_filter.filter_schemas(catalog, _first_column(cur.fetchall()))


def discoverTables(cur, catalog: str, schema: str) -> list[str]:
    schema_ref = trino_service.qualified_name(catalog, schema)
    cur.execute(f"SHOW TABLES FROM {schema_ref}")
    return metadata_filter.filter_tables(catalog, schema, _first_column(cur.fetchall()))


def discover_catalogs(cur) -> list[str]:
    return discoverCatalogs(cur)


def discover_schemas(cur, catalog: str) -> list[str]:
    return discoverSchemas(cur, catalog)


def discover_tables(cur, catalog: str, schema: str) -> list[str]:
    return discoverTables(cur, catalog, schema)


def discover_sources(db: Session) -> SourceDiscoveryResponse:
    """
    Discover tables for the active connection scope without describing columns
    or caching LLM schema metadata. A connection with no configured catalog
    remains browsable so a user can make an initial source selection.
    """
    conn_req = _active_connection_request(db)
    active_catalog, active_schema = _active_metadata_scope(conn_req)
    sources: list[DiscoveredCatalog] = []
    discovery_errors: list[str] = []

    conn = trino_service.get_trino_connection(conn_req)
    cur = conn.cursor()

    if active_catalog:
        catalogs = [active_catalog]
    else:
        try:
            catalogs = discoverCatalogs(cur)
        except Exception as exc:
            raise Exception(f"Failed to discover catalogs from Trino: {exc}") from exc

    for catalog in catalogs:
        catalog_node = DiscoveredCatalog(catalog=catalog, schemas=[])
        sources.append(catalog_node)

        if active_catalog == catalog and active_schema:
            schemas = [active_schema]
        else:
            try:
                schemas = discoverSchemas(cur, catalog)
            except Exception as exc:
                message = f"Failed to discover schemas for catalog {catalog}: {exc}"
                logger.warning(message)
                discovery_errors.append(message)
                continue

        for schema in schemas:
            try:
                tables = discoverTables(cur, catalog, schema)
            except Exception as exc:
                message = f"Failed to discover tables for schema {catalog}.{schema}: {exc}"
                logger.warning(message)
                discovery_errors.append(message)
                tables = []

            catalog_node.schemas.append(DiscoveredSchema(schema=schema, tables=tables))

    logger.info(
        "Discovered Trino source tree: %s catalog(s), active_scope=%s.%s, %s non-fatal error(s)",
        len(sources),
        active_catalog or "*",
        active_schema or "*",
        len(discovery_errors),
    )
    return SourceDiscoveryResponse(sources=sources, discovery_errors=discovery_errors)


def save_selected_sources(request: SelectedSourcesRequest, db: Session | None = None) -> list[SelectedSource]:
    selected_sources = _normalize_selected_sources(request.selected_sources)
    if db is not None:
        _validate_selected_sources_scope(selected_sources, _active_connection_request(db))
    redis_cache.set_selected_sources(
        SelectedSourcesRequest(selected_sources=selected_sources).model_dump_json(by_alias=True)
    )
    redis_cache.clear_metadata()
    logger.info("Saved selected AI metadata scope with %s schema entries.", len(selected_sources))
    return selected_sources


def get_selected_sources() -> list[SelectedSource] | None:
    selected_json = redis_cache.get_selected_sources()
    if not selected_json:
        return None
    return SelectedSourcesRequest.model_validate_json(selected_json).selected_sources


def buildSelectedSchemaContext(db: Session, selected_sources: list[SelectedSource] | None = None) -> GlobalMetadata:
    selected_sources = _normalize_selected_sources(selected_sources or get_selected_sources() or [])
    conn_req = _active_connection_request(db)
    _validate_selected_sources_scope(selected_sources, conn_req)
    metadata = GlobalMetadata()

    conn = trino_service.get_trino_connection(conn_req)
    cur = conn.cursor()

    for source in selected_sources:
        catalog_meta = metadata.catalogs.setdefault(source.catalog, CatalogMetadata())
        schema_meta = catalog_meta.schemas.setdefault(source.schema, SchemaMetadata())

        for table in source.tables:
            table_ref = trino_service.qualified_name(source.catalog, source.schema, table)
            try:
                cur.execute(f"DESCRIBE {table_ref}")
                columns = _columns_from_describe(cur.fetchall())
            except Exception as exc:
                message = f"Failed to describe selected table {source.catalog}.{source.schema}.{table}: {exc}"
                logger.warning(message)
                metadata.discovery_errors.append(message)
                columns = []

            table_meta = TableMetadata(
                catalog=source.catalog,
                schema_name=source.schema,
                table_name=table,
                columns=columns,
                row_count=None,
            )
            schema_meta.tables[table] = table_meta
            metadata.tables.append(table_meta)

    redis_cache.set_metadata(metadata.model_dump_json())
    logger.info(
        "Built selected schema context: %s table(s), %s non-fatal error(s)",
        len(metadata.tables),
        len(metadata.discovery_errors),
    )
    return metadata


def build_selected_schema_context(db: Session, selected_sources: list[SelectedSource] | None = None) -> GlobalMetadata:
    return buildSelectedSchemaContext(db, selected_sources)


def discover_and_cache_metadata(db: Session) -> GlobalMetadata:
    """
    Discover metadata within the active connection catalog/schema scope. If no
    active scope has been configured, discovery remains broad for onboarding.
    """
    conn_req = _active_connection_request(db)
    active_catalog, active_schema = _active_metadata_scope(conn_req)
    metadata = GlobalMetadata()

    conn = trino_service.get_trino_connection(conn_req)
    cur = conn.cursor()

    if active_catalog:
        catalogs = [active_catalog]
    else:
        try:
            cur.execute("SHOW CATALOGS")
            catalogs = metadata_filter.filter_catalogs(_first_column(cur.fetchall()))
        except Exception as exc:
            raise Exception(f"Failed to discover catalogs from Trino: {exc}") from exc

    for catalog in catalogs:
        catalog_meta = CatalogMetadata()
        metadata.catalogs[catalog] = catalog_meta

        if active_catalog == catalog and active_schema:
            schemas = [active_schema]
        else:
            try:
                cur.execute(f"SHOW SCHEMAS FROM {trino_service.quote_identifier(catalog)}")
                schemas = metadata_filter.filter_schemas(catalog, _first_column(cur.fetchall()))
            except Exception as exc:
                message = f"Failed to discover schemas for catalog {catalog}: {exc}"
                logger.warning(message)
                metadata.discovery_errors.append(message)
                continue

        for schema in schemas:
            schema_meta = SchemaMetadata()
            catalog_meta.schemas[schema] = schema_meta
            schema_ref = trino_service.qualified_name(catalog, schema)

            try:
                cur.execute(f"SHOW TABLES FROM {schema_ref}")
                tables = metadata_filter.filter_tables(catalog, schema, _first_column(cur.fetchall()))
            except Exception as exc:
                message = f"Failed to discover tables for schema {catalog}.{schema}: {exc}"
                logger.warning(message)
                metadata.discovery_errors.append(message)
                continue

            for table in tables:
                table_ref = trino_service.qualified_name(catalog, schema, table)
                try:
                    cur.execute(f"DESCRIBE {table_ref}")
                    columns = _columns_from_describe(cur.fetchall())
                except Exception as exc:
                    message = f"Failed to describe table {catalog}.{schema}.{table}: {exc}"
                    logger.warning(message)
                    metadata.discovery_errors.append(message)
                    columns = []

                table_meta = TableMetadata(
                    catalog=catalog,
                    schema_name=schema,
                    table_name=table,
                    columns=columns,
                    row_count=None,
                )
                schema_meta.tables[table] = table_meta
                metadata.tables.append(table_meta)

    redis_cache.set_metadata(metadata.model_dump_json())
    logger.info(
        "Discovered Trino metadata: %s catalog(s), %s table(s), %s non-fatal error(s)",
        len(metadata.catalogs),
        len(metadata.tables),
        len(metadata.discovery_errors),
    )
    return metadata


def get_cached_metadata() -> GlobalMetadata | None:
    cached_json = redis_cache.get_metadata()
    if cached_json:
        return GlobalMetadata.model_validate_json(cached_json)
    return None
