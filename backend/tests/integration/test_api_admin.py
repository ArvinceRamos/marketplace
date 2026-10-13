"""Disputes and admin moderation end to end (Phase 12; SECURITY_PLAN T27, T30, T31)."""

import uuid

import pytest

from .test_api_orders import (
    API,
    FEE,
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


@pytest.fixture(scope="module")
def moderator(users):
    return users.create("mod", app_metadata={"role": "admin"})


def get(api, user, oid):
    return api.get(f"{API}/orders/{oid}", headers=auth(user)).json()


def post(api, user, path, body=None):
    return api.post(f"{API}{path}", headers=auth(user), json=body)


def balance(api, user) -> int:
    return api.get(f"{API}/me/wallet", headers=auth(user)).json()["available_centavos"]


def username(api, user) -> str:
    return api.get(f"{API}/me", headers=auth(user)).json()["username"]


async def delivered_order(api, db, users):
    seller, buyer = users.create("seller"), users.create("buyer")
    listing = await listing_with_options(db, seller)
    oid = place(api, buyer, listing, fulfilment="delivery", courier="jnt").json()["id"]
    pay(api, buyer, oid)
    assert post(api, seller, f"/orders/{oid}/ship").status_code == 200
    for _ in range(4):
        post(api, seller, f"/mock-courier/orders/{oid}/advance")
    assert get(api, buyer, oid)["status"] == "delivered"
    return seller, buyer, listing, oid


# --- access ------------------------------------------------------------------------


async def test_admin_needs_the_signed_role(api, db, users, moderator):
    normal = users.create("normal")
    faker = users.create("faker", user_metadata={"role": "admin"})  # editable by users
    paths = [
        "/admin/summary",
        "/admin/reports",
        "/admin/users",
        "/admin/disputes",
        "/admin/actions",
    ]
    for path in paths:
        assert api.get(f"{API}{path}").status_code == 401
        for user in (normal, faker):
            res = api.get(f"{API}{path}", headers=auth(user))
            assert (res.status_code, code(res)) == (403, "not_admin"), path
        assert api.get(f"{API}{path}", headers=auth(moderator)).status_code == 200, path
    assert api.get(f"{API}/me", headers=auth(moderator)).json()["is_admin"] is True
    assert api.get(f"{API}/me", headers=auth(faker)).json()["is_admin"] is False

    # The database checks again: a user calling admin functions directly is refused.
    await_err = db.as_user(normal, "select app.admin_set_restriction($1, true, 'x')", faker.id)
    with pytest.raises(Exception, match="not_admin"):
        await await_err
    assert await db.as_user(normal, "select * from app.admin_actions") == []
    assert await db.as_user(normal, "select * from app.disputes") == []


# --- reports, hiding, restricting --------------------------------------------------


async def test_report_hide_listing_restrict_and_audit(api, db, users, moderator):
    seller, reporter, buyer = users.create("seller"), users.create("reporter"), users.create("b")
    listing = await listing_with_options(db, seller)
    other = await listing_with_options(db, seller)
    draft = await db.make_listing(seller, "draft")
    conv = post(api, buyer, f"/listings/{other}/conversations").json()["id"]
    res = post(
        api,
        reporter,
        "/reports",
        {"target_type": "listing", "listing_id": str(listing), "reason": "scam"},
    )
    assert res.status_code == 201, res.text
    report_id = res.json()["id"]

    queue = api.get(f"{API}/admin/reports", headers=auth(moderator)).json()
    mine = next(r for r in queue if r["id"] == report_id)
    assert mine["listing"]["seller_username"] == username(api, seller)
    assert mine["reporter"]["username"] == username(api, reporter)

    res = post(
        api,
        moderator,
        f"/admin/reports/{report_id}",
        {"status": "actioned", "note": "Fake item", "hide_listing": True, "restrict_user": True},
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "actioned"
    assert res.json()["listing"]["hidden"] is True

    # Hidden: gone for others, still visible to its owner with a flag.
    assert api.get(f"{API}/listings/{listing}").status_code == 404
    assert api.get(f"{API}/listings/{listing}", headers=auth(seller)).json()["hidden"] is True

    # Restricted: no new listings, chats, messages, offers, orders, or publishing (T31).
    seller_name = username(api, seller)
    assert api.get(f"{API}/profiles/{seller_name}").json()["restricted"] is True
    body = {
        "title": "New thing",
        "price_centavos": 10000,
        "category_id": (await db.admin("select id from app.categories where slug='mobile-phones'"))[
            0
        ]["id"],
        "condition": "like_new",
        "city_id": (await db.admin("select id from app.locations where slug='quezon-city'"))[0][
            "id"
        ],
        "meetup": True,
        "delivery": False,
    }
    for res in [
        post(api, seller, "/listings", body),
        post(api, seller, f"/conversations/{conv}/messages", {"body": "hi"}),
        post(api, seller, f"/listings/{draft}/status", {"status": "active"}),
    ]:
        assert (res.status_code, code(res)) == (403, "restricted"), res.text
    third = await listing_with_options(db, buyer)
    res = post(api, seller, f"/listings/{third}/conversations")
    assert (res.status_code, code(res)) == (403, "restricted")
    res = place(api, seller, third)
    assert (res.status_code, code(res)) == (403, "restricted")
    # The database refuses too, even without the API's check.
    with pytest.raises(Exception, match="row-level security"):
        await db.as_user(
            seller,
            "insert into app.messages (conversation_id, sender_id, kind, body) "
            "values ($1, $2, 'text', 'x')",
            uuid.UUID(conv),
            seller.id,
        )
    # The other side is warned in the chat.
    detail = api.get(f"{API}/conversations/{conv}", headers=auth(buyer)).json()
    assert detail["other_restricted"] is True

    log = api.get(f"{API}/admin/actions", headers=auth(moderator)).json()
    mine = [a for a in log if a["target_id"] in (str(listing), str(seller.id), report_id)]
    assert {a["action"] for a in mine} == {"listing_hidden", "user_restricted", "report_actioned"}
    assert all(a["admin"]["username"] == username(api, moderator) for a in mine)

    # Undo both.
    res = post(api, moderator, f"/admin/users/{seller_name}/restriction", {"restricted": False})
    assert res.json()["restricted_at"] is None
    res = post(api, moderator, f"/admin/listings/{listing}/moderation", {"moderation": "ok"})
    assert res.status_code == 204
    assert api.get(f"{API}/listings/{listing}").status_code == 200
    assert post(api, seller, f"/conversations/{conv}/messages", {"body": "hi"}).status_code == 201
    users_found = api.get(f"{API}/admin/users?q={seller_name[:8]}", headers=auth(moderator)).json()
    assert seller_name in [u["username"] for u in users_found]
    res = post(
        api, moderator, f"/admin/users/{username(api, moderator)}/restriction", {"restricted": True}
    )
    assert (res.status_code, code(res)) == (422, "cannot_restrict_self")


# --- disputes ----------------------------------------------------------------------


async def test_seller_refunds_a_dispute(api, db, users):
    seller, buyer, listing, oid = await delivered_order(api, db, users)
    order = get(api, buyer, oid)
    assert "open_dispute" in order["actions"]
    res = post(api, buyer, f"/orders/{oid}/dispute", {"reason": "not_received"})
    assert (res.status_code, code(res)) == (409, "cannot_dispute")  # it was delivered
    res = post(api, seller, f"/orders/{oid}/dispute", {"reason": "not_as_described"})
    assert (res.status_code, code(res)) == (403, "not_buyer")
    res = post(
        api,
        buyer,
        f"/orders/{oid}/dispute",
        {"reason": "not_as_described", "details": "Screen is cracked."},
    )
    assert res.status_code == 200, res.text
    order = res.json()
    assert order["status"] == "disputed" and order["dispute"]["respond_by"]
    assert order["confirm_by"] is None  # no auto-release while disputed
    seller_view = get(api, seller, oid)
    assert {"dispute_refund", "dispute_contest"} <= set(seller_view["actions"])
    res = post(api, buyer, f"/orders/{oid}/confirm-received")
    assert res.status_code == 409  # can't release mid-dispute

    res = post(api, seller, f"/orders/{oid}/dispute/refund", {"note": "Sorry about that"})
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "refunded"
    assert res.json()["dispute"]["outcome"] == "refunded"
    assert await ledger_sum(db, uuid.UUID(oid), "escrow") == 0
    assert await ledger_sum(db, uuid.UUID(oid), "external") == 0  # all money back
    assert balance(api, seller) == 0
    res = post(api, seller, f"/orders/{oid}/dispute/refund", {})
    assert (res.status_code, code(res)) == (409, "no_open_dispute")  # T27: no double refund


async def test_contested_dispute_goes_to_a_moderator(api, db, users, moderator):
    seller, buyer, _, oid = await delivered_order(api, db, users)
    post(api, buyer, f"/orders/{oid}/dispute", {"reason": "incomplete"})
    res = post(api, seller, f"/orders/{oid}/dispute/contest", {"note": "Box had everything."})
    assert res.json()["dispute"]["status"] == "escalated"
    assert "dispute_refund" not in res.json()["actions"]

    queue = api.get(f"{API}/admin/disputes", headers=auth(moderator)).json()
    item = next(d for d in queue if d["order"]["id"] == oid)
    assert item["seller_note"] == "Box had everything."
    assert item["order"]["buyer"] == username(api, buyer)

    path = f"/admin/disputes/{item['id']}/resolve"
    res = post(api, moderator, path, {"outcome": "release_seller", "note": " "})
    assert res.status_code == 422  # a note is required
    res = post(api, buyer, path, {"outcome": "refund_buyer", "note": "me"})
    assert (res.status_code, code(res)) == (403, "not_admin")
    res = post(api, moderator, path, {"outcome": "release_seller", "note": "Photos match."})
    assert res.status_code == 200, res.text
    assert res.json()["outcome"] == "released"
    assert get(api, buyer, oid)["status"] == "completed"
    assert balance(api, seller) == PRICE
    assert await ledger_sum(db, uuid.UUID(oid), "platform") == FEE
    res = post(api, moderator, path, {"outcome": "refund_buyer", "note": "again"})
    assert (res.status_code, code(res)) == (409, "dispute_resolved")


async def test_unanswered_dispute_escalates_and_moderator_refunds(api, db, users, moderator):
    seller, buyer, _, oid = await delivered_order(api, db, users)
    post(api, buyer, f"/orders/{oid}/dispute", {"reason": "not_as_described"})
    res = post(api, buyer, f"/demo/orders/{oid}/fast-forward")  # 48 hours pass
    assert res.json()["dispute"]["status"] == "escalated"
    dispute_id = res.json()["dispute"]["id"]
    res = post(
        api,
        moderator,
        f"/admin/disputes/{dispute_id}/resolve",
        {"outcome": "refund_buyer", "note": "Seller did not answer."},
    )
    assert res.json()["outcome"] == "refunded"
    assert get(api, seller, oid)["status"] == "refunded"
    assert balance(api, seller) == 0


async def test_buyer_withdraws_and_not_received_rules(api, db, users):
    seller, buyer = users.create("seller"), users.create("buyer")
    listing = await listing_with_options(db, seller)
    oid = place(api, buyer, listing, fulfilment="delivery", courier="jnt").json()["id"]
    pay(api, buyer, oid)
    post(api, seller, f"/orders/{oid}/ship")
    res = post(api, buyer, f"/orders/{oid}/dispute", {"reason": "not_as_described"})
    assert (res.status_code, code(res)) == (409, "cannot_dispute")  # not delivered yet
    res = post(api, buyer, f"/orders/{oid}/dispute", {"reason": "not_received"})
    assert res.json()["status"] == "disputed"
    res = post(api, buyer, f"/orders/{oid}/dispute/withdraw")
    assert res.json()["status"] == "completed"
    assert res.json()["dispute"]["outcome"] == "withdrawn"
    assert balance(api, seller) == PRICE

    # Cash and COD orders have no buyer protection.
    other = await listing_with_options(db, seller)
    cod = place(api, buyer, other, fulfilment="delivery", payment="cod", courier="jnt").json()
    post(api, seller, f"/orders/{cod['id']}/ship")
    res = post(api, buyer, f"/orders/{cod['id']}/dispute", {"reason": "not_received"})
    assert (res.status_code, code(res)) == (409, "cannot_dispute")
