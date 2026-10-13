"""Phase 14: fixes from docs/AUDIT_2026-10-13.md (A1–A7, C4, escalation fallback).

TEST MODE: all money here is simulated.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from .helpers import CHECK_VIOLATION, PERMISSION_DENIED, expect_error
from .test_api_orders import (
    API,
    PRICE,
    auth,
    code,
    ledger_sum,
    listing_with_options,
    orders_client,
    pay,
    place,
)

pytestmark = [pytest.mark.integration, pytest.mark.anyio]


@pytest.fixture(scope="module")
def api(stack):
    yield from orders_client(stack)


def get(api, user, oid):
    return api.get(f"{API}/orders/{oid}", headers=auth(user)).json()


def post(api, user, path, body=None):
    return api.post(f"{API}{path}", headers=auth(user), json=body)


def balance(api, user) -> int:
    return api.get(f"{API}/me/wallet", headers=auth(user)).json()["available_centavos"]


async def paid_meetup(api, db, users):
    seller, buyer = users.create("seller"), users.create("buyer")
    listing = await listing_with_options(db, seller)
    oid = place(api, buyer, listing).json()["id"]
    pay(api, buyer, oid)
    return seller, buyer, listing, oid


# --- A1: demo tools can't release escrow for the seller -----------------------------


async def test_seller_cannot_release_escrow_with_demo_tools(api, db, users):
    seller, buyer = users.create("seller"), users.create("buyer")
    listing = await listing_with_options(db, seller)
    oid = place(api, buyer, listing, fulfilment="delivery", courier="jnt").json()["id"]
    pay(api, buyer, oid)
    assert post(api, seller, f"/orders/{oid}/ship").status_code == 200

    for _ in range(3):  # picked up, in transit, out for delivery
        assert post(api, seller, f"/mock-courier/orders/{oid}/advance").status_code == 200
    assert "advance_tracking" not in get(api, seller, oid)["actions"]
    res = post(api, seller, f"/mock-courier/orders/{oid}/advance")
    assert (res.status_code, code(res)) == (403, "buyer_confirms_delivery")
    assert get(api, buyer, oid)["status"] == "shipped"

    assert post(api, buyer, f"/mock-courier/orders/{oid}/advance").status_code == 200
    assert get(api, buyer, oid)["status"] == "delivered"
    assert "fast_forward" not in get(api, seller, oid)["actions"]
    res = post(api, seller, f"/demo/orders/{oid}/fast-forward")
    assert (res.status_code, code(res)) == (403, "cannot_skip")
    assert get(api, seller, oid)["status"] == "delivered"
    assert balance(api, seller) == 0  # still held for the buyer's 2 days

    res = post(api, buyer, f"/demo/orders/{oid}/fast-forward")  # the buyer may give them up
    assert res.json()["status"] == "completed"
    assert balance(api, seller) == PRICE


# --- A2: paid meetups — no buyer walk-away -------------------------------------------


async def test_paid_meetup_buyer_cannot_cancel_or_skip(api, db, users):
    seller, buyer, listing, oid = await paid_meetup(api, db, users)
    order = get(api, buyer, oid)
    assert "cancel" not in order["actions"] and "fast_forward" not in order["actions"]
    res = post(api, buyer, f"/orders/{oid}/cancel")
    assert (res.status_code, code(res)) == (409, "ask_seller_to_cancel")
    res = post(api, buyer, f"/demo/orders/{oid}/fast-forward")
    assert (res.status_code, code(res)) == (403, "cannot_skip")
    assert get(api, buyer, oid)["status"] == "confirmed"

    # The seller can still cancel (full refund), as before.
    assert {"handover", "report_buyer", "cancel"} <= set(get(api, seller, oid)["actions"])
    res = post(api, seller, f"/orders/{oid}/cancel")
    assert res.json()["status"] == "cancelled"
    assert await ledger_sum(db, uuid.UUID(oid), "escrow") == 0

    # Cash meetups move no money, so the buyer may still back out.
    other = await listing_with_options(db, seller)
    cash = place(api, buyer, other, payment="cash").json()
    assert "cancel" in cash["actions"]
    assert post(api, buyer, f"/orders/{cash['id']}/cancel").json()["status"] == "cancelled"


async def test_seller_reports_buyer_who_took_the_item(api, db, users):
    seller, buyer, _, oid = await paid_meetup(api, db, users)
    res = post(api, buyer, f"/orders/{oid}/dispute/report-buyer", {"note": "me"})
    assert (res.status_code, code(res)) == (403, "not_seller")
    # Buyers can't use the seller's reason.
    res = post(api, buyer, f"/orders/{oid}/dispute", {"reason": "taken_without_code"})
    assert res.status_code == 422

    res = post(api, seller, f"/orders/{oid}/dispute/report-buyer", {"note": "Took it and left."})
    assert res.status_code == 200, res.text
    order = res.json()
    assert order["status"] == "disputed" and order["meet_by"] is None
    dispute = order["dispute"]
    assert (dispute["reason"], dispute["status"], dispute["opened_by"]) == (
        "taken_without_code",
        "escalated",
        "seller",
    )
    assert dispute["details"] == "Took it and left." and dispute["decide_by"]
    assert get(api, buyer, oid)["handover_code"] is None  # no handover is possible now
    assert "report_buyer" not in order["actions"]
    res = post(api, seller, f"/orders/{oid}/dispute/report-buyer", {})
    assert (res.status_code, code(res)) == (409, "cannot_report")

    # Money stays held: no cancel, no handover, no auto refund.
    res = post(api, buyer, f"/orders/{oid}/cancel")
    assert (res.status_code, code(res)) == (409, "cannot_cancel")
    res = post(api, buyer, f"/orders/{oid}/dispute/escalate")
    assert (res.status_code, code(res)) == (409, "dispute_escalated")
    assert await ledger_sum(db, uuid.UUID(oid), "escrow") > 0

    # The buyer can concede, which pays the seller.
    assert "dispute_withdraw" in get(api, buyer, oid)["actions"]
    res = post(api, buyer, f"/orders/{oid}/dispute/withdraw")
    assert res.json()["status"] == "completed"
    assert balance(api, seller) == PRICE


# --- Escalated disputes end after 14 days without a moderator ------------------------


async def test_escalated_dispute_refunds_after_fourteen_days(api, db, users):
    seller, buyer, _, oid = await paid_meetup(api, db, users)
    post(api, seller, f"/orders/{oid}/dispute/report-buyer", {})
    decide_by = datetime.fromisoformat(get(api, buyer, oid)["dispute"]["decide_by"])
    assert timedelta(days=13) < decide_by - datetime.now(UTC) <= timedelta(days=14)

    # The fallback favours the buyer, so only the seller may skip to it in the demo.
    assert "fast_forward" not in get(api, buyer, oid)["actions"]
    res = post(api, buyer, f"/demo/orders/{oid}/fast-forward")
    assert get(api, buyer, oid)["status"] == "disputed"
    res = post(api, seller, f"/demo/orders/{oid}/fast-forward")
    assert res.status_code == 200, res.text
    order = res.json()
    assert order["status"] == "refunded"
    assert order["dispute"]["outcome"] == "refunded"
    assert order["dispute"]["admin_note"].startswith("No moderator decision")
    assert await ledger_sum(db, uuid.UUID(oid), "escrow") == 0
    assert await ledger_sum(db, uuid.UUID(oid), "external") == 0


async def test_escalated_dispute_timer_runs_on_list_reads(api, db, users):
    seller, buyer, _, oid = await paid_meetup(api, db, users)
    post(api, seller, f"/orders/{oid}/dispute/report-buyer", {})
    await db.admin(
        "update app.disputes set decide_by = now() - interval '1 minute' where order_id = $1",
        uuid.UUID(oid),
    )
    api.get(f"{API}/orders", headers=auth(buyer))  # orders_tick_mine
    rows = await db.admin("select status::text as s from app.orders where id = $1", uuid.UUID(oid))
    assert rows[0]["s"] == "refunded"


# --- A3: unpaid orders can't squat listings ------------------------------------------


async def test_unpaid_orders_are_capped_and_held_briefly(api, db, users):
    seller, buyer = users.create("seller"), users.create("buyer")
    listings = [await listing_with_options(db, seller) for _ in range(5)]
    first = place(api, buyer, listings[0], payment="cash").json()
    meet_by = datetime.fromisoformat(first["meet_by"])
    assert meet_by - datetime.now(UTC) <= timedelta(days=3)
    cod = place(api, buyer, listings[1], fulfilment="delivery", payment="cod", courier="jnt")
    assert datetime.fromisoformat(cod.json()["ship_by"]) - datetime.now(UTC) <= timedelta(days=3)
    assert place(api, buyer, listings[2], payment="cash").status_code == 201

    res = place(api, buyer, listings[3], payment="cash")
    assert (res.status_code, code(res)) == (409, "too_many_unpaid_orders")
    assert api.get(f"{API}/listings/{listings[3]}").json()["status"] == "active"
    assert place(api, buyer, listings[3]).status_code == 201  # paying online is fine

    # Finishing one frees a slot.
    post(api, buyer, f"/orders/{first['id']}/cancel")
    assert place(api, buyer, listings[4], payment="cash").status_code == 201


# --- A5 / A6: what buyers see can't change under them --------------------------------


async def test_reserved_listing_is_frozen_and_order_keeps_description(api, db, users):
    seller, buyer = users.create("seller"), users.create("buyer")
    listing = await listing_with_options(db, seller)
    await db.admin("update app.listings set description = 'Mint, with box.' where id = $1", listing)
    oid = place(api, buyer, listing, payment="cash").json()["id"]

    res = api.patch(f"{API}/listings/{listing}", headers=auth(seller), json={"title": "Broken"})
    assert (res.status_code, code(res)) == (409, "listing_reserved")
    image = (await db.admin("select id from app.listing_images where listing_id = $1", listing))[0]
    res = api.delete(f"{API}/listings/{listing}/images/{image['id']}", headers=auth(seller))
    assert (res.status_code, code(res)) == (409, "listing_reserved")
    res = api.patch(
        f"{API}/listings/{listing}/images/order",
        headers=auth(seller),
        json={"image_ids": [str(image["id"])]},
    )
    assert (res.status_code, code(res)) == (409, "listing_reserved")

    # Second wall: the database refuses the same changes.
    await expect_error(
        db.as_user(seller, "update app.listings set title = 'Broken' where id = $1", listing),
        CHECK_VIOLATION,
    )
    await expect_error(
        db.as_user(seller, "delete from app.listing_images where listing_id = $1", listing),
        CHECK_VIOLATION,
    )

    rows = await db.admin(
        "select description, condition::text as c from app.orders where id = $1", uuid.UUID(oid)
    )
    assert (rows[0]["description"], rows[0]["c"]) == ("Mint, with box.", "like_new")


async def test_restricted_seller_cannot_edit_live_listing(api, db, users):
    seller = users.create("seller")
    listing = await db.make_listing(seller, "active")
    await db.admin("update app.profiles set restricted_at = now() where id = $1", seller.id)

    res = api.patch(f"{API}/listings/{listing}", headers=auth(seller), json={"price_centavos": 1})
    assert (res.status_code, code(res)) == (403, "restricted")
    await expect_error(
        db.as_user(seller, "update app.listings set price_centavos = 1 where id = $1", listing),
        PERMISSION_DENIED,
    )
    # Taking it down is still allowed.
    res = api.post(
        f"{API}/listings/{listing}/status", headers=auth(seller), json={"status": "paused"}
    )
    assert res.status_code == 200, res.text


# --- A7: moderators can't decide their own disputes ----------------------------------


async def test_moderator_cannot_decide_own_dispute(api, db, users):
    seller = users.create("seller")
    mod = users.create("mod", app_metadata={"role": "admin"})
    listing = await listing_with_options(db, seller)
    oid = place(api, mod, listing).json()["id"]
    pay(api, mod, oid)
    post(api, seller, f"/orders/{oid}/dispute/report-buyer", {})
    dispute_id = get(api, mod, oid)["dispute"]["id"]
    res = post(
        api, mod, f"/admin/disputes/{dispute_id}/resolve", {"outcome": "refund_buyer", "note": "x"}
    )
    assert (res.status_code, code(res)) == (403, "own_dispute")
    assert get(api, mod, oid)["status"] == "disputed"


# --- A4: repeat orders between two accounts count once -------------------------------


async def test_ratings_count_once_per_reviewer(api, db, users):
    seller, buyer = users.create("seller"), users.create("buyer")
    for rating in (5, 3):
        listing = await listing_with_options(db, seller)
        oid = place(api, buyer, listing, payment="cash").json()["id"]
        the_code = get(api, buyer, oid)["handover_code"]
        post(api, seller, f"/orders/{oid}/handover", {"code": the_code})
        post(api, buyer, f"/orders/{oid}/review", {"rating": rating})
        post(api, seller, f"/orders/{oid}/review", {"rating": 5})
    name = api.get(f"{API}/me", headers=auth(seller)).json()["username"]
    reviews = api.get(f"{API}/profiles/{name}/reviews").json()
    assert (reviews["count"], reviews["average"], len(reviews["items"])) == (1, 3.0, 1)
    profile = api.get(f"{API}/profiles/{name}").json()
    assert (profile["rating_count"], profile["rating_average"]) == (1, 3.0)


# --- C4: a small viewer answer instead of the whole listing again --------------------


async def test_listing_viewer(api, db, users):
    seller, buyer = users.create("seller"), users.create("buyer")
    listing = await listing_with_options(db, seller)
    assert api.get(f"{API}/listings/{listing}/viewer").status_code == 401
    mine = api.get(f"{API}/listings/{listing}/viewer", headers=auth(seller)).json()
    assert mine == {
        "status": "active",
        "is_owner": True,
        "is_favorited": False,
        "my_conversation_id": None,
        "my_open_order_id": None,
    }
    oid = place(api, buyer, listing, payment="cash").json()["id"]
    theirs = api.get(f"{API}/listings/{listing}/viewer", headers=auth(buyer)).json()
    assert (theirs["is_owner"], theirs["status"], theirs["my_open_order_id"]) == (
        False,
        "reserved",
        oid,
    )
    res = api.get(f"{API}/listings/{uuid.uuid4()}/viewer", headers=auth(buyer))
    assert res.status_code == 404


# --- C3: categories and locations are kept in memory ----------------------------------


async def test_static_lists_are_cached(api):
    first = api.get(f"{API}/categories")
    assert first.status_code == 200 and first.json()
    assert "categories" in api.app.state.static_cache
    # A stale copy is what the next caller gets (no database round trip).
    api.app.state.static_cache["categories"] = (
        api.app.state.static_cache["categories"][0],
        [],
    )
    assert api.get(f"{API}/categories").json() == []
    api.app.state.static_cache.clear()
    assert api.get(f"{API}/categories").json() == first.json()
    assert api.get(f"{API}/locations").json()
