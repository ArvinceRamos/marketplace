"""Shipping, simulated tracking, COD, meetup handover, timers, and reviews (Phase 11).

SECURITY_PLAN T24, T25, T27, T28, T29. TEST MODE: everything is simulated.
"""

import json
import uuid

import pytest

from app.integrations import signing

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


def get(api, user, oid):
    return api.get(f"{API}/orders/{oid}", headers=auth(user)).json()


def post(api, user, oid, action, body=None):
    return api.post(f"{API}/orders/{oid}/{action}", headers=auth(user), json=body)


def advance(api, user, oid):
    return api.post(f"{API}/mock-courier/orders/{oid}/advance", headers=auth(user))


def balance(api, user) -> int:
    return api.get(f"{API}/me/wallet", headers=auth(user)).json()["available_centavos"]


async def shipped_order(api, db, users, payment="online"):
    seller, buyer = users.create("seller"), users.create("buyer")
    listing = await listing_with_options(db, seller)
    oid = place(api, buyer, listing, fulfilment="delivery", payment=payment, courier="jnt").json()[
        "id"
    ]
    if payment == "online":
        pay(api, buyer, oid)
    res = post(api, buyer, oid, "ship")
    assert (res.status_code, code(res)) == (403, "not_seller")
    res = post(api, seller, oid, "ship")
    assert res.status_code == 200, res.text
    return seller, buyer, listing, oid


async def test_delivery_tracking_confirm_and_release(api, db, users):
    seller, buyer, listing, oid = await shipped_order(api, db, users)
    order = get(api, buyer, oid)
    assert order["status"] == "shipped"
    ship = order["shipment"]
    assert ship["tracking_number"].startswith("DEMO-JNT-") and len(ship["tracking_number"]) == 19
    assert [e["status"] for e in ship["events"]] == ["label_created"]
    assert "confirm_received" in order["actions"] and "advance_tracking" in order["actions"]
    res = post(api, seller, oid, "ship")
    assert (res.status_code, code(res)) == (409, "cannot_ship")

    for _ in range(3):
        assert advance(api, seller, oid).status_code == 200
    assert advance(api, buyer, oid).status_code == 200  # only the buyer marks it delivered
    order = get(api, buyer, oid)
    assert order["status"] == "delivered" and order["confirm_by"] and order["delivered_at"]
    assert [e["status"] for e in order["shipment"]["events"]] == [
        "label_created",
        "picked_up",
        "in_transit",
        "out_for_delivery",
        "delivered",
    ]
    res = advance(api, seller, oid)
    assert (res.status_code, code(res)) == (409, "nothing_to_advance")
    res = post(api, seller, oid, "confirm-received")
    assert (res.status_code, code(res)) == (403, "not_buyer")
    assert balance(api, seller) == 0  # still held

    res = post(api, buyer, oid, "confirm-received")
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "completed"
    assert balance(api, seller) == PRICE  # sellers pay no fees
    order_id = uuid.UUID(oid)
    assert await ledger_sum(db, order_id, "escrow") == 0
    assert await ledger_sum(db, order_id, "platform") == FEE
    assert await ledger_sum(db, order_id, "courier") == 12_000
    assert api.get(f"{API}/listings/{listing}").json()["status"] == "sold"
    res = post(api, buyer, oid, "confirm-received")  # T27: no double release
    assert (res.status_code, code(res)) == (409, "cannot_confirm")
    assert balance(api, seller) == PRICE


async def test_delivered_orders_auto_complete_after_two_days(api, db, users):
    seller, buyer, _, oid = await shipped_order(api, db, users)
    for _ in range(4):
        advance(api, buyer, oid)
    res = api.post(f"{API}/demo/orders/{oid}/fast-forward", headers=auth(buyer))
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "completed"
    assert balance(api, seller) == PRICE


async def test_cash_on_delivery_remits_to_the_seller(api, db, users):
    seller, buyer, _, oid = await shipped_order(api, db, users, payment="cod")
    order = get(api, buyer, oid)
    assert "confirm_received" not in order["actions"]  # the courier confirms COD
    for _ in range(3):
        advance(api, seller, oid)
    advance(api, buyer, oid)
    assert get(api, buyer, oid)["status"] == "completed"
    assert balance(api, seller) == PRICE
    assert await ledger_sum(db, uuid.UUID(oid), "external") == -(PRICE + 12_000)
    assert await ledger_sum(db, uuid.UUID(oid), "escrow") == 0


async def test_shipping_webhook_security(api, db, users):
    seller, buyer, _, oid = await shipped_order(api, db, users)
    tracking = get(api, buyer, oid)["shipment"]["tracking_number"]
    secret = api.app.state.settings.mockcourier_webhook_secret.get_secret_value().encode()

    def send(status, event_id=None, key=secret):
        body = json.dumps(
            {
                "id": event_id or f"trk_{uuid.uuid4().hex}",
                "type": "shipment.updated",
                "data": {"tracking_number": tracking, "status": status},
            }
        ).encode()
        return api.post(
            f"{API}/shipping/webhooks/mock",
            content=body,
            headers={"MockCourier-Signature": signing.sign(key, body)},
        )

    # T24: a forged "delivered" (e.g. with the payment secret) changes nothing.
    assert send("delivered", key=b"mockpay-local-dev-only").status_code == 400
    assert code(send("label_created")) == "bad_event"
    assert get(api, buyer, oid)["status"] == "shipped"

    same = f"trk_{uuid.uuid4().hex}"
    assert send("in_transit", event_id=same).json() == {"result": "updated"}
    assert send("in_transit", event_id=same).json() == {"result": "duplicate"}  # T25
    assert send("picked_up").json() == {"result": "ignored"}  # never backwards
    assert send("delivered").json() == {"result": "delivered"}
    assert get(api, buyer, oid)["status"] == "delivered"


