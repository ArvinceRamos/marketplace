"""Orders, simulated payments, and the wallet (docs/TRANSACTIONS_DESIGN.md).

Requests never carry amounts: the database computes every price and fee.
"""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from app.schemas.catalog import Courier, SellerSummary


class Fulfilment(StrEnum):
    meetup = "meetup"
    delivery = "delivery"


class OrderPayment(StrEnum):
    online = "online"  # MockPay, held until the order completes
    cash = "cash"  # cash at the meetup; the app records the deal only
    cod = "cod"  # cash on delivery, collected by the (simulated) courier


class OrderStatus(StrEnum):
    pending_payment = "pending_payment"
    confirmed = "confirmed"
    shipped = "shipped"
    delivered = "delivered"
    completed = "completed"
    cancelled = "cancelled"
    disputed = "disputed"
    refunded = "refunded"


OPEN_STATUSES = ("pending_payment", "confirmed", "shipped", "delivered", "disputed")


class OrderRole(StrEnum):
    buying = "buying"
    selling = "selling"


class OrderState(StrEnum):
    open = "open"
    done = "done"


# --- requests --------------------------------------------------------------------


class OrderTerms(BaseModel):
    model_config = ConfigDict(extra="forbid")

    listing_id: uuid.UUID
    offer_id: uuid.UUID | None = None
    fulfilment: Fulfilment
    payment_method: OrderPayment
    courier: Courier | None = None


class Withdrawal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount_centavos: Annotated[int, Field(ge=1, le=10_000_000_000)]


class HandoverCode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: Annotated[str, Field(pattern=r"^[0-9]{6}$")]


def _strip(value: str | None) -> str | None:
    return value.strip() if value is not None else None


class ReviewCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rating: Annotated[int, Field(ge=1, le=5)]
    comment: Annotated[str | None, AfterValidator(_strip), Field(max_length=1000)] = None


class MockPayOutcome(BaseModel):
    model_config = ConfigDict(extra="forbid")

    outcome: Literal["success", "failure"]


# --- responses -------------------------------------------------------------------


class Quote(BaseModel):
    item_price_centavos: int
    shipping_fee_centavos: int
    buyer_fee_centavos: int
    total_centavos: int


class CourierOption(BaseModel):
    code: Courier
    fee_centavos: int


class CheckoutOptions(BaseModel):
    listing_id: uuid.UUID
    title: str
    cover_thumb_url: str | None
    seller: SellerSummary
    offer_id: uuid.UUID | None
    item_price_centavos: int
    # Payment methods allowed for each deal method; a missing key = not offered.
    payment_methods: dict[Fulfilment, list[OrderPayment]]
    couriers: list[CourierOption]


class OrderSummary(BaseModel):
    id: uuid.UUID
    role: OrderRole
    status: OrderStatus
    title: str
    cover_thumb_url: str | None
    listing_id: uuid.UUID | None
    other_user: SellerSummary | None  # None after that user deleted their account
    fulfilment: Fulfilment
    payment_method: OrderPayment
    total_centavos: int
    created_at: datetime
    updated_at: datetime


class OrderPage(BaseModel):
    items: list[OrderSummary]
    page: int
    page_size: int
    has_next: bool


class ShipmentEvent(BaseModel):
    status: str
    created_at: datetime


class Shipment(BaseModel):
    courier: Courier
    tracking_number: str  # a fake DEMO-... waybill
    status: str
    events: list[ShipmentEvent]


class OrderReview(BaseModel):
    rating: int
    comment: str | None
    created_at: datetime


class OrderDetail(OrderSummary):
    courier: Courier | None
    item_price_centavos: int
    shipping_fee_centavos: int
    buyer_fee_centavos: int
    offer_id: uuid.UUID | None
    cancel_reason: str | None
    payment_status: str | None  # latest MockPay session, if any
    paid_at: datetime | None
    shipped_at: datetime | None
    delivered_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    refunded_at: datetime | None
    payment_due_at: datetime | None
    ship_by: datetime | None
    meet_by: datetime | None
    confirm_by: datetime | None
    handover_code: str | None  # buyer only, open meetup orders
    shipment: Shipment | None
    my_review: OrderReview | None
    their_review: OrderReview | None  # only once reviews are public (double-blind)
    review_until: datetime | None
    actions: list[str]  # what the caller may do now


class PayResponse(BaseModel):
    checkout_url: str


class MockPaySession(BaseModel):
    ref: str
    order_id: uuid.UUID
    title: str
    amount_centavos: int
    status: str


class MockPayResult(BaseModel):
    order_id: uuid.UUID
    result: str


class HandoverResult(BaseModel):
    result: Literal["ok", "wrong_code", "locked"]


class PublicReview(BaseModel):
    rating: int
    comment: str | None
    created_at: datetime
    reviewer: SellerSummary | None  # None after that user deleted their account
    reviewer_role: Literal["buyer", "seller"]
    title: str


class ReviewList(BaseModel):
    average: float | None
    count: int
    items: list[PublicReview]


class WalletEntry(BaseModel):
    id: int
    order_id: uuid.UUID | None
    kind: Literal["sale", "withdrawal", "payment", "refund"]
    amount_centavos: int  # + money to you, - money from you
    memo: str
    created_at: datetime


class Wallet(BaseModel):
    available_centavos: int
    pending_centavos: int
    entries: list[WalletEntry]
    has_more: bool
