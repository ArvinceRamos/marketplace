"""RLS and rules for conversations, messages, and offers."""

import pytest

from tests.integration.helpers import (
    CHECK_VIOLATION,
    PERMISSION_DENIED,
    UNIQUE_VIOLATION,
    expect_error,
)

pytestmark = [pytest.mark.integration, pytest.mark.anyio]

START_CHAT = """
    insert into app.conversations (listing_id, buyer_id) values ($1, $2)
    returning id, seller_id
"""
SEND = """
    insert into app.messages (conversation_id, sender_id, body) values ($1, $2, $3) returning id
"""
OFFER = """
    insert into app.offers (conversation_id, amount_centavos) values ($1, $2) returning id, status
"""
SET_OFFER = "update app.offers set status = $2 where id = $1 returning status"


@pytest.fixture
def people(users):
    return users.create("seller"), users.create("buyer"), users.create("outsider")


async def _chat(db, seller, buyer, status="active"):
    listing = await db.make_listing(seller, status)
    rows = await db.as_user(buyer, START_CHAT, listing, buyer.id)
    return listing, rows[0]["id"]


# --- conversations -----------------------------------------------------------


async def test_buyer_starts_chat_and_seller_is_taken_from_listing(db, people):
    seller, buyer, _ = people
    listing = await db.make_listing(seller, "active")
    rows = await db.as_user(buyer, START_CHAT, listing, buyer.id)
    assert rows[0]["seller_id"] == seller.id


async def test_one_chat_per_buyer_per_listing(db, people):
    seller, buyer, _ = people
    listing, _ = await _chat(db, seller, buyer)
    await expect_error(db.as_user(buyer, START_CHAT, listing, buyer.id), UNIQUE_VIOLATION)


async def test_cannot_chat_on_own_listing(db, people):
    seller, _, _ = people
    listing = await db.make_listing(seller, "active")
    await expect_error(db.as_user(seller, START_CHAT, listing, seller.id), CHECK_VIOLATION)


async def test_cannot_start_chat_as_someone_else(db, people):
    seller, buyer, outsider = people
    listing = await db.make_listing(seller, "active")
    await expect_error(db.as_user(outsider, START_CHAT, listing, buyer.id), PERMISSION_DENIED)


@pytest.mark.parametrize("status", ["draft", "paused", "sold"])
async def test_cannot_start_chat_on_unavailable_listing(db, people, status):
    seller, buyer, _ = people
    listing = await db.make_listing(seller, status)
    await expect_error(
        db.as_user(buyer, START_CHAT, listing, buyer.id), CHECK_VIOLATION, PERMISSION_DENIED
    )


async def test_blocked_buyer_cannot_start_chat(db, people):
    seller, buyer, _ = people
    listing = await db.make_listing(seller, "active")
    await db.as_user(
        seller,
        "insert into app.blocked_users (blocker_id, blocked_id) values ($1, $2)",
        seller.id,
        buyer.id,
    )
    await expect_error(db.as_user(buyer, START_CHAT, listing, buyer.id), PERMISSION_DENIED)


async def test_outsider_and_guest_cannot_see_chat(db, people):
    seller, buyer, outsider = people
    _, chat = await _chat(db, seller, buyer)
    sql = "select 1 from app.conversations where id = $1"
    assert await db.as_user(outsider, sql, chat) == []
    await expect_error(db.as_user(None, sql, chat), PERMISSION_DENIED)
    assert await db.as_user(seller, sql, chat)


async def test_participant_moves_only_own_read_marker(db, people):
    seller, buyer, _ = people
    _, chat = await _chat(db, seller, buyer)
    await db.as_user(
        buyer, "update app.conversations set buyer_last_read_at = now() where id = $1", chat
    )
    await expect_error(
        db.as_user(
            buyer, "update app.conversations set seller_last_read_at = now() where id = $1", chat
        ),
        PERMISSION_DENIED,
    )


# --- messages ----------------------------------------------------------------


async def test_participants_exchange_messages(db, people):
    seller, buyer, _ = people
    _, chat = await _chat(db, seller, buyer)
    await db.as_user(buyer, SEND, chat, buyer.id, "Is this available?")
    await db.as_user(seller, SEND, chat, seller.id, "Yes")
    rows = await db.as_user(
        buyer, "select body from app.messages where conversation_id = $1 order by id", chat
    )
    assert [r["body"] for r in rows] == ["Is this available?", "Yes"]


async def test_outsider_cannot_read_or_send(db, people):
    seller, buyer, outsider = people
    _, chat = await _chat(db, seller, buyer)
    await db.as_user(buyer, SEND, chat, buyer.id, "private")
    assert (
        await db.as_user(outsider, "select 1 from app.messages where conversation_id = $1", chat)
        == []
    )
    await expect_error(db.as_user(outsider, SEND, chat, outsider.id, "hi"), PERMISSION_DENIED)


async def test_cannot_send_as_other_participant(db, people):
    seller, buyer, _ = people
    _, chat = await _chat(db, seller, buyer)
    await expect_error(db.as_user(buyer, SEND, chat, seller.id, "fake"), PERMISSION_DENIED)


