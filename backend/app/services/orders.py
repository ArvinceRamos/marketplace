"""Orders, simulated payments, and the wallet (docs/TRANSACTIONS_DESIGN.md).

TEST MODE: no real money moves. Every change runs in a database function
(`security definer`) that checks the caller, locks rows, and checks the state;
this module calls them and shapes the answers. Their errors (SQLSTATE MKnnn) become
API errors in app.core.errors. Due timers are applied before every read (lazy).
"""

import json
import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine

from app.core.db import integration_transaction
from app.core.errors import AppError, db_app_error
from app.integrations import signing
from app.integrations.mockcourier import MockCourier, next_step
from app.integrations.mockpay import MockPay
from app.schemas.catalog import SellerSummary
from app.schemas.orders import (
    OPEN_STATUSES,
    CheckoutOptions,
    CourierOption,
    Dispute,
    Fulfilment,
    MockPaySession,
    OrderDetail,
    OrderPage,
    OrderPayment,
    OrderReview,
    OrderRole,
    OrderState,
    OrderSummary,
    OrderTerms,
    PublicReview,
    Quote,
    ReviewList,
    Shipment,
    ShipmentEvent,
    Wallet,
    WalletEntry,
)
from app.services.catalog import Urls

logger = logging.getLogger("app.orders")

COURIERS = ("jnt", "flash", "lbc", "lalamove", "grab")
_ORDER_GONE = AppError(404, "order_not_found", "This order was not found.")
_TERMS_ARGS = (
    ":listing, :offer, cast(:fulfilment as app.order_fulfilment), "
    "cast(:payment as app.order_payment), :courier"
)


def _terms(body: OrderTerms) -> dict[str, Any]:
    return {
        "listing": body.listing_id,
        "offer": body.offer_id,
        "fulfilment": body.fulfilment.value,
        "payment": body.payment_method.value,
        "courier": body.courier.value if body.courier else None,
    }


# --- checkout ----------------------------------------------------------------------


async def quote(db: AsyncConnection, body: OrderTerms) -> Quote:
    row = (
        await db.execute(
            text(f"select * from app.order_quote({_TERMS_ARGS})"),  # noqa: S608 - fixed
            _terms(body),
        )
    ).one()
    return Quote(
        item_price_centavos=row.item,
        shipping_fee_centavos=row.shipping,
        buyer_fee_centavos=row.fee,
        total_centavos=row.total,
    )


async def checkout_options(
    db: AsyncConnection, listing_id: uuid.UUID, offer_id: uuid.UUID | None, urls: Urls
) -> CheckoutOptions:
    await db.execute(text("select app.listing_tick(:id)"), {"id": listing_id})
    listing = (
        (
            await db.execute(
                text(
                    """select l.id, l.title, l.meetup, l.delivery, l.payment_methods, l.couriers,
                              p.username::text as username, p.display_name, p.avatar_path,
                              (select i.thumb_path from app.listing_images i
                                where i.listing_id = l.id order by i.position limit 1) as thumb
                       from app.listings l join app.profiles p on p.id = l.seller_id
                       where l.id = :id and l.moderation = 'ok'
                         and l.status in ('active', 'paused', 'sold', 'reserved')"""
                ),
                {"id": listing_id},
            )
        )
        .mappings()
        .first()
    )
    if listing is None:
        raise AppError(404, "listing_not_found", "This listing is not available.")

    methods: dict[Fulfilment, list[OrderPayment]] = {}
    if listing["meetup"]:
        methods[Fulfilment.meetup] = [OrderPayment.online]
        if "cash" in listing["payment_methods"]:
            methods[Fulfilment.meetup].append(OrderPayment.cash)
    if listing["delivery"]:
        methods[Fulfilment.delivery] = [OrderPayment.online]
        if "cod" in listing["payment_methods"]:
            methods[Fulfilment.delivery].append(OrderPayment.cod)
    allowed = [c for c in COURIERS if not listing["couriers"] or c in listing["couriers"]]
    fees = (
        await db.execute(
            text("select c, app.shipping_fee(c) as fee from unnest(cast(:c as text[])) c"),
            {"c": allowed},
        )
    ).all()

    # Pricing the first allowed option runs every buyer check (own listing,
    # unavailable, blocked, offer not usable) and gives the item price.
    first = next(iter(methods))
    probe = OrderTerms(
        listing_id=listing_id,
        offer_id=offer_id,
        fulfilment=first,
        payment_method=OrderPayment.online,
        courier=allowed[0] if first == Fulfilment.delivery else None,
    )
    price = await quote(db, probe)
    return CheckoutOptions(
        listing_id=listing["id"],
        title=listing["title"],
        cover_thumb_url=urls.listing(listing["thumb"]),
        seller=SellerSummary(
            username=listing["username"],
            display_name=listing["display_name"],
            avatar_url=urls.avatar(listing["avatar_path"]),
        ),
        offer_id=offer_id,
        item_price_centavos=price.item_price_centavos,
        payment_methods=methods,
        couriers=[CourierOption(code=r.c, fee_centavos=r.fee) for r in fees],
    )


