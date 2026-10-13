import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class Condition(StrEnum):
    brand_new = "brand_new"
    like_new = "like_new"
    lightly_used = "lightly_used"
    well_used = "well_used"
    heavily_used = "heavily_used"


class ListingStatus(StrEnum):
    draft = "draft"
    active = "active"
    paused = "paused"
    sold = "sold"


class SortOrder(StrEnum):
    newest = "newest"
    price_asc = "price_asc"
    price_desc = "price_desc"
    relevance = "relevance"


class CategoryRef(BaseModel):
    id: int
    slug: str
    name: str


class CategoryNode(CategoryRef):
    children: list[CategoryRef] = []


class Location(BaseModel):
    id: int
    slug: str
    city: str
    province: str
    region: str


class CityRef(BaseModel):
    slug: str
    name: str


class SellerSummary(BaseModel):
    username: str
    display_name: str | None
    avatar_url: str | None


class ListingCard(BaseModel):
    id: uuid.UUID
    title: str
    price_centavos: int
    condition: Condition
    status: ListingStatus
    city: CityRef
    cover_thumb_url: str | None
    seller: SellerSummary
    published_at: datetime | None


class ListingImage(BaseModel):
    id: uuid.UUID
    position: int
    full_url: str
    thumb_url: str
    width: int
    height: int


class ListingDetail(ListingCard):
    description: str
    category: CategoryRef
    parent_category: CategoryRef | None
    images: list[ListingImage]
    meetup: bool
    delivery: bool
    deal_note: str | None
    created_at: datetime
    updated_at: datetime
    is_owner: bool


class ListingPage(BaseModel):
    items: list[ListingCard]
    page: int
    page_size: int
    total: int
    has_next: bool


class PublicProfile(BaseModel):
    username: str
    display_name: str | None
    avatar_url: str | None
    bio: str | None
    city: CityRef | None
    joined_at: datetime
    active_listing_count: int
