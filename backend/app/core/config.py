from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App settings read from environment variables (and `.env` for local runs)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["local", "test", "production"] = "local"
    # Comma-separated list, e.g. "http://localhost:3100,https://example.com"
    cors_origins: str = "http://localhost:3100"

    # Supabase project URL. Tokens are verified against its public keys (JWKS).
    supabase_url: str = "http://127.0.0.1:54421"
    # Public by design (same value the browser uses). Sent as `apikey` to Storage
    # together with the caller's own token, so Storage policies still apply.
    supabase_publishable_key: str = ""
    jwt_audience: str = "authenticated"
    # Connection string for the `api_app` role (no RLS bypass). Required for DB routes.
    database_url: str | None = None

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def docs_enabled(self) -> bool:
        return self.environment != "production"

    @property
    def jwt_issuer(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1"

    @property
    def jwks_url(self) -> str:
        return f"{self.jwt_issuer}/.well-known/jwks.json"

    @property
    def storage_api_url(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/storage/v1"

    @property
    def public_storage_url(self) -> str:
        """Base URL browsers use to load files from public buckets."""
        return f"{self.supabase_url.rstrip('/')}/storage/v1/object/public"


@lru_cache
def get_settings() -> Settings:
    return Settings()
