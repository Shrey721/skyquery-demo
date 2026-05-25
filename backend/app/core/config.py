from pathlib import Path
from urllib.parse import quote

from cryptography.fernet import Fernet
from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(BACKEND_DIR / ".env"), str(PROJECT_DIR / ".env")),
        extra="ignore",
    )

    PROJECT_NAME: str = "SkyQuery API"
    API_V1_STR: str = "/api/v1"
    APP_ENV: str = "development"
    BACKEND_HOST: str = "0.0.0.0"
    BACKEND_PORT: int = 8000
    BACKEND_PUBLIC_URL: str = "http://localhost:8000"

    FRONTEND_URL: str = "http://localhost:3000"
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    GITHUB_CALLBACK_URL: str = "http://localhost:8000/api/v1/auth/github/callback"
    GITHUB_AUTHORIZE_URL: str = "https://github.com/login/oauth/authorize"
    GITHUB_ACCESS_TOKEN_URL: str = "https://github.com/login/oauth/access_token"
    GITHUB_USER_API_URL: str = "https://api.github.com/user"
    GITHUB_EMAILS_API_URL: str = "https://api.github.com/user/emails"
    GITHUB_COPILOT_TOKEN: str = ""
    GITHUB_COPILOT_TOKEN_ENDPOINT: str = "https://api.github.com/copilot_internal/v2/token"

    LLM_PROVIDER: str = "github_copilot"
    LLM_MODEL: str = "gpt-4.1"
    GITHUB_COPILOT_MODEL: str = Field(
        "gpt-4.1",
        validation_alias=AliasChoices("GITHUB_COPILOT_MODEL", "LLM_MODEL"),
    )
    OPENAI_API_KEY: str = ""
    GOOGLE_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    SECRET_KEY: str = Field(default_factory=lambda: Fernet.generate_key().decode("utf-8"))
    DATABASE_URL: str = f"sqlite:///{(BACKEND_DIR / 'connections.db').as_posix()}"

    REDIS_URL: str = ""
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: str = ""

    TRINO_HOST: str = "localhost"
    TRINO_PORT: int = 8081
    TRINO_USER: str = "trino"
    TRINO_PASSWORD: str = ""
    TRINO_DEFAULT_CATALOG: str = Field(
        "",
        validation_alias=AliasChoices("TRINO_DEFAULT_CATALOG", "TRINO_CATALOG"),
    )
    TRINO_DEFAULT_SCHEMA: str = Field(
        "",
        validation_alias=AliasChoices("TRINO_DEFAULT_SCHEMA", "TRINO_SCHEMA"),
    )
    TRINO_HTTP_SCHEME: str = "http"
    TRINO_VERIFY_SSL: bool = True
    TRINO_QUERY_MAX_RETRIES: int = Field(2, ge=0)
    TRINO_QUERY_RETRY_DELAY_SECONDS: float = Field(1.0, ge=0)
    ALLOW_SAVED_CONNECTIONS: bool = True
    TRINO_CONNECTION_SOURCE: str = "auto"

    OPENSKY_API_URL: str = Field(
        "https://opensky-network.org/api/states/all",
        validation_alias=AliasChoices("OPENSKY_API_URL", "OPENSKY_URL"),
    )
    OPENSKY_TIMEOUT_SECONDS: float = Field(8.0, gt=0)
    OPENSKY_CACHE_TTL_SECONDS: int = Field(15, ge=0)
    OPENSKY_STALE_TTL_SECONDS: int = Field(300, ge=0)
    ENABLE_MOCK_DATA: bool = False
    ENABLE_DEV_FALLBACKS: bool = False

    METADATA_CACHE_TTL_SECONDS: int = 86400
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

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @model_validator(mode="after")
    def validate_and_derive_configuration(self) -> "Settings":
        self.TRINO_CONNECTION_SOURCE = self.TRINO_CONNECTION_SOURCE.strip().lower()
        if self.TRINO_CONNECTION_SOURCE not in {"env", "saved", "auto"}:
            raise ValueError("TRINO_CONNECTION_SOURCE must be one of: env, saved, auto.")
        if self.TRINO_CONNECTION_SOURCE == "saved" and not self.ALLOW_SAVED_CONNECTIONS:
            raise ValueError("TRINO_CONNECTION_SOURCE=saved requires ALLOW_SAVED_CONNECTIONS=true.")

        if self.APP_ENV.lower() == "production":
            required_fields = {
                "FRONTEND_URL": self.FRONTEND_URL,
                "CORS_ORIGINS": self.CORS_ORIGINS,
                "BACKEND_PUBLIC_URL": self.BACKEND_PUBLIC_URL,
                "SECRET_KEY": self.SECRET_KEY,
                "DATABASE_URL": self.DATABASE_URL,
                "GITHUB_CLIENT_ID": self.GITHUB_CLIENT_ID,
                "GITHUB_CLIENT_SECRET": self.GITHUB_CLIENT_SECRET,
                "GITHUB_CALLBACK_URL": self.GITHUB_CALLBACK_URL,
                "LLM_PROVIDER": self.LLM_PROVIDER,
                "LLM_MODEL": self.LLM_MODEL,
            }
            if self.TRINO_CONNECTION_SOURCE != "saved":
                required_fields.update(
                    {
                        "TRINO_HOST": self.TRINO_HOST,
                        "TRINO_USER": self.TRINO_USER,
                        "TRINO_DEFAULT_CATALOG": self.TRINO_DEFAULT_CATALOG,
                        "TRINO_DEFAULT_SCHEMA": self.TRINO_DEFAULT_SCHEMA,
                    }
                )
            display_names = {
                "TRINO_DEFAULT_CATALOG": "TRINO_CATALOG",
                "TRINO_DEFAULT_SCHEMA": "TRINO_SCHEMA",
            }
            missing = [
                display_names.get(name, name)
                for name, value in required_fields.items()
                if name not in self.model_fields_set or not str(value).strip()
            ]
            redis_configured = (
                ("REDIS_URL" in self.model_fields_set and bool(self.REDIS_URL.strip()))
                or ("REDIS_HOST" in self.model_fields_set and bool(self.REDIS_HOST.strip()))
            )
            if not redis_configured:
                missing.append("REDIS_HOST or REDIS_URL")

            if self.LLM_PROVIDER.lower() == "openai" and not self.OPENAI_API_KEY:
                missing.append("OPENAI_API_KEY")
            elif self.LLM_PROVIDER.lower() == "google" and not self.GOOGLE_API_KEY:
                missing.append("GOOGLE_API_KEY")
            elif self.LLM_PROVIDER.lower() == "anthropic" and not self.ANTHROPIC_API_KEY:
                missing.append("ANTHROPIC_API_KEY")

            if missing:
                raise ValueError(
                    "Missing required production configuration: " + ", ".join(sorted(set(missing)))
                )
            if self.LLM_PROVIDER.lower() not in {"github_copilot", "github-copilot", "copilot"}:
                raise ValueError(
                    "This deployment currently supports LLM_PROVIDER=github_copilot only."
                )
            if self.ENABLE_MOCK_DATA or self.ENABLE_DEV_FALLBACKS:
                raise ValueError("ENABLE_MOCK_DATA and ENABLE_DEV_FALLBACKS must be false in production.")

        if not self.REDIS_URL:
            password = f":{quote(self.REDIS_PASSWORD, safe='')}@" if self.REDIS_PASSWORD else ""
            self.REDIS_URL = f"redis://{password}{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

        return self


settings = Settings()
