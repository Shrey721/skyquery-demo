import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.services import metadata_filter


def test_default_filter_hides_only_obvious_system_metadata():
    catalogs = metadata_filter.filter_catalogs(["system", "sales_catalog", "lakehouse"])
    assert catalogs == ["sales_catalog", "lakehouse"]

    schemas = metadata_filter.filter_schemas(
        "any_catalog",
        ["information_schema", "pg_catalog", "public", "analytics", "sys"],
    )
    assert schemas == ["public", "analytics"]

    internal_tables = metadata_filter.filter_tables(
        "any_catalog",
        "information_schema",
        ["tables", "columns", "applicable_roles", "business_orders"],
    )
    assert internal_tables == ["business_orders"]

    business_tables = metadata_filter.filter_tables(
        "any_catalog",
        "analytics",
        ["views", "tables", "business_events"],
    )
    assert business_tables == ["views", "tables", "business_events"]


if __name__ == "__main__":
    test_default_filter_hides_only_obvious_system_metadata()
    print("Metadata filter tests passed.")
