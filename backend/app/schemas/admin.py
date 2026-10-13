"""Moderator screens: reports, listings, users, disputes, audit log (Phase 12)."""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from app.schemas.catalog import SellerSummary
from app.schemas.orders import Dispute

# Constraints sit on the str, so an explicit null is accepted.
Note = Annotated[str, AfterValidator(str.strip), Field(max_length=500)] | None


# --- requests --------------------------------------------------------------------


class ReportUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["reviewing", "actioned", "dismissed"]
    note: Note = None
    hide_listing: bool = False  # listing reports only
    restrict_user: bool = False  # the reported user, or the listing's seller


class ModerationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    moderation: Literal["ok", "hidden"]
    note: Note = None


class RestrictionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    restricted: bool
    note: Note = None


class DisputeDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    outcome: Literal["refund_buyer", "release_seller"]
    note: Annotated[str, AfterValidator(str.strip), Field(min_length=1, max_length=500)]


# --- responses -------------------------------------------------------------------


class Summary(BaseModel):
    open_reports: int
    open_disputes: int
    escalated_disputes: int
    restricted_users: int
    hidden_listings: int
    open_orders: int


class ReportListing(BaseModel):
    id: uuid.UUID
    title: str
    status: str
    hidden: bool
    seller_username: str | None


class ReportUser(BaseModel):
    username: str
    display_name: str | None
    restricted: bool


class AdminReport(BaseModel):
    id: uuid.UUID
    status: str
    reason: str
    details: str | None
    created_at: datetime
    reporter: SellerSummary | None
    target_type: Literal["listing", "user"]
    listing: ReportListing | None  # None once the listing was deleted
    user: ReportUser | None  # None once the user was deleted


class AdminUser(BaseModel):
    username: str
    display_name: str | None
    avatar_url: str | None
    joined_at: datetime
    restricted_at: datetime | None
    active_listings: int
    open_reports: int


class DisputeOrder(BaseModel):
    id: uuid.UUID
    title: str
    status: str
    fulfilment: str
    item_price_centavos: int
    total_centavos: int
    buyer: str | None
    seller: str | None
    shipped_at: datetime | None
    delivered_at: datetime | None
    # What the listing said when it was bought (null for orders before Phase 14).
    description: str | None
    condition: str | None


class AdminDispute(Dispute):
    order: DisputeOrder


class AdminAction(BaseModel):
    id: int
    admin: SellerSummary | None
    action: str
    target_type: str
    target_id: uuid.UUID | None
    note: str | None
    created_at: datetime
