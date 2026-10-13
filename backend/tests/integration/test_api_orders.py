"""Orders, MockPay, webhooks, ledger, and wallet end to end (SECURITY_PLAN T23-T27, T32).

TEST MODE: all money here is simulated. Amounts are in centavos.
"""

import json
import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.integrations import signing
from app.main import create_app

from .helpers import CHECK_VIOLATION, PERMISSION_DENIED, expect_error

pytestmark = [pytest.mark.integration, pytest.mark.anyio]

API = "/api/v1"
PRICE = 1_000_000  # ₱10,000 (Db.make_listing)
FEE = 1500 + PRICE * 5 // 100  # ₱15 + 5%


def orders_client(stack):
    """An app client for order tests (also used by test_api_fulfilment and test_api_admin)."""
    dsn = stack.app_dsn.replace("postgresql://", "postgresql+asyncpg://", 1)
    settings = Settings(
        environment="test",
        supabase_url=stack.api_url,
        database_url=dsn,
        supabase_secret_key=stack.secret_key,
        supabase_publishable_key=stack.publishable_key,
        rate_limits_enabled=False,
    )
    with TestClient(create_app(settings)) as client:
        yield client


@pytest.fixture(scope="module")
def api(stack):
    yield from orders_client(stack)


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {user.token}"}


def code(res) -> str:
    return res.json()["error"]["code"]


async def listing_with_options(
    db, seller, *, meetup=True, delivery=True, payments=("cash", "cod"), couriers=("jnt",)
) -> uuid.UUID:
    listing = await db.make_listing(seller, "active")
    await db.admin(
        """update app.listings set meetup = $2, delivery = $3, payment_methods = $4,
           couriers = $5 where id = $1""",
        listing,
        meetup,
        delivery,
        list(payments),
        list(couriers),
    )
    return listing


def terms(listing, fulfilment="meetup", payment="online", courier=None, offer=None) -> dict:
    body = {"listing_id": str(listing), "fulfilment": fulfilment, "payment_method": payment}
    if courier:
        body["courier"] = courier
    if offer:
        body["offer_id"] = str(offer)
    return body


def place(api, buyer, listing, **kw):
    return api.post(f"{API}/orders", headers=auth(buyer), json=terms(listing, **kw))


def pay(api, buyer, order_id, outcome="success"):
    res = api.post(f"{API}/orders/{order_id}/pay", headers=auth(buyer))
    assert res.status_code == 200, res.text
    ref = res.json()["checkout_url"].rsplit("/", 1)[-1]
    done = api.post(
        f"{API}/mock-pay/sessions/{ref}/complete", headers=auth(buyer), json={"outcome": outcome}
    )
    assert done.status_code == 200, done.text
    return ref, done.json()["result"]


def webhook(api, event: dict, secret=None, timestamp=None):
    secret = secret or api.app.state.settings.mockpay_webhook_secret.get_secret_value()
    body = json.dumps(event).encode()
    header = signing.sign(secret.encode(), body, timestamp)
    return api.post(
        f"{API}/payments/webhooks/mock", content=body, headers={"MockPay-Signature": header}
    )


async def ledger_sum(db, order_id, account) -> int:
    rows = await db.admin(
        """select coalesce(sum(amount_centavos), 0) as s from app.ledger_entries
           where order_id = $1 and account = $2""",
        order_id,
        account,
    )
    return rows[0]["s"]


# --- checkout ----------------------------------------------------------------------


