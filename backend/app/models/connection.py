from typing import Optional
from pydantic import AliasChoices, BaseModel, Field
from sqlalchemy import Column, Integer, String, Boolean
from sqlalchemy.orm import declarative_base

Base = declarative_base()

# --- SQLAlchemy DB Models ---

class ConnectionRecord(Base):
    __tablename__ = "connections"

    id = Column(Integer, primary_key=True, index=True)
    host = Column(String, nullable=False)
    port = Column(Integer, nullable=False)
    default_catalog = Column("catalog", String, nullable=False, default="")
    default_schema = Column("schema_name", String, nullable=False, default="")
    username = Column(String, nullable=False)
    encrypted_password = Column(String, nullable=True)
    ssl_enabled = Column(Boolean, default=False)
    is_active = Column(Boolean, default=False)

    @property
    def catalog(self) -> str:
        return self.default_catalog

    @catalog.setter
    def catalog(self, value: str) -> None:
        self.default_catalog = value or ""

    @property
    def schema_name(self) -> str:
        return self.default_schema

    @schema_name.setter
    def schema_name(self, value: str) -> None:
        self.default_schema = value or ""

# --- Pydantic Models for API ---

class TrinoConnectionRequest(BaseModel):
    host: str = Field(..., description="Trino coordinator hostname")
    port: int = Field(..., description="Trino coordinator port")
    default_catalog: Optional[str] = Field(
        None,
        alias="catalog",
        validation_alias=AliasChoices("default_catalog", "catalog"),
        description="Optional active catalog for query context and default metadata discovery scope.",
    )
    default_schema: Optional[str] = Field(
        None,
        alias="schema",
        validation_alias=AliasChoices("default_schema", "schema", "schema_name"),
        description="Optional active schema for query context and default metadata discovery scope.",
    )
    username: str = Field(..., description="Trino username")
    password: Optional[str] = Field(None, description="Trino password or token")
    ssl_enabled: bool = Field(False, alias="ssl", description="Use SSL for connection")

    class Config:
        populate_by_name = True

    @property
    def catalog(self) -> str:
        return self.default_catalog or ""

    @property
    def schema_name(self) -> str:
        return self.default_schema or ""


class TrinoConnectionResponse(BaseModel):
    id: Optional[int] = None
    host: str
    port: int
    default_catalog: Optional[str] = ""
    default_schema: Optional[str] = ""
    username: str
    ssl_enabled: bool
    is_active: bool

    class Config:
        from_attributes = True

    @property
    def catalog(self) -> str:
        return self.default_catalog or ""

    @property
    def schema_name(self) -> str:
        return self.default_schema or ""
