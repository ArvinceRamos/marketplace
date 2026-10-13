"""The one place the Supabase secret key is used: deleting an Auth user.

SECURITY_PLAN §3 and §4. The secret key bypasses RLS, so it is used for nothing
else, never logged, and never sent anywhere except the Auth admin endpoint. The
user ID always comes from the caller's verified token.
"""

import logging
import uuid

import httpx2
from pydantic import SecretStr

from app.core.errors import AppError

logger = logging.getLogger("app.auth_admin")


class AuthAdmin:
    def __init__(
        self, admin_url: str, secret_key: SecretStr | None, client: httpx2.AsyncClient
    ) -> None:
        self.admin_url = admin_url.rstrip("/")
        self._secret_key = secret_key
        self.client = client

    @property
    def configured(self) -> bool:
        return bool(self._secret_key and self._secret_key.get_secret_value())

    async def delete_user(self, uid: uuid.UUID, request_id: str) -> None:
        if not self._secret_key or not self.configured:
            raise _unavailable()
        key = self._secret_key.get_secret_value()
        try:
            res = await self.client.delete(
                f"{self.admin_url}/users/{uid}",
                headers={"apikey": key, "Authorization": f"Bearer {key}"},
            )
        except httpx2.HTTPError as exc:
            logger.warning("Auth admin delete failed: %s", type(exc).__name__)
            raise _unavailable() from exc
        # 404: already gone (e.g. a retry after a lost response). Same end state.
        if not res.is_success and res.status_code != 404:
            logger.warning("Auth admin delete rejected with HTTP %s", res.status_code)
            raise _unavailable()
        # Audit line for the one RLS bypass. No email or name.
        logger.info("Account deleted: user=%s request_id=%s", uid, request_id)


def _unavailable() -> AppError:
    return AppError(
        503,
        "account_deletion_unavailable",
        "Account deletion is not available right now. Please try again later.",
    )
