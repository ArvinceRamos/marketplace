"""RLS and rules for favorites, blocks, and reports."""

import pytest

from tests.integration.helpers import (
    CHECK_VIOLATION,
    PERMISSION_DENIED,
    UNIQUE_VIOLATION,
    expect_error,
)

pytestmark = [pytest.mark.integration, pytest.mark.anyio]

FAV = "insert into app.favorites (user_id, listing_id) values ($1, $2)"
BLOCK = "insert into app.blocked_users (blocker_id, blocked_id) values ($1, $2)"
REPORT_LISTING = """
    insert into app.reports (reporter_id, target_type, listing_id, reason)
    values ($1, 'listing', $2, 'scam') returning id, status
"""
REPORT_USER = """
    insert into app.reports (reporter_id, target_type, reported_user_id, reason)
    values ($1, 'user', $2, 'offensive')
"""


# --- favorites ---------------------------------------------------------------


async def test_favorite_and_unfavorite(db, users):
    seller, buyer = users.create("seller"), users.create("buyer")
    listing = await db.make_listing(seller, "active")
    await db.as_user(buyer, FAV, buyer.id, listing)
    await expect_error(db.as_user(buyer, FAV, buyer.id, listing), UNIQUE_VIOLATION)
    rows = await db.as_user(
        buyer, "delete from app.favorites where listing_id = $1 returning 1", listing
    )
    assert len(rows) == 1


async def test_cannot_favorite_for_someone_else(db, users):
    seller, buyer, other = users.create("seller"), users.create("buyer"), users.create("other")
    listing = await db.make_listing(seller, "active")
    await expect_error(db.as_user(buyer, FAV, other.id, listing), PERMISSION_DENIED)


async def test_cannot_favorite_own_or_hidden_listing(db, users):
    seller, buyer = users.create("seller"), users.create("buyer")
    own = await db.make_listing(seller, "active")
    draft = await db.make_listing(seller, "draft")
    await expect_error(db.as_user(seller, FAV, seller.id, own), CHECK_VIOLATION)
    await expect_error(db.as_user(buyer, FAV, buyer.id, draft), PERMISSION_DENIED)


async def test_favorites_are_private(db, users):
    seller, buyer, other = users.create("seller"), users.create("buyer"), users.create("other")
    listing = await db.make_listing(seller, "active")
    await db.as_user(buyer, FAV, buyer.id, listing)
    sql = "select 1 from app.favorites where user_id = $1"
    assert await db.as_user(other, sql, buyer.id) == []
    deleted = await db.as_user(
        other, "delete from app.favorites where user_id = $1 returning 1", buyer.id
    )
    assert deleted == []
    await expect_error(db.as_user(None, sql, buyer.id), PERMISSION_DENIED)


# --- blocks ------------------------------------------------------------------


async def test_block_list_is_private_and_not_self(db, users):
    alice, bob, carol = users.create("alice"), users.create("bob"), users.create("carol")
    await db.as_user(alice, BLOCK, alice.id, bob.id)
    assert await db.as_user(bob, "select 1 from app.blocked_users") == []
    assert await db.as_user(carol, "select 1 from app.blocked_users") == []
    await expect_error(db.as_user(carol, BLOCK, alice.id, carol.id), PERMISSION_DENIED)
    await expect_error(db.as_user(alice, BLOCK, alice.id, alice.id), CHECK_VIOLATION)


# --- reports -----------------------------------------------------------------


async def test_report_listing_and_user(db, users):
    seller, buyer = users.create("seller"), users.create("buyer")
    listing = await db.make_listing(seller, "active")
    rows = await db.as_user(buyer, REPORT_LISTING, buyer.id, listing)
    assert rows[0]["status"] == "open"
    await db.as_user(buyer, REPORT_USER, buyer.id, seller.id)


async def test_one_open_report_per_target(db, users):
    seller, buyer = users.create("seller"), users.create("buyer")
    listing = await db.make_listing(seller, "active")
    await db.as_user(buyer, REPORT_LISTING, buyer.id, listing)
    await expect_error(db.as_user(buyer, REPORT_LISTING, buyer.id, listing), UNIQUE_VIOLATION)


async def test_cannot_report_self_or_own_listing(db, users):
    seller = users.create("seller")
    listing = await db.make_listing(seller, "active")
    await expect_error(db.as_user(seller, REPORT_USER, seller.id, seller.id), CHECK_VIOLATION)
    await expect_error(db.as_user(seller, REPORT_LISTING, seller.id, listing), CHECK_VIOLATION)


async def test_reports_private_and_status_not_editable(db, users):
    seller, buyer = users.create("seller"), users.create("buyer")
    listing = await db.make_listing(seller, "active")
    report = (await db.as_user(buyer, REPORT_LISTING, buyer.id, listing))[0]["id"]
    assert await db.as_user(seller, "select 1 from app.reports where id = $1", report) == []
    await expect_error(
        db.as_user(buyer, "update app.reports set status = 'dismissed' where id = $1", report),
        PERMISSION_DENIED,
    )
    await expect_error(
        db.as_user(buyer, "delete from app.reports where id = $1", report), PERMISSION_DENIED
    )
