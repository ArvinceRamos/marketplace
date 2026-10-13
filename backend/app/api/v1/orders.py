"""Orders, simulated payments (MockPay), webhooks, and the wallet. TEST MODE only.

See docs/TRANSACTIONS_DESIGN.md. Demo-only routes live in `demo_router`, which
create_app mounts only when DEMO_TOOLS_ENABLED is on.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status

from app.core.db import UserDb
from app.core.ratelimit import per_ip, per_user
from app.core.security import Claims, require_claims, user_id
from app.integrations.mockpay import SIGNATURE_HEADER, MockPay
from app.schemas.orders import (
    CheckoutOptions,
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


def _mockpay(request: Request) -> MockPay:
    return request.app.state.mockpay


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
    return await orders.create(db, user_id(claims), body, _urls(request))


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
    return await orders.detail(db, user_id(claims), order_id, _urls(request))


@router.post("/orders/{order_id}/pay", response_model=PayResponse, dependencies=[per_user("pay")])
async def pay(order_id: uuid.UUID, request: Request, db: UserDb) -> PayResponse:
    """Start a MockPay checkout session for your unpaid order."""
    return PayResponse(checkout_url=await orders.start_payment(db, order_id, _mockpay(request)))


@router.post("/orders/{order_id}/cancel", response_model=OrderDetail)
async def cancel(
    order_id: uuid.UUID, request: Request, db: UserDb, claims: UserClaims
) -> OrderDetail:
    """Cancel. A paid order is refunded in full."""
    return await orders.cancel(db, user_id(claims), order_id, _urls(request))


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
        request.headers.get(SIGNATURE_HEADER),
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
