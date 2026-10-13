"""Moderator routes (Phase 12). Every route needs a token whose signed
`app_metadata.role` is "admin"; the database functions check it again (T30)."""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, Response, status

from app.core.db import UserDb
from app.core.errors import AppError
from app.core.security import Claims, require_claims
from app.schemas.admin import (
    AdminAction,
    AdminDispute,
    AdminReport,
    AdminUser,
    DisputeDecision,
    ModerationUpdate,
    ReportUpdate,
    RestrictionUpdate,
    Summary,
)
from app.services import admin
from app.services.catalog import Urls


async def require_admin(claims: Annotated[Claims, Depends(require_claims)]) -> Claims:
    # app_metadata is signed by Supabase Auth and can't be edited by users
    # (user_metadata can, so it is never used for roles).
    if (claims.get("app_metadata") or {}).get("role") != "admin":
        raise AppError(403, "not_admin", "Only moderators can open this.")
    return claims


router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def _urls(request: Request) -> Urls:
    return Urls(request.app.state.settings.public_storage_url)


@router.get("/summary", response_model=Summary)
async def summary(db: UserDb) -> Summary:
    return await admin.summary(db)


@router.get("/reports", response_model=list[AdminReport])
async def reports(
    request: Request,
    db: UserDb,
    report_status: Annotated[
        Literal["open", "reviewing", "actioned", "dismissed"], Query(alias="status")
    ] = "open",
) -> list[AdminReport]:
    return await admin.reports(db, report_status, _urls(request))


@router.post("/reports/{report_id}", response_model=AdminReport)
async def update_report(
    report_id: uuid.UUID, body: ReportUpdate, request: Request, db: UserDb
) -> AdminReport:
    """Set a report's status; optionally hide the listing and/or restrict the account."""
    return await admin.update_report(db, report_id, body, _urls(request))


@router.post("/listings/{listing_id}/moderation", status_code=status.HTTP_204_NO_CONTENT)
async def moderate_listing(listing_id: uuid.UUID, body: ModerationUpdate, db: UserDb) -> Response:
    await admin.set_moderation(db, listing_id, body.moderation, body.note)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/users", response_model=list[AdminUser])
async def users(
    request: Request,
    db: UserDb,
    q: Annotated[str, Query(max_length=30, pattern=r"^[A-Za-z0-9_.]*$")] = "",
) -> list[AdminUser]:
    return await admin.users(db, q.lower(), _urls(request))


@router.post("/users/{username}/restriction", response_model=AdminUser)
async def restrict_user(
    username: str, body: RestrictionUpdate, request: Request, db: UserDb
) -> AdminUser:
    return await admin.set_restriction(
        db, username.lower()[:30], body.restricted, body.note, _urls(request)
    )


@router.get("/disputes", response_model=list[AdminDispute])
async def disputes(
    db: UserDb,
    dispute_status: Annotated[
        Literal["open", "escalated", "resolved"], Query(alias="status")
    ] = "escalated",
) -> list[AdminDispute]:
    return await admin.disputes(db, dispute_status)


@router.post("/disputes/{dispute_id}/resolve", response_model=AdminDispute)
async def resolve_dispute(dispute_id: uuid.UUID, body: DisputeDecision, db: UserDb) -> AdminDispute:
    """Final decision: refund the buyer in full, or release the money to the seller."""
    return await admin.resolve_dispute(db, dispute_id, body.outcome, body.note)


@router.get("/actions", response_model=list[AdminAction])
async def actions(request: Request, db: UserDb) -> list[AdminAction]:
    """Audit log, newest first."""
    return await admin.actions(db, _urls(request))
