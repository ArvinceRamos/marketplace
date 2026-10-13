"""Following sellers and the "Following" feed. Everything here needs a signed-in user."""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request, Response, status

from app.core.db import UserDb
from app.core.ratelimit import per_user
from app.core.security import Claims, require_claims, user_id
from app.schemas.catalog import ListingPage
from app.schemas.follows import FollowedSeller, FollowState
from app.services import catalog, follows
from app.services.catalog import SearchFilters, Urls

router = APIRouter(tags=["follows"])

UserClaims = Annotated[Claims, Depends(require_claims)]
UsernamePath = Annotated[str, Path(pattern=r"^[A-Za-z0-9_.]{3,30}$")]


def _urls(request: Request) -> Urls:
    return Urls(request.app.state.settings.public_storage_url)


@router.get("/users/{username}/follow", response_model=FollowState)
async def follow_state(username: UsernamePath, db: UserDb, claims: UserClaims) -> FollowState:
    return FollowState(following=await follows.is_following(db, user_id(claims), username.lower()))


@router.put(
    "/users/{username}/follow",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[per_user("follow")],
)
async def follow_user(username: UsernamePath, db: UserDb, claims: UserClaims) -> Response:
    """Idempotent. 422 for yourself; 403 across a block (either side, reason not shown)."""
    await follows.follow(db, user_id(claims), username.lower())
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/users/{username}/follow",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[per_user("follow")],
)
async def unfollow_user(username: UsernamePath, db: UserDb, claims: UserClaims) -> Response:
    await follows.unfollow(db, user_id(claims), username.lower())
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me/following", response_model=list[FollowedSeller])
async def my_following(request: Request, db: UserDb, claims: UserClaims) -> list[FollowedSeller]:
    return await follows.following(db, user_id(claims), _urls(request))


@router.get("/me/feed", response_model=ListingPage)
async def my_feed(
    request: Request,
    db: UserDb,
    claims: UserClaims,
    page: Annotated[int, Query(ge=1, le=50)] = 1,
    page_size: Annotated[int, Query(ge=1, le=48)] = 24,
) -> ListingPage:
    """Active listings from sellers you follow, newest first."""
    filters = SearchFilters(followed_by=user_id(claims), page=page, page_size=page_size)
    return await catalog.search_listings(db, filters, _urls(request))
