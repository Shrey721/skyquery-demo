import logging
from sqlalchemy.orm import Session

from app.models.connection import TrinoConnectionRequest
from app.models.metadata import (
    CatalogMetadata,
    ColumnMetadata,
    GlobalMetadata,
    SchemaMetadata,
    TableMetadata,
)
from app.services import connection_store, metadata_filter, redis_cache, trino_service

logger = logging.getLogger(__name__)


def _active_connection_request(db: Session) -> TrinoConnectionRequest:
    active_conn = connection_store.get_active_connection(db)
    if not active_conn:
        raise ValueError("No active Trino connection found.")

    return TrinoConnectionRequest(
        host=active_conn.host,
        port=active_conn.port,
        default_catalog=active_conn.default_catalog,
        default_schema=active_conn.default_schema,
        username=active_conn.username,
        password=connection_store.decrypt_password(active_conn.encrypted_password),
        ssl=active_conn.ssl_enabled,
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


def discover_and_cache_metadata(db: Session) -> GlobalMetadata:
    """
    Discover all accessible catalogs, schemas, tables, and columns from one Trino
    endpoint. The default catalog/schema are used only as connection context.
    """
    conn_req = _active_connection_request(db)
    metadata = GlobalMetadata()

    conn = trino_service.get_trino_connection(conn_req)
    cur = conn.cursor()

    try:
        cur.execute("SHOW CATALOGS")
        catalogs = metadata_filter.filter_catalogs(_first_column(cur.fetchall()))
    except Exception as exc:
        raise Exception(f"Failed to discover catalogs from Trino: {exc}") from exc

    for catalog in catalogs:
        catalog_meta = CatalogMetadata()
        metadata.catalogs[catalog] = catalog_meta

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
