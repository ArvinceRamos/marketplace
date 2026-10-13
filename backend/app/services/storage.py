"""Supabase Storage calls made with the caller's own access token.

No secret key is used here. Storage policies only allow writes into a folder
named after the token's user ID, so even a bug in our path building cannot write
into another user's folder.
"""

import logging

import httpx2

from app.core.errors import AppError

logger = logging.getLogger("app.storage")

LISTING_BUCKET = "listing-images"
# Paths contain a random ID and files never change, so caches may keep them.
_CACHE_SECONDS = "31536000"


class Storage:
    def __init__(self, api_url: str, publishable_key: str, client: httpx2.AsyncClient) -> None:
        self.api_url = api_url.rstrip("/")
        self.publishable_key = publishable_key
        self.client = client

    def _headers(self, token: str) -> dict[str, str]:
        return {"apikey": self.publishable_key, "Authorization": f"Bearer {token}"}

    async def upload(self, token: str, bucket: str, path: str, data: bytes) -> None:
        headers = {
            **self._headers(token),
            "Content-Type": "image/webp",
            "Cache-Control": f"max-age={_CACHE_SECONDS}",
            "x-upsert": "false",
        }
        try:
            res = await self.client.post(
                f"{self.api_url}/object/{bucket}/{path}", content=data, headers=headers
            )
        except httpx2.HTTPError as exc:
            logger.warning("Storage upload failed: %s", type(exc).__name__)
            raise _unavailable() from exc
        if not res.is_success:
            # Body may describe a policy failure; log status only.
            logger.warning("Storage upload rejected with HTTP %s", res.status_code)
            raise _unavailable()

    async def remove(self, token: str, bucket: str, paths: list[str]) -> None:
        """Best effort: a leftover file is harmless; a failed request must not undo the DB."""
        if not paths:
            return
        try:
            res = await self.client.request(
                "DELETE",
                f"{self.api_url}/object/{bucket}",
                json={"prefixes": paths},
                headers=self._headers(token),
            )
            if not res.is_success:
                logger.warning("Storage delete rejected with HTTP %s", res.status_code)
        except httpx2.HTTPError as exc:
            logger.warning("Storage delete failed: %s", type(exc).__name__)


def _unavailable() -> AppError:
    return AppError(502, "storage_unavailable", "Could not save the photo. Please try again.")