async def test_checkout_options_and_quotes(api, db, users):
    seller, buyer = users.create("seller"), users.create("buyer")
    listing = await listing_with_options(db, seller)

    res = api.get(f"{API}/listings/{listing}/checkout", headers=auth(buyer))
    assert res.status_code == 200, res.text
    opts = res.json()
    assert opts["item_price_centavos"] == PRICE
    assert opts["payment_methods"] == {"meetup": ["online", "cash"], "delivery": ["online", "cod"]}
    assert opts["couriers"] == [{"code": "jnt", "fee_centavos": 12_000}]

    def quote(**kw):
        return api.post(f"{API}/orders/quote", headers=auth(buyer), json=terms(listing, **kw))

    assert quote().json() == {
        "item_price_centavos": PRICE,
        "shipping_fee_centavos": 0,
        "buyer_fee_centavos": FEE,
        "total_centavos": PRICE + FEE,
    }
    assert quote(fulfilment="delivery", courier="jnt").json()["total_centavos"] == (
        PRICE + 12_000 + FEE
    )
    assert quote(payment="cash").json()["total_centavos"] == PRICE  # no fee off-app
    assert (
        quote(fulfilment="delivery", payment="cod", courier="jnt").json()["buyer_fee_centavos"] == 0
    )

    for bad, expected in [
        (dict(fulfilment="delivery", courier="flash"), "option_unavailable"),  # not their courier
        (dict(payment="cod"), "option_unavailable"),  # COD needs delivery
        (dict(fulfilment="delivery"), "courier_required"),
        (dict(courier="jnt"), "courier_not_allowed"),
    ]:
        res = quote(**bad)
        assert code(res) == expected, (bad, res.text)

    # T23: amounts can't be sent.
    res = api.post(
        f"{API}/orders/quote",
        headers=auth(buyer),
        json={**terms(listing), "total_centavos": 100},
    )
    assert res.status_code == 422
    res = api.post(f"{API}/orders/quote", headers=auth(seller), json=terms(listing))
    assert (res.status_code, code(res)) == (409, "own_listing")
    assert api.post(f"{API}/orders/quote", json=terms(listing)).status_code == 401


async def test_accepted_offer_sets_the_price_only_for_its_buyer(api, db, users):
    seller, buyer, other = users.create("seller"), users.create("buyer"), users.create("other")
    listing = await listing_with_options(db, seller)
    conv = api.post(f"{API}/listings/{listing}/conversations", headers=auth(buyer)).json()["id"]
    offer = api.post(
        f"{API}/conversations/{conv}/offers",
        headers=auth(buyer),
        json={"amount_centavos": 800_000},
    ).json()["id"]
    q = api.post(f"{API}/orders/quote", headers=auth(buyer), json=terms(listing, offer=offer))
    assert code(q) == "offer_not_usable"  # still pending
    assert api.post(f"{API}/offers/{offer}/accept", headers=auth(seller)).status_code == 200

    q = api.post(f"{API}/orders/quote", headers=auth(buyer), json=terms(listing, offer=offer))
    assert q.json()["item_price_centavos"] == 800_000
    assert q.json()["buyer_fee_centavos"] == 1500 + 40_000
    q = api.post(f"{API}/orders/quote", headers=auth(other), json=terms(listing, offer=offer))
    assert (q.status_code, code(q)) == (409, "offer_not_usable")


# --- online order with MockPay -------------------------------------------------------


