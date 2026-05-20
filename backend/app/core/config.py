from pydantic_settings import BaseSettings
import os
from cryptography.fernet import Fernet

class Settings(BaseSettings):
    PROJECT_NAME: str = "SkyQuery API"
    API_V1_STR: str = "/api/v1"
    
    FRONTEND_URL: str = "http://localhost:3000"
    GITHUB_CLIENT_ID: str = "Ov23li3PpGvLpdol3czz"
    GITHUB_CLIENT_SECRET: str = "974b4891cd845c5da363ae5b11f98826cdb9aa45"
    GITHUB_COPILOT_MODEL: str = os.getenv("GITHUB_COPILOT_MODEL", "gpt-4")
    GITHUB_COPILOT_TOKEN_ENDPOINT: str = os.getenv("GITHUB_COPILOT_TOKEN_ENDPOINT", "https://api.github.com/copilot_internal/v2/token")
    
    # Secret key for encrypting passwords. Generates a random one if not provided.
    # In production, this MUST be passed as an environment variable to persist across restarts.
    SECRET_KEY: str = os.getenv("SECRET_KEY", Fernet.generate_key().decode("utf-8"))
    
    # SQLite Database URL
    DATABASE_URL: str = "sqlite:///./connections.db"
    
    # Redis URL
    REDIS_URL: str = "redis://localhost:6379/0"
    METADATA_CACHE_TTL_SECONDS: int = int(os.getenv("METADATA_CACHE_TTL_SECONDS", "86400"))
    METADATA_EXCLUDED_CATALOGS: str = "system"
    METADATA_EXCLUDED_SCHEMAS: str = (
        "information_schema,pg_catalog,pg_toast,sys,performance_schema,mysql,"
        "auth,storage,realtime,vault,extensions,graphql,graphql_public,"
        "internal,metadata"
    )
    METADATA_EXCLUDED_TABLES: str = (
        "tables,columns,views,schemata,applicable_roles,enabled_roles,roles,"
        "table_privileges,routines,parameters,triggers,constraints,"
        "key_column_usage,referential_constraints,check_constraints"
    )
    METADATA_FILTER_DEBUG: bool = False

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
