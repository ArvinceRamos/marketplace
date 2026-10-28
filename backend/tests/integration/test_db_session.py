"""The API's own transaction setup (core/db.py) against the local database."""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.db import integration_transaction, user_transaction

pytestmark = [pytest.mark.integration, pytest.mark.anyio]

WHO = text(
    "select current_user::text as role, auth.uid() as uid, "
    "current_setting('request.jwt.claims', true) as claims"
)


@pytest.fixture
async def engine(stack):
    url = stack.app_dsn.replace("postgresql://", "postgresql+asyncpg://", 1)
    # One pooled connection, so every transaction below reuses the same session.
    eng = create_async_engine(url, pool_size=1, max_overflow=0)
    yield eng
    await eng.dispose()


async def test_role_and_claims_apply_inside_and_end_with_the_transaction(engine):
    uid = uuid.uuid4()
    async with user_transaction(engine, {"sub": str(uid), "role": "authenticated"}) as conn:
        row = (await conn.execute(WHO)).one()
    assert row.role == "authenticated"
    assert row.uid == uid

    async with engine.connect() as conn:  # same pooled session, no setup
        row = (await conn.execute(WHO)).one()
    assert row.role == "api_app"
    assert row.uid is None
    assert not row.claims


async def test_guest_transaction_is_anon(engine):
    async with user_transaction(engine, None) as conn:
        row = (await conn.execute(WHO)).one()
    assert row.role == "anon"
    assert row.uid is None
    assert '"anon"' in row.claims


async def test_integration_transaction_cannot_read_tables(engine):
    with pytest.raises(DBAPIError, match="permission denied"):
        async with integration_transaction(engine) as conn:
            assert (await conn.execute(text("select current_user::text"))).scalar() == (
                "app_integrations"
            )
            await conn.execute(text("select 1 from app.listings limit 1"))
