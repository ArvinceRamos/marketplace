"""Database access that keeps Postgres row-level security in force.

FastAPI connects as `api_app`, which has no table privileges of its own. Every
request runs in one transaction that first switches to `anon` or `authenticated`
and stores the verified JWT claims, so RLS policies (via auth.uid()) apply exactly
as they would for that user. `SET LOCAL` ends with the transaction, so pooled
connections never carry one user's identity into another request.
"""

import json
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine

from app.core.errors import AppError
from app.core.security import Claims, optional_claims, require_claims

# Fixed literals only; never built from input.
_SET_ROLE = {
    "anon": text("set local role anon"),
    "authenticated": text("set local role authenticated"),
}
_SET_CLAIMS = text("select set_config('request.jwt.claims', :claims, true)")


def create_engine(database_url: str) -> AsyncEngine:
    return create_async_engine(database_url, pool_size=5, max_overflow=5, pool_pre_ping=True)


async def _transaction(request: Request, claims: Claims | None) -> AsyncIterator[AsyncConnection]:
    engine: AsyncEngine | None = request.app.state.engine
    if engine is None:
        raise AppError(503, "db_unavailable", "The service is starting up. Try again shortly.")
    role = "authenticated" if claims else "anon"
    async with engine.begin() as conn:  # commits on success, rolls back on error
        await conn.execute(_SET_ROLE[role])
        await conn.execute(_SET_CLAIMS, {"claims": json.dumps(claims or {"role": "anon"})})
        yield conn


async def _db(
    request: Request, claims: Annotated[Claims | None, Depends(optional_claims)]
) -> AsyncIterator[AsyncConnection]:
    async for conn in _transaction(request, claims):
        yield conn


async def _user_db(
    request: Request, claims: Annotated[Claims, Depends(require_claims)]
) -> AsyncIterator[AsyncConnection]:
    async for conn in _transaction(request, claims):
        yield conn


# scope="function": commit happens before the response is sent, so a failed
# commit becomes an error response instead of a silent loss.
Db = Annotated[AsyncConnection, Depends(_db, scope="function")]
UserDb = Annotated[AsyncConnection, Depends(_user_db, scope="function")]