async def test_cannot_send_fake_offer_or_system_messages(db, people):
    seller, buyer, _ = people
    _, chat = await _chat(db, seller, buyer)
    await expect_error(
        db.as_user(
            buyer,
            "insert into app.messages (conversation_id, sender_id, kind, body) "
            "values ($1, $2, 'system', 'Offer accepted')",
            chat,
            buyer.id,
        ),
        PERMISSION_DENIED,
    )


async def test_messages_cannot_be_edited_or_deleted(db, people):
    seller, buyer, _ = people
    _, chat = await _chat(db, seller, buyer)
    msg = (await db.as_user(buyer, SEND, chat, buyer.id, "original"))[0]["id"]
    await expect_error(
        db.as_user(buyer, "update app.messages set body = 'edited' where id = $1", msg),
        PERMISSION_DENIED,
    )
    await expect_error(
        db.as_user(buyer, "delete from app.messages where id = $1", msg), PERMISSION_DENIED
    )


async def test_block_stops_messages_both_ways(db, people):
    seller, buyer, _ = people
    _, chat = await _chat(db, seller, buyer)
    await db.as_user(
        buyer,
        "insert into app.blocked_users (blocker_id, blocked_id) values ($1, $2)",
        buyer.id,
        seller.id,
    )
    await expect_error(db.as_user(seller, SEND, chat, seller.id, "hello?"), PERMISSION_DENIED)
    await expect_error(db.as_user(buyer, SEND, chat, buyer.id, "bye"), PERMISSION_DENIED)


# --- offers ------------------------------------------------------------------


async def test_offer_flow_accept_with_history(db, people):
    seller, buyer, _ = people
    _, chat = await _chat(db, seller, buyer)
    offer = (await db.as_user(buyer, OFFER, chat, 900000))[0]
    assert offer["status"] == "pending"
    assert (await db.as_user(seller, SET_OFFER, offer["id"], "accepted"))[0]["status"] == "accepted"
    kinds = await db.as_user(
        buyer, "select kind, body from app.messages where conversation_id = $1 order by id", chat
    )
    assert [(r["kind"], r["body"]) for r in kinds] == [
        ("offer", "Made an offer"),
        ("system", "Offer accepted"),
    ]


async def test_only_buyer_makes_offers(db, people):
    seller, buyer, outsider = people
    _, chat = await _chat(db, seller, buyer)
    await expect_error(db.as_user(seller, OFFER, chat, 100), PERMISSION_DENIED)
    await expect_error(db.as_user(outsider, OFFER, chat, 100), PERMISSION_DENIED)


async def test_one_pending_offer_at_a_time(db, people):
    seller, buyer, _ = people
    _, chat = await _chat(db, seller, buyer)
    await db.as_user(buyer, OFFER, chat, 100)
    await expect_error(db.as_user(buyer, OFFER, chat, 200), UNIQUE_VIOLATION)


async def test_buyer_cannot_accept_and_seller_cannot_withdraw(db, people):
    seller, buyer, _ = people
    _, chat = await _chat(db, seller, buyer)
    offer = (await db.as_user(buyer, OFFER, chat, 100))[0]["id"]
    await expect_error(db.as_user(buyer, SET_OFFER, offer, "accepted"), PERMISSION_DENIED)
    await expect_error(db.as_user(seller, SET_OFFER, offer, "withdrawn"), PERMISSION_DENIED)
    await expect_error(db.as_user(seller, SET_OFFER, offer, "expired"), PERMISSION_DENIED)


async def test_answered_offer_is_final(db, people):
    seller, buyer, _ = people
    _, chat = await _chat(db, seller, buyer)
    offer = (await db.as_user(buyer, OFFER, chat, 100))[0]["id"]
    await db.as_user(seller, SET_OFFER, offer, "rejected")
    await expect_error(db.as_user(seller, SET_OFFER, offer, "accepted"), CHECK_VIOLATION)
    # A new offer is allowed after a rejection.
    await db.as_user(buyer, OFFER, chat, 150)


async def test_offer_amount_cannot_change(db, people):
    seller, buyer, _ = people
    _, chat = await _chat(db, seller, buyer)
    offer = (await db.as_user(buyer, OFFER, chat, 100))[0]["id"]
    await expect_error(
        db.as_user(buyer, "update app.offers set amount_centavos = 1 where id = $1", offer),
        PERMISSION_DENIED,
    )


async def test_pausing_listing_expires_pending_offers(db, people):
    seller, buyer, _ = people
    listing, chat = await _chat(db, seller, buyer)
    offer = (await db.as_user(buyer, OFFER, chat, 100))[0]["id"]
    await db.as_user(seller, "update app.listings set status = 'paused' where id = $1", listing)
    rows = await db.as_user(buyer, "select status from app.offers where id = $1", offer)
    assert rows[0]["status"] == "expired"
    await expect_error(db.as_user(buyer, OFFER, chat, 100), CHECK_VIOLATION)


async def test_outsider_cannot_see_offers(db, people):
    seller, buyer, outsider = people
    _, chat = await _chat(db, seller, buyer)
    offer = (await db.as_user(buyer, OFFER, chat, 100))[0]["id"]
    assert await db.as_user(outsider, "select 1 from app.offers where id = $1", offer) == []
    assert await db.as_user(outsider, SET_OFFER, offer, "rejected") == []
