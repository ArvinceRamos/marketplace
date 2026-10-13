"""Seller endpoints: manage your own listings and their photos.

Ownership is never taken from the request. Each service call checks that the
listing belongs to the token's user (404 otherwise), and RLS checks it again.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, Request, UploadFile, status

from app.core.db import UserDb
from app.core.errors import AppError
from app.core.ratelimit import RateLimiter, per_user
from app.core.security import Claims, access_token, require_claims, user_id
from app.schemas.catalog import ListingDetail, ListingPage, ListingStatus
from app.schemas.listings import ImageOrder, ListingCreate, ListingUpdate, StatusChange
from app.services import catalog, listings
from app.services.catalog import Urls
from app.services.images import MAX_UPLOAD_BYTES, ImageRejected
from app.services.storage import LISTING_BUCKET, Storage

router = APIRouter(tags=["selling"])

UserClaims = Annotated[Claims, Depends(require_claims)]
Token = Annotated[str, Depends(access_token)]


def _urls(request: Request) -> Urls:
    return Urls(request.app.state.settings.public_storage_url)


def _storage(request: Request) -> Storage:
    return request.app.state.storage


async def _detail(
    request: Request, db: UserDb, listing_id: uuid.UUID, claims: Claims
) -> ListingDetail:
    detail = await catalog.listing_detail(db, listing_id, user_id(claims), _urls(request))
    if detail is None:  # pragma: no cover - the caller just changed it
        raise AppError(404, "listing_not_found", "This listing is not available.")
    return detail


@router.get("/me/listings", response_model=ListingPage)
async def get_my_listings(
    request: Request,
    db: UserDb,
    claims: UserClaims,
    listing_status: Annotated[ListingStatus, Query(alias="status")] = ListingStatus.active,
    page: Annotated[int, Query(ge=1, le=50)] = 1,
    page_size: Annotated[int, Query(ge=1, le=48)] = 24,
) -> ListingPage:
    """Your own listings with one status (drafts included). Newest change first."""
    return await listings.my_listings(
        db, user_id(claims), listing_status, page, page_size, _urls(request)
    )


@router.post(
    "/listings",
    response_model=ListingDetail,
    status_code=status.HTTP_201_CREATED,
    dependencies=[per_user("create_listing")],
)
async def create_listing(
    body: ListingCreate, request: Request, db: UserDb, claims: UserClaims
) -> ListingDetail:
    """Create a draft. Add photos, then publish with `POST /listings/{id}/status`."""
    listing_id = await listings.create_listing(db, user_id(claims), body)
    return await _detail(request, db, listing_id, claims)


@router.patch("/listings/{listing_id}", response_model=ListingDetail)
async def update_listing(
    listing_id: uuid.UUID, body: ListingUpdate, request: Request, db: UserDb, claims: UserClaims
) -> ListingDetail:
    await listings.update_listing(db, user_id(claims), listing_id, body)
    return await _detail(request, db, listing_id, claims)


@router.post("/listings/{listing_id}/status", response_model=ListingDetail)
async def change_status(
    listing_id: uuid.UUID, body: StatusChange, request: Request, db: UserDb, claims: UserClaims
) -> ListingDetail:
    await listings.change_status(db, user_id(claims), listing_id, body.status)
    return await _detail(request, db, listing_id, claims)


@router.delete("/listings/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_listing(
    listing_id: uuid.UUID,
    request: Request,
    db: UserDb,
    claims: UserClaims,
    token: Token,
    background: BackgroundTasks,
) -> None:
    paths = await listings.delete_listing(db, user_id(claims), listing_id)
    # Runs after the response, so only after the database change was committed.
    background.add_task(_storage(request).remove, token, LISTING_BUCKET, paths)


@router.post("/listings/{listing_id}/images", response_model=ListingDetail)
async def add_images(
    listing_id: uuid.UUID,
    files: Annotated[list[UploadFile], File(description="1–8 JPEG, PNG, or WebP photos")],
    request: Request,
    db: UserDb,
    claims: UserClaims,
    token: Token,
) -> ListingDetail:
    """Photos are checked by content, re-encoded to WebP, and stripped of metadata."""
    limiter: RateLimiter | None = request.app.state.rate_limiter
    if limiter is not None:  # counted per photo
        limiter.hit("upload_images", str(user_id(claims)), cost=len(files))
    uploads: list[bytes] = []
    for file in files:
        data = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(data) > MAX_UPLOAD_BYTES:
            raise AppError(413, "file_too_large", "Each photo must be 8 MB or smaller.")
        uploads.append(data)
    try:
        await listings.add_photos(
            db, _storage(request), token, user_id(claims), listing_id, uploads
        )
    except ImageRejected as exc:
        raise AppError(422, exc.code, exc.message) from exc
    return await _detail(request, db, listing_id, claims)


@router.patch("/listings/{listing_id}/images/order", response_model=ListingDetail)
async def reorder_images(
    listing_id: uuid.UUID, body: ImageOrder, request: Request, db: UserDb, claims: UserClaims
) -> ListingDetail:
    """Send every photo ID in the new order. The first one becomes the cover."""
    await listings.reorder_photos(db, user_id(claims), listing_id, body.image_ids)
    return await _detail(request, db, listing_id, claims)


@router.delete("/listings/{listing_id}/images/{image_id}", response_model=ListingDetail)
async def delete_image(
    listing_id: uuid.UUID,
    image_id: uuid.UUID,
    request: Request,
    db: UserDb,
    claims: UserClaims,
    token: Token,
    background: BackgroundTasks,
) -> ListingDetail:
    paths = await listings.remove_photo(db, user_id(claims), listing_id, image_id)
    background.add_task(_storage(request).remove, token, LISTING_BUCKET, paths)
    return await _detail(request, db, listing_id, claims)
