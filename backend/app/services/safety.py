"""Reports, blocks, and account deletion. Runs under the caller's RLS transaction.

Users are named by username in requests; the server looks up the ID. The caller's
own ID only ever comes from the verified token.
"""

import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.errors import AppError, sqlstate
from app.schemas.catalog import SellerSummary
from app.schemas.safety import BlockedUser, Report, ReportCreate, ReportedListing, ReportTarget
from app.services.auth_admin import AuthAdmin
from app.services.catalog import Urls
from app.services.storage import AVATAR_BUCKET, LISTING_BUCKET, Storage

_USER_GONE = AppError(404, "user_not_found", "This user does not exist.")
_LISTING_GONE = AppError(404, "listing_not_found", "This listing is not available.")


async def user_id_for(db: AsyncConnection, username: str) -> uuid.UUID:
    """A profile ID by username, or 404. Usernames are public; IDs never leave the API."""
    found = (
        await db.execute(text("select id from app.profiles where username = :u"), {"u": username})
    ).scalar_one_or_none()
    if found is None:
        raise _USER_GONE
    return found


# --- reports -----------------------------------------------------------------------

_REPORT_SQL = """
    select r.id, r.target_type::text as target_type, r.reason::text as reason, r.details,
           r.status::text as status, r.created_at,
           l.id as l_id, l.title as l_title,
           p.username::text as p_username, p.display_name as p_display,
           p.avatar_path as p_avatar
    from app.reports r
    -- Only listings the reporter can still see (RLS); a removed one shows as gone.
    left join app.listings l on l.id = r.listing_id and l.status <> 'deleted'
    left join app.profiles p on p.id = r.reported_user_id
    where r.reporter_id = :uid
"""


def _report(row: Any, urls: Urls) -> Report:
    return Report(
        id=row["id"],
        target_type=row["target_type"],
        listing=(ReportedListing(id=row["l_id"], title=row["l_title"]) if row["l_id"] else None),
        user=(
            SellerSummary(
                username=row["p_username"],
                display_name=row["p_display"],
                avatar_url=urls.avatar(row["p_avatar"]),
            )
            if row["p_username"]
            else None
        ),
        reason=row["reason"],
        details=row["details"],
        status=row["status"],
        created_at=row["created_at"],
    )


async def create_report(
    db: AsyncConnection, uid: uuid.UUID, body: ReportCreate, urls: Urls
) -> Report:
    listing_id: uuid.UUID | None = None
    reported_user: uuid.UUID | None = None
    if body.target_type == ReportTarget.listing:
        seller = (
            await db.execute(
                text(
                    """select seller_id from app.listings
                       where id = :id and status in ('active', 'paused', 'sold')
                         and moderation = 'ok'"""
                ),
                {"id": body.listing_id},
            )
        ).scalar_one_or_none()
        if seller is None:
            raise _LISTING_GONE
        if seller == uid:
            raise AppError(422, "cannot_report_self", "You can't report your own listing.")
        listing_id = body.listing_id
    else:
        reported_user = await user_id_for(db, body.username or "")  # set: ReportCreate checks
        if reported_user == uid:
            raise AppError(422, "cannot_report_self", "You can't report yourself.")

    try:
        async with db.begin_nested():
            new_id = (
                await db.execute(
                    text(
                        """insert into app.reports
                             (reporter_id, target_type, listing_id, reported_user_id, reason,
                              details)
                           values (:uid, cast(:t as app.report_target), :lid, :ruid,
                                   cast(:reason as app.report_reason), :details)
                           returning id"""
                    ),
                    {
                        "uid": uid,
                        "t": body.target_type.value,
                        "lid": listing_id,
                        "ruid": reported_user,
                        "reason": body.reason.value,
                        "details": body.details,
                    },
                )
            ).scalar_one()
    except DBAPIError as exc:
        if sqlstate(exc) == "23505":
            raise AppError(
                409, "already_reported", "You already reported this. We'll look into it."
            ) from exc
        raise
    row = (
        (await db.execute(text(f"{_REPORT_SQL} and r.id = :id"), {"uid": uid, "id": new_id}))
        .mappings()
        .one()
    )
    return _report(row, urls)