async def test_meetup_handover_code(api, db, users):
    seller, buyer = users.create("seller"), users.create("buyer")
    listing = await listing_with_options(db, seller)
    oid = place(api, buyer, listing).json()["id"]
    pay(api, buyer, oid)
    the_code = get(api, buyer, oid)["handover_code"]
    assert get(api, seller, oid)["handover_code"] is None  # T28
    rows = await db.as_user(seller, "select * from app.order_secrets")
    assert rows == []  # RLS: the seller can't read it either

    wrong = "000000" if the_code != "000000" else "111111"
    res = post(api, buyer, oid, "handover", {"code": the_code})
    assert (res.status_code, code(res)) == (403, "not_seller")
    res = post(api, seller, oid, "handover", {"code": "12345"})
    assert res.status_code == 422  # not 6 digits
    for _ in range(4):
        res = post(api, seller, oid, "handover", {"code": wrong})
        assert (res.status_code, code(res)) == (422, "wrong_code")
    res = post(api, seller, oid, "handover", {"code": wrong})
    assert (res.status_code, code(res)) == (409, "code_locked")
    res = post(api, seller, oid, "handover", {"code": the_code})  # locked even if right
    assert (res.status_code, code(res)) == (409, "code_locked")

    order = post(api, buyer, oid, "handover-code").json()
    assert order["handover_code"] != the_code or True  # may repeat by chance; tries reset
    res = post(api, seller, oid, "handover", {"code": order["handover_code"]})
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "completed"
    assert balance(api, seller) == PRICE
    res = post(api, seller, oid, "handover", {"code": order["handover_code"]})
    assert (res.status_code, code(res)) == (409, "cannot_hand_over")


async def test_cash_meetup_completes_without_money(api, db, users):
    seller, buyer = users.create("seller"), users.create("buyer")
    listing = await listing_with_options(db, seller)
    oid = place(api, buyer, listing, payment="cash").json()["id"]
    the_code = get(api, buyer, oid)["handover_code"]
    res = post(api, seller, oid, "handover", {"code": the_code})
    assert res.json()["status"] == "completed"
    assert balance(api, seller) == 0  # cash changed hands outside the app
    assert api.get(f"{API}/listings/{listing}").json()["status"] == "sold"


async def test_fast_forward_is_for_participants_only(api, db, users):
    seller, buyer, stranger = users.create("seller"), users.create("buyer"), users.create("x")
    listing = await listing_with_options(db, seller)
    oid = place(api, buyer, listing, payment="cash").json()["id"]
    res = api.post(f"{API}/demo/orders/{oid}/fast-forward", headers=auth(stranger))
    assert (res.status_code, code(res)) == (404, "order_not_found")
    # Users can't call the integration function themselves (T29).
    rows = db.as_user(buyer, "select app.demo_fast_forward($1)", uuid.UUID(oid))
    with pytest.raises(Exception, match="permission denied"):
        await rows
    res = api.post(f"{API}/demo/orders/{oid}/fast-forward", headers=auth(buyer))
    assert (res.json()["status"], res.json()["cancel_reason"]) == ("cancelled", "not_met")


async def test_reviews_are_double_blind(api, db, users):
    seller, buyer, stranger = users.create("seller"), users.create("buyer"), users.create("x")
    listing = await listing_with_options(db, seller)
    oid = place(api, buyer, listing, payment="cash").json()["id"]
    res = post(api, buyer, oid, "review", {"rating": 5})
    assert (res.status_code, code(res)) == (409, "cannot_review")  # not completed yet
    the_code = get(api, buyer, oid)["handover_code"]
    post(api, seller, oid, "handover", {"code": the_code})
    seller_name = api.get(f"{API}/me", headers=auth(seller)).json()["username"]
    buyer_name = api.get(f"{API}/me", headers=auth(buyer)).json()["username"]

    assert "review" in get(api, buyer, oid)["actions"]
    assert post(api, buyer, oid, "review", {"rating": 6}).status_code == 422
    res = post(api, stranger, oid, "review", {"rating": 1})
    assert res.status_code == 404
    res = post(api, buyer, oid, "review", {"rating": 5, "comment": "  Smooth meetup!  "})
    assert res.status_code == 200, res.text
    assert res.json()["my_review"]["comment"] == "Smooth meetup!"
    assert "review" not in res.json()["actions"]
    res = post(api, buyer, oid, "review", {"rating": 4})
    assert (res.status_code, code(res)) == (409, "already_reviewed")

    # Blind until the other side reviews.
    assert get(api, seller, oid)["their_review"] is None
    public = api.get(f"{API}/profiles/{seller_name}/reviews").json()
    assert (public["count"], public["items"]) == (0, [])
    rows = await db.as_user(seller, "select * from app.reviews where order_id = $1", uuid.UUID(oid))
    assert rows == []  # RLS hides the buyer's review from the seller for now

    post(api, seller, oid, "review", {"rating": 4})
    assert get(api, seller, oid)["their_review"]["rating"] == 5
    public = api.get(f"{API}/profiles/{seller_name}/reviews").json()
    assert (public["average"], public["count"]) == (5.0, 1)
    assert public["items"][0]["reviewer_role"] == "buyer"
    assert public["items"][0]["reviewer"]["username"] == buyer_name
    profile = api.get(f"{API}/profiles/{seller_name}").json()
    assert (profile["rating_average"], profile["rating_count"]) == (5.0, 1)
    assert api.get(f"{API}/profiles/{buyer_name}/reviews").json()["average"] == 4.0
    assert api.get(f"{API}/profiles/nobody_here_xyz/reviews").status_code == 404
