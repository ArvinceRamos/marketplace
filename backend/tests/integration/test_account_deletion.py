"""Deleting an account must succeed even when other people's data points at it."""

import pytest

pytestmark = [pytest.mark.integration, pytest.mark.anyio]


async def test_deleting_users_with_chats_offers_and_reports(db, users):
    seller, buyer = users.create("seller"), users.create("buyer")
    listing = await db.make_listing(seller, "active")
    chat = (
        await db.as_user(
            buyer,
            "insert into app.conversations (listing_id, buyer_id) values ($1, $2) returning id",
            listing,
            buyer.id,
        )
    )[0]["id"]
    await db.as_user(
        buyer,
        "insert into app.messages (conversation_id, sender_id, body) values ($1, $2, 'Hi')",
        chat,
        buyer.id,
    )
    offer = (
        await db.as_user(
            buyer,
            "insert into app.offers (conversation_id, amount_centavos) values ($1, 500) "
            "returning id",
            chat,
        )
    )[0]["id"]
    await db.as_user(
        seller,
        "insert into app.reports (reporter_id, target_type, reported_user_id, reason) "
        "values ($1, 'user', $2, 'spam')",
        seller.id,
        buyer.id,
    )
    await db.as_user(
        buyer,
        "insert into app.reports (reporter_id, target_type, listing_id, reason) "
        "values ($1, 'listing', $2, 'scam')",
        buyer.id,
        listing,
    )

    # Buyer leaves: the seller keeps the chat, offer history, and their report.
    assert users.delete(buyer.id).status_code == 200
    chats = await db.as_user(seller, "select buyer_id from app.conversations where id = $1", chat)
    assert chats[0]["buyer_id"] is None
    offers = await db.as_user(
        seller, "select buyer_id, status from app.offers where id = $1", offer
    )
    assert offers[0]["buyer_id"] is None
    reports = await db.admin(
        "select reported_user_id from app.reports where reporter_id = $1", seller.id
    )
    assert reports[0]["reported_user_id"] is None

    # Seller leaves: their listing and its chats go with them.
    assert users.delete(seller.id).status_code == 200
    assert await db.admin("select 1 from app.listings where id = $1", listing) == []
    assert await db.admin("select 1 from app.conversations where id = $1", chat) == []


async def test_report_still_requires_a_target(db, users):
    from tests.integration.helpers import CHECK_VIOLATION, expect_error

    alice = users.create("alice")
    await expect_error(
        db.as_user(
            alice,
            "insert into app.reports (reporter_id, target_type, reason) "
            "values ($1, 'user', 'spam')",
            alice.id,
        ),
        CHECK_VIOLATION,
    )
