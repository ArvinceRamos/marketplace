"""Profile photos (Phase 15). Same rules as listing photos: the bytes are checked and
re-encoded by the API (no metadata), uploaded with the user's own token into their
own Storage folder, and the old file is removed after the database change commits."""

import uuid

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.services.images import process_avatar
from app.services.storage import AVATAR_BUCKET, Storage

_CURRENT = text("select avatar_path from app.profiles where id = :uid for update")
_SET = text("update app.profiles set avatar_path = :path where id = :uid")


async def replace(
    db: AsyncConnection, storage: Storage, token: str, uid: uuid.UUID, data: bytes
) -> str | None:
    """Store a new avatar. Returns the old file to remove after commit."""
    photo = await run_in_threadpool(process_avatar, data)
    old = (await db.execute(_CURRENT, {"uid": uid})).scalar_one_or_none()
    path = f"{uid}/avatar-{uuid.uuid4().hex}.webp"
    await storage.upload(token, AVATAR_BUCKET, path, photo)
    try:
        await db.execute(_SET, {"uid": uid, "path": path})
    except Exception:
        await storage.remove(token, AVATAR_BUCKET, [path])
        raise
    return old


async def remove(db: AsyncConnection, uid: uuid.UUID) -> str | None:
    """Clear the avatar. Returns the file to remove after commit."""
    old = (await db.execute(_CURRENT, {"uid": uid})).scalar_one_or_none()
    await db.execute(_SET, {"uid": uid, "path": None})
    return old
