"""Favorites, conversations, messages, and offers."""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from app.schemas.catalog import ListingStatus, SellerSummary
from app.schemas.listings import MAX_PRICE_CENTAVOS


class OfferStatus(StrEnum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"
    withdrawn = "withdrawn"
    expired = "expired"


class Role(StrEnum):
    buying = "buying"
    selling = "selling"


# --- requests --------------------------------------------------------------------


def _strip(value: str) -> str:
    return value.strip()


class MessageCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: Annotated[str, AfterValidator(_strip), Field(min_length=1, max_length=2000)]


class OfferCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount_centavos: Annotated[int, Field(ge=1, le=MAX_PRICE_CENTAVOS)]


# --- responses -------------------------------------------------------------------


class ConversationListing(BaseModel):
    """None when the listing was deleted (it is no longer visible to the buyer)."""

    id: uuid.UUID
    title: str
    price_centavos: int
    status: ListingStatus | Literal["deleted"]
    cover_thumb_url: str | None


class Offer(BaseModel):
    id: uuid.UUID
    amount_centavos: int
    status: OfferStatus
    created_at: datetime
    expires_at: datetime
    responded_at: datetime | None


class Message(BaseModel):
    id: int
    kind: Literal["text", "offer", "system"]
    body: str
    mine: bool
    created_at: datetime
    offer: Offer | None


class MessagePage(BaseModel):
    items: list[Message]  # oldest first
    next_before: int | None  # pass as ?before= to load older messages


class LastMessage(BaseModel):
    preview: str
    at: datetime
    mine: bool


class ConversationSummary(BaseModel):
    id: uuid.UUID
    role: Role
    listing: ConversationListing | None
    other_user: SellerSummary | None  # None: the other person deleted their account
    last_message: LastMessage | None
    unread_count: int


class ConversationDetail(ConversationSummary):
    latest_offer: Offer | None
    can_message: bool
    can_offer: bool


class UnreadCount(BaseModel):
    unread: int


class StartConversation(BaseModel):
    id: uuid.UUID
