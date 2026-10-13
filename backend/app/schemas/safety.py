import uuid
from datetime import datetime
from enum import StrEnum
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, StringConstraints, model_validator

from app.schemas.catalog import SellerSummary
from app.schemas.profile import Username


class ReportTarget(StrEnum):
    listing = "listing"
    user = "user"


class ReportReason(StrEnum):
    prohibited_item = "prohibited_item"
    scam = "scam"
    counterfeit = "counterfeit"
    offensive = "offensive"
    spam = "spam"
    other = "other"


class ReportStatus(StrEnum):
    open = "open"
    reviewing = "reviewing"
    actioned = "actioned"
    dismissed = "dismissed"


Details = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]


class ReportCreate(BaseModel):
    """Report a listing (by ID) or a user (by username). Never a reporter ID:
    the reporter is the token's user."""

    model_config = ConfigDict(extra="forbid")

    target_type: ReportTarget
    listing_id: uuid.UUID | None = None
    username: Username | None = None
    reason: ReportReason
    details: Details | None = None

    @model_validator(mode="after")
    def _one_target(self) -> Self:
        if self.target_type == ReportTarget.listing:
            if self.listing_id is None or self.username is not None:
                raise ValueError("Send listing_id (and no username) for a listing report.")
        elif self.username is None or self.listing_id is not None:
            raise ValueError("Send username (and no listing_id) for a user report.")
        if self.details == "":
            self.details = None
        return self


class ReportedListing(BaseModel):
    id: uuid.UUID
    title: str


class Report(BaseModel):
    id: uuid.UUID
    target_type: ReportTarget
    # None once the listing or user was deleted; the report itself is kept.
    listing: ReportedListing | None
    user: SellerSummary | None
    reason: ReportReason
    details: str | None
    status: ReportStatus
    created_at: datetime


class BlockedUser(SellerSummary):
    blocked_at: datetime


class AccountDelete(BaseModel):
    model_config = ConfigDict(extra="forbid")

    confirm_username: Annotated[str, StringConstraints(strip_whitespace=True, max_length=30)]
