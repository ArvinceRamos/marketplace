from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Local/test signing secrets for the simulated providers. Not secrets: production
# refuses to start with them (see Settings._check_production).
DEV_MOCKPAY_SECRET = "mockpay-local-dev-only"  # noqa: S105
DEV_MOCKCOURIER_SECRET = "mockcourier-local-dev-only"  # noqa: S105


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
    # Secret key. Its only use: delete an Auth user during account deletion
    # (SECURITY_PLAN §3). Without it, DELETE /me answers 503.
    supabase_secret_key: SecretStr | None = None

    # Rate limits (API_SPECIFICATION §3), kept in memory.
    rate_limits_enabled: bool = True
    # How many proxies in front of the API append to X-Forwarded-For (Render: 1).
    # 0 = use the socket address and ignore the header (it can be faked).
    trusted_proxy_hops: int = Field(default=0, ge=0, le=5)

    # Test mode (docs/TRANSACTIONS_DESIGN.md §11). Payments are always simulated.
    # Demo tools (MockPay buttons, tracking steps, fast-forward) default to on
    # except in production, where they must be switched on explicitly.
    demo_tools_enabled: bool | None = None
    mockpay_webhook_secret: SecretStr = SecretStr(DEV_MOCKPAY_SECRET)
    mockcourier_webhook_secret: SecretStr = SecretStr(DEV_MOCKCOURIER_SECRET)

    @model_validator(mode="after")
    def _check_production(self) -> "Settings":
        if self.environment == "production" and (
            self.mockpay_webhook_secret.get_secret_value() == DEV_MOCKPAY_SECRET
            or self.mockcourier_webhook_secret.get_secret_value() == DEV_MOCKCOURIER_SECRET
        ):
            raise ValueError("Set MOCKPAY_WEBHOOK_SECRET and MOCKCOURIER_WEBHOOK_SECRET.")
        return self

    @property
    def demo_tools(self) -> bool:
        if self.demo_tools_enabled is None:
            return self.environment != "production"
        return self.demo_tools_enabled

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
    def auth_admin_url(self) -> str:
        return f"{self.jwt_issuer}/admin"

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
