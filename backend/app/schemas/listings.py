"""Request bodies for seller actions. Owner and status fields are never accepted here:
the seller is always the caller (from the token), and status has its own endpoint."""

import uuid
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator

from app.schemas.catalog import Courier, PaymentMethod

MAX_PRICE_CENTAVOS = 10_000_000_000  # ₱100M


def _strip(value: str) -> str:
    return value.strip()


def _note(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


Title = Annotated[str, AfterValidator(_strip), Field(min_length=3, max_length=80)]
Description = Annotated[str, AfterValidator(_strip), Field(max_length=5000)]
DealNote = Annotated[str | None, Field(max_length=200), AfterValidator(_note)]
Price = Annotated[int, Field(ge=0, le=MAX_PRICE_CENTAVOS)]
Condition = Literal["brand_new", "like_new", "lightly_used", "well_used", "heavily_used"]
# Blank = no size. Which sizes fit is checked against the category's list.
Size = Annotated[str | None, Field(max_length=20), AfterValidator(_note)]


def _unique[T](values: list[T]) -> list[T]:
    return list(dict.fromkeys(values))


PaymentMethods = Annotated[list[PaymentMethod], Field(max_length=5), AfterValidator(_unique)]
Couriers = Annotated[list[Courier], Field(max_length=5), AfterValidator(_unique)]


class ListingCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title
    description: Description = ""
    category_id: int
    city_id: int
    price_centavos: Price
    condition: Condition
    meetup: bool = True
    delivery: bool = False
    deal_note: DealNote = None
    size: Size = None
    payment_methods: PaymentMethods = []
    couriers: Couriers = []

    @model_validator(mode="after")
    def _deal_method(self) -> "ListingCreate":
        if not (self.meetup or self.delivery):
            raise ValueError("Choose meetup, delivery, or both.")
        return self


class ListingUpdate(BaseModel):
    """Partial update. Send only the fields that change; only `deal_note` and `size`
    may be null."""

    model_config = ConfigDict(extra="forbid")

    title: Title | None = None
    description: Description | None = None
    category_id: int | None = None
    city_id: int | None = None
    price_centavos: Price | None = None
    condition: Condition | None = None
    meetup: bool | None = None
    delivery: bool | None = None
    deal_note: DealNote = None
    size: Size = None
    payment_methods: PaymentMethods | None = None
    couriers: Couriers | None = None

    @model_validator(mode="after")
    def _no_nulls(self) -> "ListingUpdate":
        for name in self.model_fields_set - {"deal_note", "size"}:
            if getattr(self, name) is None:
                raise ValueError(f"{name} cannot be empty.")
        return self


class StatusChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["active", "paused", "sold"]


class ImageOrder(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image_ids: list[uuid.UUID] = Field(min_length=1, max_length=8)