async def test_online_meetup_order_reserves_pays_and_refunds(api, db, users):
    seller, buyer, rival = users.create("seller"), users.create("buyer"), users.create("rival")
    listing = await listing_with_options(db, seller)

    res = place(api, buyer, listing)
    assert res.status_code == 201, res.text
    order = res.json()
    assert order["status"] == "pending_payment"
    assert order["total_centavos"] == PRICE + FEE
    assert order["actions"] == ["pay", "cancel", "fast_forward"]  # demo tools on in tests
    oid = order["id"]

    # The listing is reserved: no second order, no seller changes (T26).
    view = api.get(f"{API}/listings/{listing}", headers=auth(buyer)).json()
    assert (view["status"], view["my_open_order_id"]) == ("reserved", oid)
    res = place(api, rival, listing)
    assert (res.status_code, code(res)) == (409, "listing_unavailable")
    res = api.post(
        f"{API}/listings/{listing}/status", headers=auth(seller), json={"status": "paused"}
    )
    assert (res.status_code, code(res)) == (409, "listing_reserved")
    res = api.delete(f"{API}/listings/{listing}", headers=auth(seller))
    assert (res.status_code, code(res)) == (409, "listing_reserved")

    # Only the buyer pays, and only they see the MockPay session.
    res = api.post(f"{API}/orders/{oid}/pay", headers=auth(seller))
    assert (res.status_code, code(res)) == (403, "not_buyer")
    assert api.get(f"{API}/orders/{oid}", headers=auth(rival)).status_code == 404

    ref, result = pay(api, buyer, oid, "failure")
    assert result == "failed"
    assert api.get(f"{API}/orders/{oid}", headers=auth(buyer)).json()["status"] == (
        "pending_payment"
    )
    res = api.get(f"{API}/mock-pay/sessions/{ref}", headers=auth(seller))
    assert res.status_code == 404

    ref, result = pay(api, buyer, oid)
    assert result == "confirmed"
    mine = api.get(f"{API}/orders/{oid}", headers=auth(buyer)).json()
    theirs = api.get(f"{API}/orders/{oid}", headers=auth(seller)).json()
    assert mine["status"] == "confirmed" and mine["paid_at"] and mine["meet_by"]
    assert mine["payment_status"] == "succeeded"
    assert len(mine["handover_code"]) == 6 and mine["handover_code"].isdigit()
    assert theirs["handover_code"] is None  # T28: only the buyer sees the code
    assert theirs["role"] == "selling" and theirs["other_user"] is not None
    assert await ledger_sum(db, uuid.UUID(oid), "escrow") == PRICE + FEE

    wallet = api.get(f"{API}/me/wallet", headers=auth(seller)).json()
    assert (wallet["available_centavos"], wallet["pending_centavos"]) == (0, PRICE)
    buyer_wallet = api.get(f"{API}/me/wallet", headers=auth(buyer)).json()
    assert [(e["kind"], e["amount_centavos"]) for e in buyer_wallet["entries"]] == [
        ("payment", -(PRICE + FEE))
    ]

    # Paying again is refused.
    res = api.post(f"{API}/orders/{oid}/pay", headers=auth(buyer))
    assert (res.status_code, code(res)) == (409, "not_payable")

    # The seller cancels: full refund, listing back on sale.
    res = api.post(f"{API}/orders/{oid}/cancel", headers=auth(seller))
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "cancelled" and res.json()["cancel_reason"] == "seller"
    assert res.json()["refunded_at"] is not None
    assert await ledger_sum(db, uuid.UUID(oid), "escrow") == 0
    buyer_wallet = api.get(f"{API}/me/wallet", headers=auth(buyer)).json()
    assert [e["kind"] for e in buyer_wallet["entries"]] == ["refund", "payment"]
    assert api.get(f"{API}/listings/{listing}").json()["status"] == "active"
    res = api.post(f"{API}/orders/{oid}/cancel", headers=auth(buyer))
    assert (res.status_code, code(res)) == (409, "cannot_cancel")

    lists = api.get(f"{API}/orders?role=buying&state=done", headers=auth(buyer)).json()
    assert [o["id"] for o in lists["items"]] == [oid]
    assert api.get(f"{API}/orders?state=open", headers=auth(buyer)).json()["items"] == []


async def test_cash_and_cod_orders_need_no_payment(api, db, users):
    seller, buyer = users.create("seller"), users.create("buyer")
    meet = await listing_with_options(db, seller)
    ship = await listing_with_options(db, seller)

    cash = place(api, buyer, meet, payment="cash").json()
    assert (cash["status"], cash["buyer_fee_centavos"], cash["actions"]) == (
        "confirmed",
        0,
        ["new_code", "cancel", "fast_forward"],
    )
    assert cash["handover_code"] and cash["meet_by"]
    cod = place(api, buyer, ship, fulfilment="delivery", payment="cod", courier="jnt").json()
    assert (cod["status"], cod["courier"], cod["total_centavos"]) == (
        "confirmed",
        "jnt",
        PRICE + 12_000,
    )
    assert cod["handover_code"] is None and cod["ship_by"]
    res = api.post(f"{API}/orders/{cash['id']}/pay", headers=auth(buyer))
    assert (res.status_code, code(res)) == (409, "not_payable")
    # No money moved for either.
    rows = await db.admin(
        "select count(*) as n from app.ledger_entries where order_id = any($1::uuid[])",
        [uuid.UUID(cash["id"]), uuid.UUID(cod["id"])],
    )
    assert rows[0]["n"] == 0


# --- webhooks ----------------------------------------------------------------------


