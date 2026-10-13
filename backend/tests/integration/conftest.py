"""Fixtures for tests against the LOCAL Supabase stack (`npm run db:start`).

- Refuses to run against any host except localhost, so hosted data is never touched.
- Skips when the stack is not running, unless REQUIRE_INTEGRATION=1 (set in CI),
  in which case a missing stack is a failure.
- Test users are real Supabase Auth users with real ES256 tokens; they are deleted
  at the end of the session.
"""

import json
import os
import secrets
import shutil
import subprocess
import uuid
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import asyncpg
import httpx2
import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
LOCAL_HOSTS = {"127.0.0.1", "localhost"}
# Local-only credentials created by supabase/seed.sql and the local CLI stack.
DEFAULT_APP_DSN = "postgresql://api_app:api_app_local_dev_only@127.0.0.1:54422/postgres"
DEFAULT_ADMIN_DSN = "postgresql://postgres:postgres@127.0.0.1:54422/postgres"


@dataclass(frozen=True)
class User:
    id: uuid.UUID
    email: str
    token: str


@dataclass(frozen=True)
class Stack:
    api_url: str
    publishable_key: str
    secret_key: str
    app_dsn: str
    admin_dsn: str


def _status_from_cli() -> dict:
    npx = shutil.which("npx")
    if not npx:
        return {}
    try:
        out = subprocess.run(  # noqa: S603 - fixed local command
            [npx, "supabase", "status", "-o", "json"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=60,
        ).stdout
        return json.loads(out[out.index("{") :])
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return {}


def _assert_local(url: str) -> None:
    host = urlparse(url).hostname
    if host not in LOCAL_HOSTS:
        pytest.exit(f"Refusing to run integration tests against non-local host {host!r}.", 2)


@pytest.fixture(scope="session")
def stack() -> Stack:
    required = os.environ.get("REQUIRE_INTEGRATION") == "1"
    status = {} if os.environ.get("SUPABASE_SECRET_KEY") else _status_from_cli()
    s = Stack(
        api_url=os.environ.get("SUPABASE_URL", status.get("API_URL", "http://127.0.0.1:54421")),
        publishable_key=os.environ.get(
            "SUPABASE_PUBLISHABLE_KEY", status.get("PUBLISHABLE_KEY", "")
        ),
        secret_key=os.environ.get("SUPABASE_SECRET_KEY", status.get("SECRET_KEY", "")),
        app_dsn=os.environ.get("TEST_APP_DSN", DEFAULT_APP_DSN),
        admin_dsn=os.environ.get("TEST_ADMIN_DSN", DEFAULT_ADMIN_DSN),
    )
    for url in (s.api_url, s.app_dsn, s.admin_dsn):
        _assert_local(url)
    try:
        ok = bool(s.secret_key) and httpx2.get(f"{s.api_url}/auth/v1/health", timeout=5).is_success
    except httpx2.HTTPError:
        ok = False
    if not ok:
        message = "Local Supabase is not running (start it with `npm run db:start`)."
        if required:
            pytest.fail(message)
        pytest.skip(message)
    return s


class Users:
    def __init__(self, stack: Stack) -> None:
        self.stack = stack
        self.created: list[uuid.UUID] = []

    def _admin_headers(self) -> dict[str, str]:
        return {"apikey": self.stack.secret_key, "Authorization": f"Bearer {self.stack.secret_key}"}

    def create(self, name: str, *, age_confirmed: bool = True) -> User:
        email = f"{name}-{uuid.uuid4().hex[:8]}@example.test"
        password = secrets.token_urlsafe(16)
        res = httpx2.post(
            f"{self.stack.api_url}/auth/v1/admin/users",
            headers=self._admin_headers(),
            json={
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"age_confirmed": age_confirmed},
            },
            timeout=10,
        )
        res.raise_for_status()
        uid = uuid.UUID(res.json()["id"])
        self.created.append(uid)
        token = httpx2.post(
            f"{self.stack.api_url}/auth/v1/token?grant_type=password",
            headers={"apikey": self.stack.publishable_key},
            json={"email": email, "password": password},
            timeout=10,
        )
        token.raise_for_status()
        return User(uid, email, token.json()["access_token"])

    def cleanup(self) -> None:
        for uid in self.created:
            httpx2.delete(
                f"{self.stack.api_url}/auth/v1/admin/users/{uid}",
                headers=self._admin_headers(),
                timeout=10,
            )


@pytest.fixture(scope="session")
def users(stack: Stack):
    u = Users(stack)
    yield u
    u.cleanup()


class Db:
    """Run SQL exactly as the API does: api_app -> SET LOCAL ROLE -> JWT claims."""

    def __init__(self, stack: Stack) -> None:
        self.stack = stack

    async def as_user(self, user: User | None, sql: str, *args) -> list[asyncpg.Record]:
        conn = await asyncpg.connect(self.stack.app_dsn)
        try:
            async with conn.transaction():
                await conn.execute(f"set local role {'authenticated' if user else 'anon'}")
                claims = (
                    {"sub": str(user.id), "role": "authenticated"} if user else {"role": "anon"}
                )
                await conn.execute(
                    "select set_config('request.jwt.claims', $1, true)", json.dumps(claims)
                )
                return await conn.fetch(sql, *args)
        finally:
            await conn.close()

    async def raw_app(self, sql: str) -> list[asyncpg.Record]:
        """As api_app WITHOUT switching role (must always fail on app tables)."""
        conn = await asyncpg.connect(self.stack.app_dsn)
        try:
            return await conn.fetch(sql)
        finally:
            await conn.close()

    async def admin(self, sql: str, *args) -> list[asyncpg.Record]:
        """Superuser, for test setup only. Never used by the application."""
        conn = await asyncpg.connect(self.stack.admin_dsn)
        try:
            return await conn.fetch(sql, *args)
        finally:
            await conn.close()

    async def make_listing(
        self, seller: User, status: str = "active", images: int = 1
    ) -> uuid.UUID:
        rows = await self.admin(
            """
            insert into app.listings
              (seller_id, category_id, city_id, title, price_centavos, condition)
            values ($1,
                    (select id from app.categories where slug = 'mobile-phones'),
                    (select id from app.locations where slug = 'quezon-city'),
                    'Test phone', 1000000, 'like_new')
            returning id
            """,
            seller.id,
        )
        listing_id = rows[0]["id"]
        for pos in range(images):
            await self.admin(
                """insert into app.listing_images
                   (listing_id, position, full_path, thumb_path, width, height)
                   values ($1, $2, $3, $3, 100, 100)""",
                listing_id,
                pos,
                f"{seller.id}/{listing_id}/{pos}.webp",
            )
        path = {
            "draft": [],
            "active": ["active"],
            "paused": ["active", "paused"],
            "sold": ["active", "sold"],
            "deleted": ["deleted"],
        }[status]
        for step in path:
            await self.admin("update app.listings set status = $2 where id = $1", listing_id, step)
        return listing_id


@pytest.fixture(scope="session")
def db(stack: Stack) -> Db:
    return Db(stack)


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"
