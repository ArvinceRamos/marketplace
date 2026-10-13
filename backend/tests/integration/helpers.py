from collections.abc import Awaitable

import asyncpg
import pytest

PERMISSION_DENIED = "42501"  # missing grant, or RLS WITH CHECK failed
CHECK_VIOLATION = "23514"  # our guard triggers and CHECK constraints
UNIQUE_VIOLATION = "23505"


async def expect_error(coro: Awaitable, *codes: str) -> asyncpg.PostgresError:
    """Await `coro` and assert it fails with one of the given SQLSTATE codes."""
    with pytest.raises(asyncpg.PostgresError) as info:
        await coro
    assert info.value.sqlstate in codes, f"{info.value.sqlstate}: {info.value}"
    return info.value
