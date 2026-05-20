from typing import Dict, List, Optional
from pydantic import BaseModel, Field

class ColumnMetadata(BaseModel):
    name: str = Field(..., description="Column name")
    data_type: str = Field(..., description="Data type of the column")
    is_nullable: bool = Field(..., description="Whether the column can contain null values")
    sample_values: Optional[List[str]] = Field(default_factory=list, description="Sample of distinct values from the column")

class TableMetadata(BaseModel):
    catalog: str = Field(..., description="Catalog name")
    schema_name: str = Field(..., description="Schema name")
    table_name: str = Field(..., description="Table name")
    columns: List[ColumnMetadata] = Field(default_factory=list, description="List of columns in the table")
    row_count: Optional[int] = Field(None, description="Estimated row count from stats")

    @property
    def qualified_name(self) -> str:
        return f"{self.catalog}.{self.schema_name}.{self.table_name}"

class SchemaMetadata(BaseModel):
    tables: Dict[str, TableMetadata] = Field(default_factory=dict, description="Tables keyed by table name")


class CatalogMetadata(BaseModel):
    schemas: Dict[str, SchemaMetadata] = Field(default_factory=dict, description="Schemas keyed by schema name")


class GlobalMetadata(BaseModel):
    catalogs: Dict[str, CatalogMetadata] = Field(default_factory=dict, description="Catalogs keyed by catalog name")
    tables: List[TableMetadata] = Field(default_factory=list, description="Flattened compatibility view of all tables")
    discovery_errors: List[str] = Field(default_factory=list, description="Non-fatal metadata discovery errors")
