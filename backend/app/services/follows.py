"""Following sellers. Runs under the caller's RLS transaction.

Who follows whom is private: a user can read only their own follow list (RLS).
Follower counts are public through `app.follower_count`. Blocking someone ends
follows both ways (database trigger).
"""

import uuid

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.errors import AppError, sqlstate
from app.schemas.follows import FollowedSeller
from app.services.catalog import Urls
from app.services.safety import user_id_for

_NOT_ALLOWED = AppError(403, "follow_not_allowed", "You can't follow this seller.")


async def follow(db: AsyncConnection, uid: uuid.UUID, username: str) -> None:
    """Idempotent. Not allowed across a block in either direction; the reason is not
    revealed, so a blocked person isn't told they were blocked."""
    other = await user_id_for(db, username)
    if other == uid:
        raise AppError(422, "cannot_follow_self", "You can't follow yourself.")
    try:
        async with db.begin_nested():
            await db.execute(
                text(
                    """insert into app.follows (follower_id, followed_id) values (:uid, :other)
                       on conflict do nothing"""
                ),
                {"uid": uid, "other": other},
            )
    except DBAPIError as exc:
        code = sqlstate(exc)
        if code == "42501":
            raise _NOT_ALLOWED from exc
        if code == "23514":
            raise AppError(
                409, "too_many_follows", "You follow the maximum of 1,000 sellers."
            ) from exc
        raise


async def unfollow(db: AsyncConnection, uid: uuid.UUID, username: str) -> None:
    other = await user_id_for(db, username)
    await db.execute(
        text("delete from app.follows where follower_id = :uid and followed_id = :other"),
        {"uid": uid, "other": other},
    )


async def is_following(db: AsyncConnection, uid: uuid.UUID, username: str) -> bool:
    other = await user_id_for(db, username)
    found = await db.execute(
        text("select 1 from app.follows where follower_id = :uid and followed_id = :other"),
        {"uid": uid, "other": other},
    )
    return found.first() is not None


async def following(db: AsyncConnection, uid: uuid.UUID, urls: Urls) -> list[FollowedSeller]:
    rows = await db.execute(
        text(
            """select p.username::text as username, p.display_name, p.avatar_path,
                      f.created_at
               from app.follows f join app.profiles p on p.id = f.followed_id
               where f.follower_id = :uid
               order by f.created_at desc
               limit 1000"""
        ),
        {"uid": uid},
    )
    return [
        FollowedSeller(
            username=r["username"],
            display_name=r["display_name"],
            avatar_url=urls.avatar(r["avatar_path"]),
            followed_at=r["created_at"],
        )
        for r in rows.mappings()
    ]
