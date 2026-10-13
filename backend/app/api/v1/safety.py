"""Reports and blocks. Everything here needs a signed-in user."""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request, Response, status

from app.core.db import UserDb
from app.core.ratelimit import per_user
from app.core.security import Claims, require_claims, user_id
from app.schemas.safety import BlockedUser, Report, ReportCreate
from app.services import safety
from app.services.catalog import Urls

router = APIRouter(tags=["reports, blocks"])

UserClaims = Annotated[Claims, Depends(require_claims)]
UsernamePath = Annotated[str, Path(pattern=r"^[A-Za-z0-9_.]{3,30}$")]


def _urls(request: Request) -> Urls:
    return Urls(request.app.state.settings.public_storage_url)


@router.post(
    "/reports",
    response_model=Report,
    status_code=status.HTTP_201_CREATED,
    dependencies=[per_user("report")],
)
async def create_report(
    body: ReportCreate, request: Request, db: UserDb, claims: UserClaims
) -> Report:
    """One open report per target. Reporting yourself or your own listing is 422."""
    return await safety.create_report(db, user_id(claims), body, _urls(request))


@router.get("/me/reports", response_model=list[Report])
async def my_reports(
    request: Request,
    db: UserDb,
    claims: UserClaims,
    page: Annotated[int, Query(ge=1, le=50)] = 1,
    page_size: Annotated[int, Query(ge=1, le=48)] = 24,
) -> list[Report]:
    return await safety.my_reports(db, user_id(claims), page, page_size, _urls(request))


@router.get("/me/blocks", response_model=list[BlockedUser])
async def my_blocks(request: Request, db: UserDb, claims: UserClaims) -> list[BlockedUser]:
    return await safety.my_blocks(db, user_id(claims), _urls(request))


@router.put(
    "/users/{username}/block",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[per_user("block")],
)
async def block_user(username: UsernamePath, db: UserDb, claims: UserClaims) -> Response:
    """Idempotent. Blocked users can't start chats, message, or offer either way."""
    await safety.block(db, user_id(claims), username.lower())
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/users/{username}/block",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[per_user("block")],
)
async def unblock_user(username: UsernamePath, db: UserDb, claims: UserClaims) -> Response:
    await safety.unblock(db, user_id(claims), username.lower())
    return Response(status_code=status.HTTP_204_NO_CONTENT)
