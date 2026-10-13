from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Request, Response, UploadFile, status
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.core.db import UserDb, user_transaction
from app.core.errors import AppError, sqlstate
from app.core.ratelimit import per_user
from app.core.security import Claims, access_token, require_claims, user_id
from app.schemas.profile import MeResponse, MeUpdate
from app.schemas.safety import AccountDelete
from app.services import avatars, safety
from app.services.catalog import Urls
from app.services.images import MAX_UPLOAD_BYTES, ImageRejected
from app.services.storage import AVATAR_BUCKET

router = APIRouter(prefix="/me", tags=["me"])

UserClaims = Annotated[Claims, Depends(require_claims)]
Token = Annotated[str, Depends(access_token)]

_SELECT_ME = text(
    """
    select id, username::text as username, display_name, bio, avatar_path, city_id,
           age_confirmed_at is not null as age_confirmed, created_at,
           restricted_at is not null as restricted
    from app.profiles where id = :uid
    """
)

# Columns a user may change. SQL is built only from this fixed list.
_UPDATABLE = ("username", "display_name", "bio", "city_id")


async def _load(db: UserDb, claims: Claims, request: Request) -> MeResponse:
    row = (await db.execute(_SELECT_ME, {"uid": user_id(claims)})).mappings().first()
    if row is None:
        raise AppError(404, "not_found", "Profile not found.")
    role = (claims.get("app_metadata") or {}).get("role")
    urls = Urls(request.app.state.settings.public_storage_url)
    return MeResponse(
        email=claims.get("email"),
        is_admin=role == "admin",
        avatar_url=urls.avatar(row["avatar_path"]),
        **row,
    )


@router.get("", response_model=MeResponse)
async def get_me(db: UserDb, claims: UserClaims, request: Request) -> MeResponse:
    return await _load(db, claims, request)


@router.patch("", response_model=MeResponse, dependencies=[per_user("edit_profile")])
async def update_me(body: MeUpdate, db: UserDb, claims: UserClaims, request: Request) -> MeResponse:
    changes = body.model_dump(exclude_unset=True)
    columns = [c for c in _UPDATABLE if c in changes]
    if columns:
        assignments = ", ".join(f"{c} = :{c}" for c in columns)
        stmt = text(f"update app.profiles set {assignments} where id = :uid")  # noqa: S608
        try:
            # Savepoint so a unique clash does not abort the whole transaction.
            async with db.begin_nested():
                await db.execute(stmt, {**changes, "uid": user_id(claims)})
        except DBAPIError as exc:
            if sqlstate(exc) == "23505":
                raise AppError(409, "username_taken", "That username is taken.") from exc
            raise
    return await _load(db, claims, request)


@router.put("/avatar", response_model=MeResponse, dependencies=[per_user("upload_images")])
async def set_avatar(
    file: Annotated[UploadFile, File(description="One JPEG, PNG, or WebP photo")],
    request: Request,
    db: UserDb,
    claims: UserClaims,
    token: Token,
    background: BackgroundTasks,
) -> MeResponse:
    """Your profile photo. Checked, cropped square, re-encoded, stripped of metadata."""
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise AppError(413, "file_too_large", "The photo must be 8 MB or smaller.")
    try:
        old = await avatars.replace(db, request.app.state.storage, token, user_id(claims), data)
    except ImageRejected as exc:
        raise AppError(422, exc.code, exc.message) from exc
    if old:  # after the response, so only once the new path is committed
        background.add_task(request.app.state.storage.remove, token, AVATAR_BUCKET, [old])
    return await _load(db, claims, request)


@router.delete("/avatar", response_model=MeResponse, dependencies=[per_user("edit_profile")])
async def delete_avatar(
    request: Request, db: UserDb, claims: UserClaims, token: Token, background: BackgroundTasks
) -> MeResponse:
    old = await avatars.remove(db, user_id(claims))
    if old:
        background.add_task(request.app.state.storage.remove, token, AVATAR_BUCKET, [old])
    return await _load(db, claims, request)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    body: AccountDelete, request: Request, db: UserDb, claims: UserClaims, token: Token
) -> Response:
    """Delete your account for good: photos, listings (and their chats), favorites,
    blocks, and your reports. Chats where you were the buyer stay for the seller."""

    async def pause_listings() -> None:
        async with user_transaction(request.app.state.engine, claims) as conn:
            await conn.execute(
                text(
                    """update app.listings set status = 'paused'
                       where seller_id = :uid and status = 'active'"""
                ),
                {"uid": user_id(claims)},
            )

    await safety.delete_account(
        db,
        user_id(claims),
        body.confirm_username,
        token,
        request.app.state.storage,
        request.app.state.auth_admin,
        request.state.request_id,
        pause_listings,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