async def test_webhook_security_and_idempotency(api, db, users):
    seller, buyer = users.create("seller"), users.create("buyer")
    listing = await listing_with_options(db, seller)
    oid = place(api, buyer, listing).json()["id"]
    ref = api.post(f"{API}/orders/{oid}/pay", headers=auth(buyer)).json()["checkout_url"]
    ref = ref.rsplit("/", 1)[-1]
    total = PRICE + FEE

    def event(amount=total, event_id=None):
        return {
            "id": event_id or f"evt_{uuid.uuid4().hex}",
            "type": "payment.succeeded",
            "data": {"session": ref, "amount_centavos": amount},
        }

    # T24: forged, unsigned, and stale events change nothing.
    assert webhook(api, event(), secret="wrong-secret").status_code == 400  # noqa: S106
    res = api.post(f"{API}/payments/webhooks/mock", content=json.dumps(event()).encode())
    assert (res.status_code, code(res)) == (400, "bad_signature")
    assert webhook(api, event(), timestamp=1_000_000).status_code == 400
    res = webhook(api, {"id": "x"})
    assert (res.status_code, code(res)) == (400, "bad_event")
    assert api.get(f"{API}/orders/{oid}", headers=auth(buyer)).json()["status"] == (
        "pending_payment"
    )

    # T23: a different amount fails the payment.
    assert webhook(api, event(amount=100)).json() == {"result": "amount_mismatch"}
    assert api.get(f"{API}/orders/{oid}", headers=auth(buyer)).json()["payment_status"] == (
        "failed"
    )

    # A fresh session; the same event delivered twice is applied once (T25).
    ref = api.post(f"{API}/orders/{oid}/pay", headers=auth(buyer)).json()["checkout_url"]
    ref = ref.rsplit("/", 1)[-1]
    same = event(event_id=f"evt_{uuid.uuid4().hex}")
    assert webhook(api, same).json() == {"result": "confirmed"}
    assert webhook(api, same).json() == {"result": "duplicate"}
    assert webhook(api, event()).json() == {"result": "ignored"}  # session already paid
    assert await ledger_sum(db, uuid.UUID(oid), "escrow") == total
    assert await ledger_sum(db, uuid.UUID(oid), "external") == -total


async def test_late_payment_is_refunded(api, db, users):
    seller, buyer = users.create("seller"), users.create("buyer")
    listing = await listing_with_options(db, seller)
    oid = place(api, buyer, listing).json()["id"]
    url = api.post(f"{API}/orders/{oid}/pay", headers=auth(buyer)).json()["checkout_url"]
    await db.admin(
        "update app.orders set payment_due_at = now() - interval '1 minute' where id = $1",
        uuid.UUID(oid),
    )
    done = api.post(
        f"{API}/mock-pay/sessions/{url.rsplit('/', 1)[-1]}/complete",
        headers=auth(buyer),
        json={"outcome": "success"},
    )
    assert done.json()["result"] == "refunded"
    order = api.get(f"{API}/orders/{oid}", headers=auth(buyer)).json()
    assert (order["status"], order["cancel_reason"], order["payment_status"]) == (
        "cancelled",
        "payment_expired",
        "refunded",
    )
    assert await ledger_sum(db, uuid.UUID(oid), "escrow") == 0
    assert await ledger_sum(db, uuid.UUID(oid), "external") == 0
    assert api.get(f"{API}/listings/{listing}").json()["status"] == "active"


async def test_abandoned_checkout_frees_the_listing(api, db, users):
    seller, buyer, rival = users.create("seller"), users.create("buyer"), users.create("rival")
    listing = await listing_with_options(db, seller)
    oid = place(api, buyer, listing).json()["id"]
    await db.admin(
        "update app.orders set payment_due_at = now() - interval '1 minute' where id = $1",
        uuid.UUID(oid),
    )
    assert api.get(f"{API}/listings/{listing}").json()["status"] == "active"  # guest view
    assert place(api, rival, listing).status_code == 201


@pytest.mark.parametrize(
    ("fulfilment", "deadline", "reason"),
    [("delivery", "ship_by", "not_shipped"), ("meetup", "meet_by", "not_met")],
)
async def test_missed_deadlines_cancel_and_refund(api, db, users, fulfilment, deadline, reason):
    seller, buyer = users.create("seller"), users.create("buyer")
    listing = await listing_with_options(db, seller)
    courier = "jnt" if fulfilment == "delivery" else None
    oid = place(api, buyer, listing, fulfilment=fulfilment, courier=courier).json()["id"]
    pay(api, buyer, oid)
    await db.admin(
        f"update app.orders set {deadline} = now() - interval '1 minute' where id = $1",  # noqa: S608
        uuid.UUID(oid),
    )
    order = api.get(f"{API}/orders/{oid}", headers=auth(seller)).json()
    assert (order["status"], order["cancel_reason"]) == ("cancelled", reason)
    assert await ledger_sum(db, uuid.UUID(oid), "escrow") == 0