async def create(
    db: AsyncConnection, uid: uuid.UUID, body: OrderTerms, urls: Urls, demo: bool = False
) -> OrderDetail:
    order_id = (
        await db.execute(
            text(f"select app.order_create({_TERMS_ARGS})"),  # noqa: S608 - fixed
            _terms(body),
        )
    ).scalar_one()
    return await detail(db, uid, order_id, urls, demo)


# --- reading -----------------------------------------------------------------------

_ORDER_SQL = """
    select o.*, o.status::text as status_text, o.fulfilment::text as fulfilment_text,
           o.payment_method::text as payment_text,
           op.username::text as o_username, op.display_name as o_display,
           op.avatar_path as o_avatar
    from app.orders o
    left join app.profiles op
      on op.id = case when o.buyer_id = :uid then o.seller_id else o.buyer_id end
    where :uid in (o.buyer_id, o.seller_id)
"""


def _summary_fields(row: Any, uid: uuid.UUID, urls: Urls) -> dict[str, Any]:
    other = None
    if row["o_username"] is not None:
        other = SellerSummary(
            username=row["o_username"],
            display_name=row["o_display"],
            avatar_url=urls.avatar(row["o_avatar"]),
        )
    return {
        "id": row["id"],
        "role": OrderRole.buying if row["buyer_id"] == uid else OrderRole.selling,
        "status": row["status_text"],
        "title": row["title"],
        "cover_thumb_url": urls.listing(row["cover_path"]),
        "listing_id": row["listing_id"],
        "other_user": other,
        "fulfilment": row["fulfilment_text"],
        "payment_method": row["payment_text"],
        "total_centavos": row["total_centavos"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


async def list_orders(
    db: AsyncConnection,
    uid: uuid.UUID,
    role: OrderRole | None,
    state: OrderState | None,
    page: int,
    page_size: int,
    urls: Urls,
) -> OrderPage:
    await db.execute(text("select app.orders_tick_mine()"))
    where = []
    if role == OrderRole.buying:
        where.append("o.buyer_id = :uid")
    elif role == OrderRole.selling:
        where.append("o.seller_id = :uid")
    if state == OrderState.open:
        where.append("app.order_is_open(o.status)")
    elif state == OrderState.done:
        where.append("not app.order_is_open(o.status)")
    extra = "".join(f" and {w}" for w in where)
    rows = list(
        (
            await db.execute(
                text(
                    f"{_ORDER_SQL}{extra} order by o.updated_at desc, o.id "  # noqa: S608
                    "limit :limit offset :offset"
                ),
                {"uid": uid, "limit": page_size + 1, "offset": (page - 1) * page_size},
            )
        ).mappings()
    )
    return OrderPage(
        items=[OrderSummary(**_summary_fields(r, uid, urls)) for r in rows[:page_size]],
        page=page,
        page_size=page_size,
        has_next=len(rows) > page_size,
    )


def actions_for(
    row: Any,
    uid: uuid.UUID,
    *,
    can_review: bool = False,
    demo: bool = False,
    dispute: Dispute | None = None,
) -> list[str]:
    """What the caller may do now. The database checks each action again."""
    buyer = row["buyer_id"] == uid
    status = row["status_text"]
    meetup = row["fulfilment_text"] == "meetup"
    online = row["payment_text"] == "online"
    actions: list[str] = []
    if status == "pending_payment" and buyer:
        actions += ["pay", "cancel"]
    elif status == "confirmed":
        if not buyer:
            actions.append("handover" if meetup else "ship")
        elif meetup:
            actions.append("new_code")
        actions.append("cancel")
    elif status in ("shipped", "delivered") and buyer and online:
        actions += ["confirm_received", "open_dispute"]
    elif status == "disputed" and dispute is not None and dispute.status != "resolved":
        if dispute.status == "open":
            actions += ["dispute_escalate"] if buyer else ["dispute_refund", "dispute_contest"]
        if buyer:
            actions.append("dispute_withdraw")
    if status == "shipped" and demo:
        actions.append("advance_tracking")
    open_dispute = dispute is not None and dispute.status == "open"
    if demo and (status in ("pending_payment", "confirmed", "delivered") or open_dispute):
        actions.append("fast_forward")
    if can_review:
        actions.append("review")
    return actions


async def _shipment(db: AsyncConnection, order_id: uuid.UUID) -> Shipment | None:
    row = (
        await db.execute(
            text(
                """select courier, tracking_number, status::text as status
                   from app.shipments where order_id = :id"""
            ),
            {"id": order_id},
        )
    ).first()
    if row is None:
        return None
    events = await db.execute(
        text(
            """select status::text as status, created_at from app.shipment_events
               where order_id = :id order by id"""
        ),
        {"id": order_id},
    )
    return Shipment(
        courier=row.courier,
        tracking_number=row.tracking_number,
        status=row.status,
        events=[ShipmentEvent(status=e.status, created_at=e.created_at) for e in events],
    )


async def _reviews(
    db: AsyncConnection, uid: uuid.UUID, order_id: uuid.UUID
) -> tuple[OrderReview | None, OrderReview | None]:
    """Mine, and theirs. RLS hides theirs until reviews are public (double-blind)."""
    mine = theirs = None
    rows = await db.execute(
        text(
            """select reviewer_id, rating, comment, created_at from app.reviews
               where order_id = :id"""
        ),
        {"id": order_id},
    )
    for r in rows:
        review = OrderReview(rating=r.rating, comment=r.comment, created_at=r.created_at)
        if r.reviewer_id == uid:
            mine = review
        else:
            theirs = review
    return mine, theirs


async def _dispute(db: AsyncConnection, order_id: uuid.UUID) -> Dispute | None:
    row = (
        (
            await db.execute(
                text(
                    """select id, reason::text as reason, details, status::text as status,
                              respond_by, seller_note, admin_note, outcome, created_at,
                              resolved_at
                       from app.disputes where order_id = :id"""
                ),
                {"id": order_id},
            )
        )
        .mappings()
        .first()
    )
    return Dispute(**row) if row else None


async def detail(
    db: AsyncConnection, uid: uuid.UUID, order_id: uuid.UUID, urls: Urls, demo: bool = False
) -> OrderDetail:
    await db.execute(text("select app.order_tick(:id)"), {"id": order_id})
    row = (
        (await db.execute(text(f"{_ORDER_SQL} and o.id = :id"), {"uid": uid, "id": order_id}))
        .mappings()
        .first()
    )
    if row is None:
        raise _ORDER_GONE
    payment_status = (
        await db.execute(
            text(
                """select status::text from app.payments where order_id = :id
                   order by created_at desc limit 1"""
            ),
            {"id": order_id},
        )
    ).scalar_one_or_none()
    code = None
    if row["buyer_id"] == uid and row["status_text"] in OPEN_STATUSES:
        # RLS returns the code to the buyer only.
        code = (
            await db.execute(
                text("select handover_code from app.order_secrets where order_id = :id"),
                {"id": order_id},
            )
        ).scalar_one_or_none()
    mine, theirs = await _reviews(db, uid, order_id)
    dispute = await _dispute(db, order_id)
    review_until = None
    if row["status_text"] == "completed" and row["completed_at"] is not None:
        review_until = row["completed_at"] + timedelta(days=30)
    other_here = (row["seller_id"] if row["buyer_id"] == uid else row["buyer_id"]) is not None
    can_review = (
        review_until is not None
        and mine is None
        and other_here
        and review_until > datetime.now(UTC)
    )
    return OrderDetail(
        **_summary_fields(row, uid, urls),
        courier=row["courier"],
        item_price_centavos=row["item_price_centavos"],
        shipping_fee_centavos=row["shipping_fee_centavos"],
        buyer_fee_centavos=row["buyer_fee_centavos"],
        offer_id=row["offer_id"],
        cancel_reason=row["cancel_reason"],
        payment_status=payment_status,
        paid_at=row["paid_at"],
        shipped_at=row["shipped_at"],
        delivered_at=row["delivered_at"],
        completed_at=row["completed_at"],
        cancelled_at=row["cancelled_at"],
        refunded_at=row["refunded_at"],
        payment_due_at=row["payment_due_at"],
        ship_by=row["ship_by"],
        meet_by=row["meet_by"],
        confirm_by=row["confirm_by"],
        handover_code=code,
        shipment=await _shipment(db, order_id),
        my_review=mine,
        their_review=theirs,
        review_until=review_until,
        dispute=dispute,
        actions=actions_for(row, uid, can_review=can_review, demo=demo, dispute=dispute),
    )


# --- order actions -----------------------------------------------------------------


# Simple actions: one database function each, then the fresh detail.
ACTION_SQL = {
    "cancel": "select app.order_cancel(:id)",
    "ship": "select app.order_ship(:id)",
    "confirm_received": "select app.order_confirm_received(:id)",
    "new_code": "select app.order_new_handover_code(:id)",
    "dispute_withdraw": "select app.dispute_withdraw(:id)",
    "dispute_escalate": "select app.dispute_escalate(:id)",
}


async def open_dispute(
    db: AsyncConnection,
    uid: uuid.UUID,
    order_id: uuid.UUID,
    reason: str,
    details: str | None,
    urls: Urls,
    demo: bool,
) -> OrderDetail:
    await db.execute(
        text("select app.dispute_open(:id, cast(:reason as app.dispute_reason), :details)"),
        {"id": order_id, "reason": reason, "details": details},
    )
    return await detail(db, uid, order_id, urls, demo)


async def seller_respond(
    db: AsyncConnection,
    uid: uuid.UUID,
    order_id: uuid.UUID,
    action: str,
    note: str | None,
    urls: Urls,
    demo: bool,
) -> OrderDetail:
    await db.execute(
        text("select app.dispute_seller_respond(:id, :action, :note)"),
        {"id": order_id, "action": action, "note": note},
    )
    return await detail(db, uid, order_id, urls, demo)


async def act(
    db: AsyncConnection,
    uid: uuid.UUID,
    order_id: uuid.UUID,
    action: str,
    urls: Urls,
    demo: bool,
) -> OrderDetail:
    await db.execute(text(ACTION_SQL[action]), {"id": order_id})
    return await detail(db, uid, order_id, urls, demo)


async def handover(db: AsyncConnection, order_id: uuid.UUID, code: str) -> str:
    """'ok', 'wrong_code', or 'locked'. Not an exception, so a wrong try is saved."""
    return (
        await db.execute(
            text("select app.order_handover(:id, :code)"), {"id": order_id, "code": code}
        )
    ).scalar_one()


async def review(
    db: AsyncConnection,
    uid: uuid.UUID,
    order_id: uuid.UUID,
    rating: int,
    comment: str | None,
    urls: Urls,
    demo: bool,
) -> OrderDetail:
    await db.execute(
        text("select app.review_create(:id, cast(:rating as smallint), :comment)"),
        {"id": order_id, "rating": rating, "comment": comment},
    )
    return await detail(db, uid, order_id, urls, demo)


async def profile_reviews(db: AsyncConnection, username: str, urls: Urls) -> ReviewList | None:
    """Public reviews about a user, newest first (app.public_reviews checks visibility)."""
    profile = (
        await db.execute(
            text(
                """select p.id, rs.average, rs.total from app.profiles p
                   cross join lateral app.rating_summary(p.id) rs
                   where p.username = :u"""
            ),
            {"u": username},
        )
    ).first()
    if profile is None:
        return None
    rows = await db.execute(
        text(
            """select r.rating, r.comment, r.created_at, r.title, r.by_buyer,
                      p.username::text as username, p.display_name, p.avatar_path
               from app.public_reviews(:pid) r
               left join app.profiles p on p.id = r.reviewer_id
               order by r.created_at desc limit 50"""
        ),
        {"pid": profile.id},
    )
    items = [
        PublicReview(
            rating=r.rating,
            comment=r.comment,
            created_at=r.created_at,
            reviewer=(
                SellerSummary(
                    username=r.username,
                    display_name=r.display_name,
                    avatar_url=urls.avatar(r.avatar_path),
                )
                if r.username
                else None
            ),
            reviewer_role="buyer" if r.by_buyer else "seller",
            title=r.title,
        )
        for r in rows
    ]
    return ReviewList(
        average=float(profile.average) if profile.average is not None else None,
        count=profile.total,
        items=items,
    )


async def start_payment(db: AsyncConnection, order_id: uuid.UUID, provider: MockPay) -> str:
    ref = provider.create_session()
    await db.execute(
        text("select app.payment_start(:id, :provider, :ref)"),
        {"id": order_id, "provider": provider.name, "ref": ref},
    )
    return f"/pay/mock/{ref}"


# --- MockPay (test-mode provider) ----------------------------------------------------


async def mockpay_session(db: AsyncConnection, uid: uuid.UUID, ref: str) -> MockPaySession:
    row = (
        (
            await db.execute(
                text(
                    """select p.provider_ref, p.amount_centavos, p.status::text as status,
                              o.id as order_id, o.title, o.buyer_id
                       from app.payments p join app.orders o on o.id = p.order_id
                       where p.provider = 'mock' and p.provider_ref = :ref"""
                ),
                {"ref": ref},
            )
        )
        .mappings()
        .first()
    )
    if row is None or row["buyer_id"] != uid:
        raise AppError(404, "session_not_found", "This checkout session was not found.")
    return MockPaySession(
        ref=row["provider_ref"],
        order_id=row["order_id"],
        title=row["title"],
        amount_centavos=row["amount_centavos"],
        status=row["status"],
    )


async def advance_tracking(
    db: AsyncConnection, engine: AsyncEngine | None, order_id: uuid.UUID, courier: MockCourier
) -> str:
    """Demo: MockCourier sends the next tracking step. Reads without locking, so the
    separate integration transaction can't wait on this one."""
    row = (
        await db.execute(
            text(
                """select s.tracking_number, s.status::text as status from app.shipments s
                   join app.orders o on o.id = s.order_id
                   where s.order_id = :id and o.status = 'shipped'"""
            ),
            {"id": order_id},
        )
    ).first()
    step = next_step(row.status) if row else None
    if row is None or step is None:
        raise AppError(409, "nothing_to_advance", "This parcel has no next tracking step.")
    body, signature = courier.event(row.tracking_number, step)
    return await handle_shipping_webhook(engine, courier, body, signature)


async def handle_shipping_webhook(
    engine: AsyncEngine | None, courier: MockCourier, body: bytes, signature: str | None
) -> str:
    """Verify and apply a tracking event (public route and the demo button)."""
    try:
        courier.verify(body, signature)
    except signing.SignatureError as exc:
        logger.warning("Rejected %s webhook: %s", courier.name, exc)
        raise AppError(400, "bad_signature", "The webhook signature is invalid.") from exc
    try:
        event = json.loads(body)
        params = {
            "provider": courier.name,
            "event": str(event["id"]),
            "tracking": str(event["data"]["tracking_number"]),
            "status": str(event["data"]["status"]),
        }
    except (ValueError, KeyError, TypeError) as exc:
        raise AppError(400, "bad_event", "The webhook body is not a valid event.") from exc
    if params["status"] not in ("picked_up", "in_transit", "out_for_delivery", "delivered"):
        raise AppError(400, "bad_event", "Unknown tracking status.")
    sql = text(
        """select app.shipment_event(:provider, :event, :tracking,
                                     cast(:status as app.shipment_status))"""
    )
    async with integration_transaction(engine) as conn:
        try:
            result = (await conn.execute(sql, params)).scalar_one()
        except DBAPIError as exc:
            if (err := db_app_error(exc)) is not None:
                raise err from exc
            raise
    logger.info("Shipping webhook %s -> %s", params["status"], result)
    return result


async def fast_forward(engine: AsyncEngine | None, claims: dict, order_id: uuid.UUID) -> str:
    """Demo: move the order's current deadline to now (app_integrations + the
    caller's verified claims; the function checks they take part in the order)."""
    async with integration_transaction(engine, claims) as conn:
        try:
            return (
                await conn.execute(text("select app.demo_fast_forward(:id)"), {"id": order_id})
            ).scalar_one()
        except DBAPIError as exc:
            if (err := db_app_error(exc)) is not None:
                raise err from exc
            raise


async def handle_payment_webhook(
    engine: AsyncEngine | None, provider: MockPay, body: bytes, signature: str | None
) -> str:
    """Verify and apply a payment event. Shared by the public webhook route and the
    MockPay buttons, so both go through the same checks."""
    try:
        provider.verify(body, signature)
    except signing.SignatureError as exc:
        logger.warning("Rejected %s webhook: %s", provider.name, exc)
        raise AppError(400, "bad_signature", "The webhook signature is invalid.") from exc
    try:
        event = json.loads(body)
        event_id = str(event["id"])
        kind = str(event["type"])
        ref = str(event["data"]["session"])
        amount = int(event["data"]["amount_centavos"])
    except (ValueError, KeyError, TypeError) as exc:
        raise AppError(400, "bad_event", "The webhook body is not a valid event.") from exc
    if kind not in ("payment.succeeded", "payment.failed"):
        return "ignored"
    params = {"provider": provider.name, "event": event_id, "ref": ref, "amount": amount}
    async with integration_transaction(engine) as conn:
        if kind == "payment.succeeded":
            sql = "select app.payment_succeeded(:provider, :event, :ref, :amount)"
        else:
            sql = "select app.payment_failed(:provider, :event, :ref)"
            params.pop("amount")
        try:
            result = (await conn.execute(text(sql), params)).scalar_one()
        except DBAPIError as exc:
            if (err := db_app_error(exc)) is not None:
                raise err from exc
            raise
    logger.info("Payment webhook %s %s -> %s", provider.name, kind, result)
    return result


# --- wallet ------------------------------------------------------------------------


async def wallet(db: AsyncConnection, uid: uuid.UUID, limit: int, before: int | None) -> Wallet:
    await db.execute(text("select app.orders_tick_mine()"))
    available = (
        await db.execute(
            text(
                """select coalesce(sum(amount_centavos), 0) from app.ledger_entries
                   where account = 'seller' and user_id = :uid"""
            ),
            {"uid": uid},
        )
    ).scalar_one()
    pending = (
        await db.execute(
            text(
                """select coalesce(sum(item_price_centavos), 0) from app.orders
                   where seller_id = :uid and payment_method = 'online' and paid_at is not null
                     and app.order_is_open(status)"""
            ),
            {"uid": uid},
        )
    ).scalar_one()
    # My side of each money movement. A withdrawal has a seller row and an external
    # row for the same user; only the seller row is shown.
    rows = list(
        (
            await db.execute(
                text(
                    """select e.id, e.order_id, e.account::text as account, e.amount_centavos,
                              e.memo, e.created_at
                       from app.ledger_entries e
                       where e.user_id = :uid
                         and (cast(:before as bigint) is null or e.id < :before)
                         and not (e.account = 'external' and exists (
                           select 1 from app.ledger_entries s
                           where s.txn_id = e.txn_id and s.account = 'seller'))
                       order by e.id desc limit :limit"""
                ),
                {"uid": uid, "before": before, "limit": limit + 1},
            )
        ).mappings()
    )

    def kind(r: Any) -> str:
        if r["account"] == "seller":
            return "sale" if r["amount_centavos"] > 0 else "withdrawal"
        return "refund" if r["amount_centavos"] > 0 else "payment"

    return Wallet(
        available_centavos=available,
        pending_centavos=pending,
        entries=[
            WalletEntry(
                id=r["id"],
                order_id=r["order_id"],
                kind=kind(r),
                amount_centavos=r["amount_centavos"],
                memo=r["memo"],
                created_at=r["created_at"],
            )
            for r in rows[:limit]
        ],
        has_more=len(rows) > limit,
    )


async def withdraw(db: AsyncConnection, uid: uuid.UUID, amount: int) -> Wallet:
    await db.execute(text("select app.wallet_withdraw(:amount)"), {"amount": amount})
    return await wallet(db, uid, 20, None)