async def my_reports(
    db: AsyncConnection, uid: uuid.UUID, page: int, page_size: int, urls: Urls
) -> list[Report]:
    rows = await db.execute(
        text(f"{_REPORT_SQL} order by r.created_at desc, r.id limit :limit offset :offset"),
        {"uid": uid, "limit": page_size, "offset": (page - 1) * page_size},
    )
    return [_report(r, urls) for r in rows.mappings()]


# --- blocks ------------------------------------------------------------------------


async def block(db: AsyncConnection, uid: uuid.UUID, username: str) -> None:
    other = await user_id_for(db, username)
    if other == uid:
        raise AppError(422, "cannot_block_self", "You can't block yourself.")
    await db.execute(
        text(
            """insert into app.blocked_users (blocker_id, blocked_id) values (:uid, :other)
               on conflict do nothing"""
        ),
        {"uid": uid, "other": other},
    )


async def unblock(db: AsyncConnection, uid: uuid.UUID, username: str) -> None:
    other = await user_id_for(db, username)
    await db.execute(
        text("delete from app.blocked_users where blocker_id = :uid and blocked_id = :other"),
        {"uid": uid, "other": other},
    )


async def my_blocks(db: AsyncConnection, uid: uuid.UUID, urls: Urls) -> list[BlockedUser]:
    rows = await db.execute(
        text(
            """select p.username::text as username, p.display_name, p.avatar_path,
                      b.created_at
               from app.blocked_users b join app.profiles p on p.id = b.blocked_id
               where b.blocker_id = :uid
               order by b.created_at desc
               limit 500"""
        ),
        {"uid": uid},
    )
    return [
        BlockedUser(
            username=r["username"],
            display_name=r["display_name"],
            avatar_url=urls.avatar(r["avatar_path"]),
            blocked_at=r["created_at"],
        )
        for r in rows.mappings()
    ]


# --- account deletion --------------------------------------------------------------


async def ensure_not_restricted(db: AsyncConnection, uid: uuid.UUID) -> None:
    """A clear 403 before the database's own check (RLS / order_terms, T31)."""
    restricted = await db.execute(text("select app.is_restricted(:uid)"), {"uid": uid})
    if restricted.scalar_one():
        raise AppError(
            403,
            "restricted",
            "Your account is restricted by a moderator. You can still finish open orders.",
        )


async def delete_account(
    db: AsyncConnection,
    uid: uuid.UUID,
    confirm_username: str,
    token: str,
    storage: Storage,
    auth_admin: AuthAdmin,
    request_id: str,
) -> None:
    """SECURITY_PLAN §4. Order matters: Storage files first (with the user's own
    token), then the Auth user (secret key). Auth would delete a user who still owns
    files and leave the files behind. Database rows go by cascade."""
    if not auth_admin.configured:
        # Check first, so photos are never removed when the account can't be.
        raise AppError(
            503,
            "account_deletion_unavailable",
            "Account deletion is not available right now. Please try again later.",
        )
    own = text("select username::text from app.profiles where id = :uid")
    username = (await db.execute(own, {"uid": uid})).scalar_one_or_none()
    if username is None:
        raise AppError(404, "not_found", "Profile not found.")
    if confirm_username.lower().lstrip("@") != username:
        raise AppError(
            422,
            "username_mismatch",
            "That doesn't match your username.",
            {"confirm_username": "Type your username exactly as shown."},
        )
    # Money history must not be lost (SECURITY_PLAN T32). A trigger checks again.
    money = (
        await db.execute(
            text(
                """select exists (select 1 from app.orders where :uid in (buyer_id, seller_id)
                                  and app.order_is_open(status)) as open_orders,
                          (select coalesce(sum(amount_centavos), 0) from app.ledger_entries
                            where account = 'seller' and user_id = :uid) as balance"""
            ),
            {"uid": uid},
        )
    ).one()
    if money.open_orders:
        raise AppError(409, "open_orders", "Finish or cancel your open orders first.")
    if money.balance > 0:
        raise AppError(409, "wallet_balance", "Withdraw your wallet balance first.")

    folder = str(uid)
    for bucket in (LISTING_BUCKET, AVATAR_BUCKET):
        paths = await storage.list_files(token, bucket, folder)
        await storage.remove_all(token, bucket, paths)
    await auth_admin.delete_user(uid, request_id)