# --- wallet and ledger ---------------------------------------------------------------


async def give_balance(db, user, amount):
    """A balanced test transaction (escrow → seller), as if a sale completed."""
    txn = uuid.uuid4()
    await db.admin(
        """insert into app.ledger_entries (txn_id, account, user_id, amount_centavos, memo)
           values ($1, 'escrow', null, $3, 'test'), ($1, 'seller', $2, $4, 'Sale: test')""",
        txn,
        user.id,
        -amount,
        amount,
    )


async def test_wallet_withdrawal(api, db, users):
    seller = users.create("seller")
    await give_balance(db, seller, 50_000)

    def withdraw(amount):
        return api.post(
            f"{API}/me/wallet/withdrawals",
            headers=auth(seller),
            json={"amount_centavos": amount},
        )

    assert code(withdraw(9_999)) == "amount_too_small"
    assert code(withdraw(50_001)) == "insufficient_balance"
    assert (
        withdraw(
            50_000,
        ).status_code
        == 200
    )
    wallet = api.get(f"{API}/me/wallet", headers=auth(seller)).json()
    assert wallet["available_centavos"] == 0
    assert [(e["kind"], e["amount_centavos"]) for e in wallet["entries"]] == [
        ("withdrawal", -50_000),
        ("sale", 50_000),
    ]
    assert code(withdraw(10_000)) == "insufficient_balance"
    res = api.post(f"{API}/me/wallet/withdrawals", json={"amount_centavos": 10_000})
    assert res.status_code == 401


async def test_ledger_and_orders_are_read_only_for_users(db, users):
    seller, buyer = users.create("seller"), users.create("buyer")
    await give_balance(db, seller, 20_000)
    # Users can't write money tables or call webhook functions (T27, T24).
    await expect_error(
        db.as_user(
            seller,
            """insert into app.ledger_entries (txn_id, account, user_id, amount_centavos, memo)
               values (gen_random_uuid(), 'seller', $1, 100, 'x')""",
            seller.id,
        ),
        PERMISSION_DENIED,
    )
    await expect_error(
        db.as_user(seller, "update app.ledger_entries set amount_centavos = 1"),
        PERMISSION_DENIED,
    )
    await expect_error(
        db.as_user(buyer, "select app.payment_succeeded('mock', 'e', 'r', 1)"), PERMISSION_DENIED
    )
    await expect_error(
        db.as_user(buyer, "update app.orders set status = 'completed'"), PERMISSION_DENIED
    )
    # Only your own ledger rows are visible.
    assert await db.as_user(buyer, "select * from app.ledger_entries") == []
    assert len(await db.as_user(seller, "select * from app.ledger_entries")) == 1
    # Even the superuser can't unbalance or rewrite the ledger.
    await expect_error(
        db.admin(
            """insert into app.ledger_entries (txn_id, account, user_id, amount_centavos, memo)
               values (gen_random_uuid(), 'seller', $1, 100, 'free money')""",
            seller.id,
        ),
        CHECK_VIOLATION,
    )
    await expect_error(
        db.admin("update app.ledger_entries set amount_centavos = 1 where user_id = $1", seller.id),
        PERMISSION_DENIED,
    )


async def test_account_deletion_waits_for_orders_and_balance(api, db, users):
    seller, buyer = users.create("seller"), users.create("buyer")
    listing = await listing_with_options(db, seller)
    oid = place(api, buyer, listing, payment="cash").json()["id"]

    def delete(user):
        username = api.get(f"{API}/me", headers=auth(user)).json()["username"]
        return api.request(
            "DELETE", f"{API}/me", headers=auth(user), json={"confirm_username": username}
        )

    res = delete(buyer)
    assert (res.status_code, code(res)) == (409, "open_orders")
    assert api.post(f"{API}/orders/{oid}/cancel", headers=auth(buyer)).status_code == 200
    await give_balance(db, seller, 10_000)
    res = delete(seller)
    assert (res.status_code, code(res)) == (409, "wallet_balance")
    # The database refuses too (second wall).
    await expect_error(db.admin("delete from app.profiles where id = $1", seller.id), "MK409")
