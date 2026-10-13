from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.core.db import UserDb
from app.core.errors import AppError, sqlstate
from app.core.security import Claims, access_token, require_claims, user_id
from app.schemas.profile import MeResponse, MeUpdate
from app.schemas.safety import AccountDelete
from app.services import safety

router = APIRouter(prefix="/me", tags=["me"])

UserClaims = Annotated[Claims, Depends(require_claims)]
Token = Annotated[str, Depends(access_token)]

_SELECT_ME = text(
    """
    select id, username::text as username, display_name, bio, avatar_path, city_id,
           age_confirmed_at is not null as age_confirmed, created_at
    from app.profiles where id = :uid
    """
)

# Columns a user may change. SQL is built only from this fixed list.
_UPDATABLE = ("username", "display_name", "bio", "city_id")


async def _load(db: UserDb, claims: Claims) -> MeResponse:
    row = (await db.execute(_SELECT_ME, {"uid": user_id(claims)})).mappings().first()
    if row is None:
        raise AppError(404, "not_found", "Profile not found.")
    return MeResponse(email=claims.get("email"), **row)


@router.get("", response_model=MeResponse)
async def get_me(db: UserDb, claims: UserClaims) -> MeResponse:
    return await _load(db, claims)


@router.patch("", response_model=MeResponse)
async def update_me(body: MeUpdate, db: UserDb, claims: UserClaims) -> MeResponse:
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
    return await _load(db, claims)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    body: AccountDelete, request: Request, db: UserDb, claims: UserClaims, token: Token
) -> Response:
    """Delete your account for good: photos, listings (and their chats), favorites,
    blocks, and your reports. Chats where you were the buyer stay for the seller."""
    await safety.delete_account(
        db,
        user_id(claims),
        body.confirm_username,
        token,
        request.app.state.storage,
        request.app.state.auth_admin,
        request.state.request_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
