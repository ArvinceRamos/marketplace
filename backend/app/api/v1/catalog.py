"""Public browsing endpoints: categories, locations, listings, seller profiles."""

import time
import uuid
from collections.abc import Awaitable, Callable
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Path, Query, Request
from pydantic import StringConstraints

from app.core.db import Db, UserDb, user_transaction
from app.core.errors import AppError
from app.core.ratelimit import per_ip
from app.core.security import Claims, optional_claims, require_claims, user_id
from app.schemas.catalog import (
    CategoryNode,
    Condition,
    Courier,
    ListingDetail,
    ListingPage,
    ListingViewer,
    Location,
    PaymentMethod,
    PublicProfile,
    SortOrder,
)
from app.services import catalog
from app.services.catalog import SearchFilters, Urls

router = APIRouter(tags=["browse"])

MAX_PESOS = 100_000_000
Slug = Annotated[str, Query(pattern=r"^[a-z0-9-]{2,60}$")]
UsernamePath = Annotated[str, Path(pattern=r"^[A-Za-z0-9_.]{3,30}$")]
Page = Annotated[int, Query(ge=1, le=50)]
PageSize = Annotated[int, Query(ge=1, le=48)]
SizeValue = Annotated[str, StringConstraints(min_length=1, max_length=20)]


def _urls(request: Request) -> Urls:
    return Urls(request.app.state.settings.public_storage_url)


# Categories and locations change only with a migration (and a restart), but every
# page asks for them. Keep them in memory for an hour so a page view doesn't cost two
# database round trips (audit C3).
STATIC_TTL_SECONDS = 3600


async def _static(request: Request, key: str, load: Callable[[Any], Awaitable[Any]]) -> Any:
    cache: dict[str, tuple[float, Any]] = request.app.state.static_cache
    now = time.monotonic()
    hit = cache.get(key)
    if hit is not None and now - hit[0] < STATIC_TTL_SECONDS:
        return hit[1]
    async with user_transaction(request.app.state.engine, None) as db:
        value = await load(db)
    cache[key] = (now, value)
    return value


@router.get("/categories", response_model=list[CategoryNode])
async def get_categories(request: Request) -> list[CategoryNode]:
    return await _static(request, "categories", catalog.category_tree)


@router.get("/locations", response_model=list[Location])
async def get_locations(request: Request) -> list[Location]:
    return await _static(request, "locations", catalog.locations)


@router.get("/listings", response_model=ListingPage, dependencies=[per_ip("search")])
async def search(
    request: Request,
    db: Db,
    q: Annotated[str | None, Query(max_length=100)] = None,
    category: Slug | None = None,
    min_price: Annotated[int | None, Query(ge=0, le=MAX_PESOS)] = None,
    max_price: Annotated[int | None, Query(ge=0, le=MAX_PESOS)] = None,
    condition: Annotated[list[Condition] | None, Query()] = None,
    city: Slug | None = None,
    size: Annotated[list[SizeValue] | None, Query(max_length=15)] = None,
    payment: Annotated[list[PaymentMethod] | None, Query(max_length=5)] = None,
    courier: Annotated[list[Courier] | None, Query(max_length=5)] = None,
    sort: SortOrder = SortOrder.newest,
    page: Page = 1,
    page_size: PageSize = 24,
) -> ListingPage:
    """Search published listings. Prices are whole pesos; results are paginated."""
    if min_price is not None and max_price is not None and min_price > max_price:
        raise AppError(422, "invalid_price_range", "Minimum price is higher than maximum price.")
    filters = SearchFilters(
        q=(q or "").strip() or None,
        category=category,
        min_price_centavos=None if min_price is None else min_price * 100,
        max_price_centavos=None if max_price is None else max_price * 100,
        conditions=condition or [],
        city=city,
        sizes=size or [],
        payment_methods=payment or [],
        couriers=courier or [],
        sort=sort,
        page=page,
        page_size=page_size,
    )
    return await catalog.search_listings(db, filters, _urls(request))


@router.get("/listings/{listing_id}", response_model=ListingDetail)
async def get_listing(
    listing_id: uuid.UUID,
    request: Request,
    db: Db,
    claims: Annotated[Claims | None, Depends(optional_claims)],
) -> ListingDetail:
    viewer = user_id(claims) if claims else None
    detail = await catalog.listing_detail(db, listing_id, viewer, _urls(request))
    if detail is None:
        raise AppError(404, "listing_not_found", "This listing is not available.")
    return detail


@router.get("/listings/{listing_id}/viewer", response_model=ListingViewer)
async def get_listing_viewer(
    listing_id: uuid.UUID, db: UserDb, claims: Annotated[Claims, Depends(require_claims)]
) -> ListingViewer:
    """Your relation to a listing: owner, saved, your chat and open order."""
    viewer = await catalog.listing_viewer(db, listing_id, user_id(claims))
    if viewer is None:
        raise AppError(404, "listing_not_found", "This listing is not available.")
    return viewer


@router.get("/profiles/{username}", response_model=PublicProfile)
async def get_profile(username: UsernamePath, request: Request, db: Db) -> PublicProfile:
    profile = await catalog.public_profile(db, username.lower(), _urls(request))
    if profile is None:
        raise AppError(404, "profile_not_found", "This seller does not exist.")
    return profile


@router.get("/profiles/{username}/listings", response_model=ListingPage)
async def get_profile_listings(
    username: UsernamePath,
    request: Request,
    db: Db,
    page: Page = 1,
    page_size: PageSize = 24,
) -> ListingPage:
    filters = SearchFilters(seller_username=username.lower(), page=page, page_size=page_size)
    return await catalog.search_listings(db, filters, _urls(request))
