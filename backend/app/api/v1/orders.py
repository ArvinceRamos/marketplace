"""Orders, simulated payments and tracking, webhooks, reviews, and the wallet. TEST MODE.

See docs/TRANSACTIONS_DESIGN.md. Demo-only routes live in `demo_router`, which
create_app mounts only when DEMO_TOOLS_ENABLED is on.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import JSONResponse

from app.core.db import Db, UserDb
from app.core.errors import AppError, error_body
from app.core.ratelimit import per_ip, per_user
from app.core.security import Claims, require_claims, user_id
from app.integrations import mockcourier, mockpay
from app.integrations.mockcourier import MockCourier
from app.integrations.mockpay import MockPay
from app.schemas.orders import (
    CheckoutOptions,
    DisputeCreate,
    DisputeNote,
    HandoverCode,
    MockPayOutcome,
    MockPayResult,
    MockPaySession,
    OrderDetail,
    OrderPage,
    OrderRole,
    OrderState,
    OrderTerms,
    PayResponse,
    Quote,
    ReviewCreate,
    ReviewList,
    Wallet,
    Withdrawal,
)
from app.services import orders
from app.services.catalog import Urls

router = APIRouter(tags=["orders (test mode)"])
demo_router = APIRouter(prefix="/api/v1", tags=["test-mode tools"])

UserClaims = Annotated[Claims, Depends(require_claims)]


def _urls(request: Request) -> Urls:
    return Urls(request.app.state.settings.public_storage_url)


def _demo(request: Request) -> bool:
    return request.app.state.settings.demo_tools


def _mockpay(request: Request) -> MockPay:
    return request.app.state.mockpay


def _mockcourier(request: Request) -> MockCourier:
    return request.app.state.mockcourier


# --- checkout ----------------------------------------------------------------------


@router.get("/listings/{listing_id}/checkout", response_model=CheckoutOptions)
async def checkout_options(
    listing_id: uuid.UUID,
    request: Request,
    db: UserDb,
    offer_id: uuid.UUID | None = None,
) -> CheckoutOptions:
    """Ways to buy this listing, and the item price (your accepted offer if given)."""
    return await orders.checkout_options(db, listing_id, offer_id, _urls(request))


@router.post("/orders/quote", response_model=Quote)
async def quote(body: OrderTerms, db: UserDb) -> Quote:
    """Amounts for these terms. Nothing is saved."""
    return await orders.quote(db, body)


@router.post(
    "/orders",
    response_model=OrderDetail,
    status_code=status.HTTP_201_CREATED,
    dependencies=[per_user("create_order")],
)
async def create_order(
    body: OrderTerms, request: Request, db: UserDb, claims: UserClaims
) -> OrderDetail:
    """Place an order. The listing is reserved until the order ends."""
    return await orders.create(db, user_id(claims), body, _urls(request), _demo(request))


# --- orders ------------------------------------------------------------------------


@router.get("/orders", response_model=OrderPage)
async def list_orders(
    request: Request,
    db: UserDb,
    claims: UserClaims,
    role: OrderRole | None = None,
    state: OrderState | None = None,
    page: Annotated[int, Query(ge=1, le=50)] = 1,
    page_size: Annotated[int, Query(ge=1, le=48)] = 20,
) -> OrderPage:
    return await orders.list_orders(
        db, user_id(claims), role, state, page, page_size, _urls(request)
    )


@router.get("/orders/{order_id}", response_model=OrderDetail)
async def get_order(
    order_id: uuid.UUID, request: Request, db: UserDb, claims: UserClaims
) -> OrderDetail:
    return await orders.detail(db, user_id(claims), order_id, _urls(request), _demo(request))


@router.post("/orders/{order_id}/pay", response_model=PayResponse, dependencies=[per_user("pay")])
async def pay(order_id: uuid.UUID, request: Request, db: UserDb) -> PayResponse:
    """Start a MockPay checkout session for your unpaid order."""
    return PayResponse(checkout_url=await orders.start_payment(db, order_id, _mockpay(request)))


async def _act(action: str, order_id: uuid.UUID, request: Request, db, claims) -> OrderDetail:
    return await orders.act(db, user_id(claims), order_id, action, _urls(request), _demo(request))


@router.post("/orders/{order_id}/cancel", response_model=OrderDetail)
async def cancel(
    order_id: uuid.UUID, request: Request, db: UserDb, claims: UserClaims
) -> OrderDetail:
    """Cancel. A paid order is refunded in full."""
    return await _act("cancel", order_id, request, db, claims)


@router.post("/orders/{order_id}/ship", response_model=OrderDetail)
async def ship(
    order_id: uuid.UUID, request: Request, db: UserDb, claims: UserClaims
) -> OrderDetail:
    """Seller: hand the parcel to the courier. Creates a fake DEMO waybill."""
    return await _act("ship", order_id, request, db, claims)


@router.post("/orders/{order_id}/confirm-received", response_model=OrderDetail)
async def confirm_received(
    order_id: uuid.UUID, request: Request, db: UserDb, claims: UserClaims
) -> OrderDetail:
    """Buyer: "Everything is OK". Releases the money to the seller."""
    return await _act("confirm_received", order_id, request, db, claims)


@router.post("/orders/{order_id}/handover-code", response_model=OrderDetail)
async def new_handover_code(
    order_id: uuid.UUID, request: Request, db: UserDb, claims: UserClaims
) -> OrderDetail:
    """Buyer: replace the meetup code (and reset wrong tries)."""
    return await _act("new_code", order_id, request, db, claims)


@router.post("/orders/{order_id}/handover", response_model=OrderDetail)
async def handover(
    order_id: uuid.UUID, body: HandoverCode, request: Request, db: UserDb, claims: UserClaims
):
    """Seller: enter the buyer's code at the meetup. Completes the order.

    A wrong code is answered without raising, so the transaction commits and the
    wrong try counts (5 tries, then the buyer must make a new code)."""
    result = await orders.handover(db, order_id, body.code)
    if result == "wrong_code":
        return JSONResponse(
            error_body("wrong_code", "That code is not right. Check it with the buyer."),
            status_code=422,
        )
    if result == "locked":
        return JSONResponse(
            error_body(
                "code_locked",
                "Too many wrong codes. The buyer needs to make a new code in their order.",
            ),
            status_code=409,
        )
    return await orders.detail(db, user_id(claims), order_id, _urls(request), _demo(request))


@router.post(
    "/orders/{order_id}/dispute",
    response_model=OrderDetail,
    dependencies=[per_user("order_action")],
)
async def open_dispute(
    order_id: uuid.UUID, body: DisputeCreate, request: Request, db: UserDb, claims: UserClaims
) -> OrderDetail:
    """Buyer: report a problem. Holds the money; the seller has 48 hours to answer."""
    return await orders.open_dispute(
        db,
        user_id(claims),
        order_id,
        body.reason.value,
        body.details,
        _urls(request),
        _demo(request),
    )


@router.post(
    "/orders/{order_id}/dispute/refund",
    response_model=OrderDetail,
    dependencies=[per_user("order_action")],
)
async def dispute_refund(
    order_id: uuid.UUID, body: DisputeNote, request: Request, db: UserDb, claims: UserClaims
) -> OrderDetail:
    """Seller: refund the buyer in full (no return in this demo)."""
    return await orders.seller_respond(
        db, user_id(claims), order_id, "refund", body.note, _urls(request), _demo(request)
    )


@router.post(
    "/orders/{order_id}/dispute/contest",
    response_model=OrderDetail,
    dependencies=[per_user("order_action")],
)
async def dispute_contest(
    order_id: uuid.UUID, body: DisputeNote, request: Request, db: UserDb, claims: UserClaims
) -> OrderDetail:
    """Seller: disagree. A moderator decides."""
    return await orders.seller_respond(
        db, user_id(claims), order_id, "contest", body.note, _urls(request), _demo(request)
    )


@router.post(
    "/orders/{order_id}/dispute/withdraw",
    response_model=OrderDetail,
    dependencies=[per_user("order_action")],
)
async def dispute_withdraw(
    order_id: uuid.UUID, request: Request, db: UserDb, claims: UserClaims
) -> OrderDetail:
    """Buyer: the problem is solved. Releases the money to the seller."""
    return await _act("dispute_withdraw", order_id, request, db, claims)


@router.post(
    "/orders/{order_id}/dispute/escalate",
    response_model=OrderDetail,
    dependencies=[per_user("order_action")],
)
async def dispute_escalate(
    order_id: uuid.UUID, request: Request, db: UserDb, claims: UserClaims
) -> OrderDetail:
    """Either side: ask a moderator to decide now."""
    return await _act("dispute_escalate", order_id, request, db, claims)


@router.post(
    "/orders/{order_id}/review",
    response_model=OrderDetail,
    dependencies=[per_user("order_action")],
)
async def review(
    order_id: uuid.UUID, body: ReviewCreate, request: Request, db: UserDb, claims: UserClaims
) -> OrderDetail:
    """One review per side, within 30 days of completion. Hidden from the other
    side until both reviewed or 14 days passed."""
    return await orders.review(
        db, user_id(claims), order_id, body.rating, body.comment, _urls(request), _demo(request)
    )


@router.get("/profiles/{username}/reviews", response_model=ReviewList)
async def profile_reviews(username: str, request: Request, db: Db) -> ReviewList:
    result = await orders.profile_reviews(db, username.lower()[:30], _urls(request))
    if result is None:
        raise AppError(404, "profile_not_found", "This seller does not exist.")
    return result


# --- wallet ------------------------------------------------------------------------


@router.get("/me/wallet", response_model=Wallet)
async def wallet(
    db: UserDb,
    claims: UserClaims,
    before: Annotated[int | None, Query(ge=1)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> Wallet:
    return await orders.wallet(db, user_id(claims), limit, before)


@router.post("/me/wallet/withdrawals", response_model=Wallet, dependencies=[per_user("withdraw")])
async def withdraw(body: Withdrawal, db: UserDb, claims: UserClaims) -> Wallet:
    """Move money to "Demo bank". Nothing is paid out for real."""
    return await orders.withdraw(db, user_id(claims), body.amount_centavos)


# --- webhooks (public, signed) -------------------------------------------------------


@router.post("/payments/webhooks/mock", dependencies=[per_ip("webhook")])
async def mockpay_webhook(request: Request) -> dict[str, str]:
    """Payment events from MockPay. Verified by signature, not by a user token."""
    result = await orders.handle_payment_webhook(
        request.app.state.engine,
        _mockpay(request),
        await request.body(),
        request.headers.get(mockpay.SIGNATURE_HEADER),
    )
    return {"result": result}


@router.post("/shipping/webhooks/mock", dependencies=[per_ip("webhook")])
async def mockcourier_webhook(request: Request) -> dict[str, str]:
    """Tracking events from MockCourier. Verified by signature."""
    result = await orders.handle_shipping_webhook(
        request.app.state.engine,
        _mockcourier(request),
        await request.body(),
        request.headers.get(mockcourier.SIGNATURE_HEADER),
    )
    return {"result": result}


# --- test-mode tools ---------------------------------------------------------------


@demo_router.get("/mock-pay/sessions/{ref}", response_model=MockPaySession)
async def mockpay_session(ref: str, db: UserDb, claims: UserClaims) -> MockPaySession:
    """What the MockPay page shows. Only the buyer can open it."""
    return await orders.mockpay_session(db, user_id(claims), ref)


@demo_router.post(
    "/mock-pay/sessions/{ref}/complete",
    response_model=MockPayResult,
    dependencies=[per_user("pay")],
)
async def mockpay_complete(
    ref: str, body: MockPayOutcome, request: Request, db: UserDb, claims: UserClaims
) -> MockPayResult:
    """The buyer presses "Simulate success/failure". MockPay signs the event and it
    goes through the webhook handler, like a real provider's call."""
    session = await orders.mockpay_session(db, user_id(claims), ref)
    provider = _mockpay(request)
    event, signature = provider.event(session.ref, session.amount_centavos, body.outcome)
    result = await orders.handle_payment_webhook(
        request.app.state.engine, provider, event, signature
    )
    return MockPayResult(order_id=session.order_id, result=result)


@demo_router.post(
    "/mock-courier/orders/{order_id}/advance",
    response_model=OrderDetail,
    dependencies=[per_user("pay")],
)
async def advance_tracking(
    order_id: uuid.UUID, request: Request, db: UserDb, claims: UserClaims
) -> OrderDetail:
    """A participant moves the parcel one tracking step (signed MockCourier event)."""
    await orders.advance_tracking(db, request.app.state.engine, order_id, _mockcourier(request))
    return await orders.detail(db, user_id(claims), order_id, _urls(request), True)


@demo_router.post(
    "/demo/orders/{order_id}/fast-forward",
    response_model=OrderDetail,
    dependencies=[per_user("pay")],
)
async def fast_forward(
    order_id: uuid.UUID, request: Request, db: UserDb, claims: UserClaims
) -> OrderDetail:
    """Skip ahead: the order's current deadline passes now, so its timer applies."""
    await orders.fast_forward(request.app.state.engine, claims, order_id)
    return await orders.detail(db, user_id(claims), order_id, _urls(request), True)
