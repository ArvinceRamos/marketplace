"""Favorites, chats, and offers end to end (SECURITY_PLAN T3-T5).

Each test checks the allowed path and the "no" paths: strangers, wrong side
of the chat, wrong offer state, blocked users.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

pytestmark = [pytest.mark.integration, pytest.mark.anyio]

API = "/api/v1"


@pytest.fixture(scope="module")
def api(stack):
    dsn = stack.app_dsn.replace("postgresql://", "postgresql+asyncpg://", 1)
    settings = Settings(environment="test", supabase_url=stack.api_url, database_url=dsn)
    with TestClient(create_app(settings)) as client:
        yield client


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {user.token}"}


def code(res) -> str:
    return res.json()["error"]["code"]


async def setup_chat(api, db, users, status="active"):
    seller, buyer = users.create("seller"), users.create("buyer")
    listing = await db.make_listing(seller, status)
    res = api.post(f"{API}/listings/{listing}/conversations", headers=auth(buyer))
    assert res.status_code == 200, res.text
    return seller, buyer, listing, res.json()["id"]


def send(api, user, conv, body="Hi"):
    return api.post(f"{API}/conversations/{conv}/messages", headers=auth(user), json={"body": body})


def offer(api, user, conv, amount=500_000):
    return api.post(
        f"{API}/conversations/{conv}/offers", headers=auth(user), json={"amount_centavos": amount}
    )


# --- favorites ---------------------------------------------------------------------


async def test_favorites(api, db, users):
    seller, fan = users.create("seller"), users.create("fan")
    live = await db.make_listing(seller, "active")
    sold = await db.make_listing(seller, "sold")
    draft = await db.make_listing(seller, "draft")
    h = auth(fan)

    for listing in (live, live, sold):  # saving twice is fine
        assert api.put(f"{API}/listings/{listing}/favorite", headers=h).status_code == 204
    res = api.put(f"{API}/listings/{draft}/favorite", headers=h)
    assert (res.status_code, code(res)) == (404, "listing_not_found")
    res = api.put(f"{API}/listings/{live}/favorite", headers=auth(seller))
    assert (res.status_code, code(res)) == (409, "own_listing")
    assert api.put(f"{API}/listings/{live}/favorite").status_code == 401

    page = api.get(f"{API}/me/favorites", headers=h).json()
    assert {(i["id"], i["status"]) for i in page["items"]} == {
        (str(live), "active"),
        (str(sold), "sold"),
    }
    assert set(api.get(f"{API}/me/favorite-ids", headers=h).json()) == {str(live), str(sold)}
    assert api.get(f"{API}/listings/{live}", headers=h).json()["is_favorited"] is True
    assert api.get(f"{API}/listings/{live}").json()["is_favorited"] is False  # guest

    for _ in range(2):  # removing twice is fine
        assert api.delete(f"{API}/listings/{live}/favorite", headers=h).status_code == 204
    assert api.get(f"{API}/me/favorite-ids", headers=h).json() == [str(sold)]
    # Someone else's favorites are not visible.
    assert api.get(f"{API}/me/favorite-ids", headers=auth(seller)).json() == []


# --- starting a chat -----------------------------------------------------------------


async def test_start_chat_rules(api, db, users):
    seller, buyer, listing, conv = await setup_chat(api, db, users)
    # Same chat again, also from the listing page's my_conversation_id.
    again = api.post(f"{API}/listings/{listing}/conversations", headers=auth(buyer)).json()["id"]
    assert again == conv
    assert (
        api.get(f"{API}/listings/{listing}", headers=auth(buyer)).json()["my_conversation_id"]
        == conv
    )

    res = api.post(f"{API}/listings/{listing}/conversations", headers=auth(seller))
    assert (res.status_code, code(res)) == (409, "own_listing")
    assert api.post(f"{API}/listings/{listing}/conversations").status_code == 401

    paused = await db.make_listing(seller, "paused")
    res = api.post(f"{API}/listings/{paused}/conversations", headers=auth(buyer))
    assert (res.status_code, code(res)) == (409, "listing_unavailable")
    draft = await db.make_listing(seller, "draft")
    res = api.post(f"{API}/listings/{draft}/conversations", headers=auth(buyer))
    assert res.status_code == 404

    # An existing chat stays reachable after the item is sold.
    await db.admin("update app.listings set status = 'sold' where id = $1", listing)
    res = api.post(f"{API}/listings/{listing}/conversations", headers=auth(buyer))
    assert res.json()["id"] == conv


async def test_blocked_users_cannot_chat(api, db, users):
    seller, buyer, listing, conv = await setup_chat(api, db, users)
    other = await db.make_listing(seller, "active")
    await db.as_user(
        seller,
        "insert into app.blocked_users (blocker_id, blocked_id) values ($1, $2)",
        seller.id,
        buyer.id,
    )
    res = api.post(f"{API}/listings/{other}/conversations", headers=auth(buyer))
    assert (res.status_code, code(res)) == (403, "blocked")
    res = send(api, buyer, conv)
    assert (res.status_code, code(res)) == (403, "blocked")
    assert offer(api, buyer, conv).status_code == 403


# --- privacy -------------------------------------------------------------------------


async def test_strangers_see_nothing(api, db, users):
    seller, buyer, listing, conv = await setup_chat(api, db, users)
    send(api, buyer, conv)
    offer_id = offer(api, buyer, conv).json()["id"]
    stranger = auth(users.create("stranger"))
    attempts = [
        api.get(f"{API}/conversations/{conv}", headers=stranger),
        api.get(f"{API}/conversations/{conv}/messages", headers=stranger),
        send(api, users.create("stranger2"), conv),
        api.post(f"{API}/conversations/{conv}/read", headers=stranger),
        api.get(f"{API}/conversations/{conv}/offers", headers=stranger),
        api.post(
            f"{API}/conversations/{conv}/offers", headers=stranger, json={"amount_centavos": 1}
        ),
        api.post(f"{API}/offers/{offer_id}/accept", headers=stranger),
        api.post(f"{API}/offers/{offer_id}/withdraw", headers=stranger),
    ]
    assert [r.status_code for r in attempts] == [404] * len(attempts)
    assert api.get(f"{API}/conversations", headers=stranger).json() == []
    assert api.get(f"{API}/conversations/{conv}").status_code == 401


# --- messages and unread -------------------------------------------------------------


async def test_messages_inbox_and_unread(api, db, users):
    seller, buyer, listing, conv = await setup_chat(api, db, users)
    # The seller does not see a chat the buyer opened but never wrote in.
    assert api.get(f"{API}/conversations", headers=auth(seller)).json() == []
    assert [c["id"] for c in api.get(f"{API}/conversations", headers=auth(buyer)).json()] == [conv]

    res = send(api, buyer, conv, "  Is this still available?  ")
    assert res.status_code == 201
    assert (res.json()["body"], res.json()["mine"], res.json()["kind"]) == (
        "Is this still available?",
        True,
        "text",
    )
    for bad in ("", "   ", "x" * 2001):
        assert send(api, buyer, conv, bad).status_code == 422
    res = api.post(
        f"{API}/conversations/{conv}/messages",
        headers=auth(buyer),
        json={"body": "hi", "sender_id": str(seller.id)},
    )
    assert res.status_code == 422  # cannot pretend to be the other person

    inbox = api.get(f"{API}/conversations", headers=auth(seller)).json()
    assert len(inbox) == 1
    item = inbox[0]
    assert (item["role"], item["unread_count"]) == ("selling", 1)
    assert item["listing"]["id"] == str(listing)
    assert item["last_message"]["preview"] == "Is this still available?"
    assert api.get(f"{API}/me/unread-count", headers=auth(seller)).json() == {"unread": 1}
    assert api.get(f"{API}/me/unread-count", headers=auth(buyer)).json() == {"unread": 0}
    assert api.get(f"{API}/conversations?role=buying", headers=auth(seller)).json() == []

    assert api.post(f"{API}/conversations/{conv}/read", headers=auth(seller)).status_code == 204
    assert api.get(f"{API}/me/unread-count", headers=auth(seller)).json() == {"unread": 0}

    send(api, seller, conv, "Yes!")
    page = api.get(f"{API}/conversations/{conv}/messages", headers=auth(buyer)).json()
    assert [(m["body"], m["mine"]) for m in page["items"]] == [
        ("Is this still available?", True),
        ("Yes!", False),
    ]
    assert api.get(f"{API}/me/unread-count", headers=auth(buyer)).json() == {"unread": 1}


async def test_message_paging_and_polling(api, db, users):
    seller, buyer, listing, conv = await setup_chat(api, db, users)
    for i in range(5):
        send(api, buyer if i % 2 == 0 else seller, conv, f"m{i}")
    url = f"{API}/conversations/{conv}/messages"
    latest = api.get(url, headers=auth(buyer), params={"limit": 2}).json()
    assert [m["body"] for m in latest["items"]] == ["m3", "m4"]
    older = api.get(
        url, headers=auth(buyer), params={"limit": 2, "before": latest["next_before"]}
    ).json()
    assert [m["body"] for m in older["items"]] == ["m1", "m2"]
    oldest = api.get(
        url, headers=auth(buyer), params={"limit": 2, "before": older["next_before"]}
    ).json()
    assert ([m["body"] for m in oldest["items"]], oldest["next_before"]) == (["m0"], None)

    last_id = latest["items"][-1]["id"]
    assert api.get(url, headers=auth(buyer), params={"after": last_id}).json()["items"] == []
    send(api, seller, conv, "new")
    new = api.get(url, headers=auth(buyer), params={"after": last_id}).json()["items"]
    assert [m["body"] for m in new] == ["new"]


# --- offers --------------------------------------------------------------------------


async def test_offer_flow(api, db, users):
    seller, buyer, listing, conv = await setup_chat(api, db, users)
    res = offer(api, seller, conv)
    assert (res.status_code, code(res)) == (403, "not_buyer")
    assert offer(api, buyer, conv, 0).status_code == 422

    first = offer(api, buyer, conv, 400_000)
    assert first.status_code == 201
    assert first.json()["status"] == "pending"
    res = offer(api, buyer, conv, 450_000)
    assert (res.status_code, code(res)) == (409, "offer_pending")
    detail = api.get(f"{API}/conversations/{conv}", headers=auth(buyer)).json()
    assert (detail["can_offer"], detail["latest_offer"]["amount_centavos"]) == (False, 400_000)

    oid = first.json()["id"]
    # The buyer can't accept their own offer; the seller can't withdraw it.
    res = api.post(f"{API}/offers/{oid}/accept", headers=auth(buyer))
    assert (res.status_code, code(res)) == (403, "not_allowed")
    assert api.post(f"{API}/offers/{oid}/withdraw", headers=auth(seller)).status_code == 403

    res = api.post(f"{API}/offers/{oid}/reject", headers=auth(seller))
    assert res.json()["status"] == "rejected"
    res = api.post(f"{API}/offers/{oid}/accept", headers=auth(seller))
    assert (res.status_code, code(res)) == (409, "offer_not_pending")

    # After a rejection the buyer may try again.
    second = offer(api, buyer, conv, 450_000).json()["id"]
    assert api.post(f"{API}/offers/{second}/accept", headers=auth(seller)).json()["status"] == (
        "accepted"
    )
    history = api.get(f"{API}/conversations/{conv}/offers", headers=auth(seller)).json()
    assert [(o["amount_centavos"], o["status"]) for o in history] == [
        (450_000, "accepted"),
        (400_000, "rejected"),
    ]
    # Offer events appear in the chat for both people.
    msgs = api.get(f"{API}/conversations/{conv}/messages", headers=auth(seller)).json()["items"]
    assert [(m["kind"], m["body"]) for m in msgs] == [
        ("offer", "Made an offer"),
        ("system", "Offer declined"),
        ("offer", "Made an offer"),
        ("system", "Offer accepted"),
    ]
    assert msgs[2]["offer"]["status"] == "accepted"  # bubbles show the current status


async def test_withdraw_and_listing_sold_expires_offers(api, db, users):
    seller, buyer, listing, conv = await setup_chat(api, db, users)
    oid = offer(api, buyer, conv).json()["id"]
    assert api.post(f"{API}/offers/{oid}/withdraw", headers=auth(buyer)).json()["status"] == (
        "withdrawn"
    )
    pending = offer(api, buyer, conv).json()["id"]
    await db.admin("update app.listings set status = 'sold' where id = $1", listing)
    res = api.post(f"{API}/offers/{pending}/accept", headers=auth(seller))
    assert (res.status_code, code(res)) == (409, "offer_expired")
    res = offer(api, buyer, conv)
    assert (res.status_code, code(res)) == (409, "listing_unavailable")
    detail = api.get(f"{API}/conversations/{conv}", headers=auth(buyer)).json()
    assert (detail["listing"]["status"], detail["can_offer"], detail["can_message"]) == (
        "sold",
        False,
        True,  # the chat itself continues
    )


async def test_week_old_offers_expire_when_read(api, db, users):
    seller, buyer, listing, conv = await setup_chat(api, db, users)
    oid = offer(api, buyer, conv).json()["id"]
    await db.admin(
        "update app.offers set expires_at = now() - interval '1 minute' where id = $1",
        uuid.UUID(oid),
    )
    res = api.post(f"{API}/offers/{oid}/accept", headers=auth(seller))
    assert (res.status_code, code(res)) == (409, "offer_expired")
    # A new offer is possible right away.
    assert offer(api, buyer, conv).status_code == 201


async def test_seller_can_mark_sold_after_buyer_left(api, db, users):
    """Regression: "Offer expired" notes must be written even when the buyer is gone."""
    seller, buyer, listing, conv = await setup_chat(api, db, users)
    offer(api, buyer, conv)
    assert users.delete(buyer.id).status_code == 200
    res = api.post(
        f"{API}/listings/{listing}/status", headers=auth(seller), json={"status": "sold"}
    )
    assert res.status_code == 200, res.text
    detail = api.get(f"{API}/conversations/{conv}", headers=auth(seller)).json()
    assert (detail["other_user"], detail["can_message"]) == (None, False)
    assert detail["latest_offer"]["status"] == "expired"
    res = send(api, seller, conv)
    assert (res.status_code, code(res)) == (409, "user_left")
