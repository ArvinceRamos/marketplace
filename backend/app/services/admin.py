"""Moderator actions (Phase 12, SECURITY_PLAN T30).

Reads run under RLS: admin-only policies (`app.is_admin()`) let a moderator see
reports, all listings, orders, and disputes. Every change goes through a database
function that checks `app.is_admin()` again and writes the audit log in the same
transaction. The route layer checks the token's role first for a clear 403.
"""

import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.errors import AppError
from app.schemas.admin import (
    AdminAction,
    AdminDispute,
    AdminReport,
    AdminUser,
    DisputeOrder,
    ReportListing,
    ReportUpdate,
    ReportUser,
    Summary,
)
from app.schemas.catalog import SellerSummary
from app.services.catalog import Urls

_REPORT_SQL = """
    select r.id, r.status::text as status, r.reason::text as reason, r.details, r.created_at,
           r.target_type::text as target_type, r.listing_id, r.reported_user_id,
           rp.username::text as rp_username, rp.display_name as rp_display,
           rp.avatar_path as rp_avatar,
           l.title as l_title, l.status::text as l_status, l.moderation = 'hidden' as l_hidden,
           l.seller_id as l_seller_id, lp.username::text as l_seller,
           up.username::text as u_username, up.display_name as u_display,
           up.restricted_at is not null as u_restricted
    from app.reports r
    left join app.profiles rp on rp.id = r.reporter_id
    left join app.listings l on l.id = r.listing_id
    left join app.profiles lp on lp.id = l.seller_id
    left join app.profiles up on up.id = r.reported_user_id
"""


def _person(username: str | None, display: str | None, avatar: str | None, urls: Urls):
    if username is None:
        return None
    return SellerSummary(username=username, display_name=display, avatar_url=urls.avatar(avatar))


def _report(r: Any, urls: Urls) -> AdminReport:
    listing = None
    if r["listing_id"] is not None and r["l_title"] is not None:
        listing = ReportListing(
            id=r["listing_id"],
            title=r["l_title"],
            status=r["l_status"],
            hidden=r["l_hidden"],
            seller_username=r["l_seller"],
        )
    user = None
    if r["u_username"] is not None:
        user = ReportUser(
            username=r["u_username"], display_name=r["u_display"], restricted=r["u_restricted"]
        )
    return AdminReport(
        id=r["id"],
        status=r["status"],
        reason=r["reason"],
        details=r["details"],
        created_at=r["created_at"],
        reporter=_person(r["rp_username"], r["rp_display"], r["rp_avatar"], urls),
        target_type=r["target_type"],
        listing=listing,
        user=user,
    )


async def summary(db: AsyncConnection) -> Summary:
    row = (
        (
            await db.execute(
                text(
                    """select
                         (select count(*) from app.reports where status = 'open') as open_reports,
                         (select count(*) from app.disputes where status = 'open') as open_disputes,
                         (select count(*) from app.disputes
                           where status = 'escalated') as escalated_disputes,
                         (select count(*) from app.profiles
                           where restricted_at is not null) as restricted_users,
                         (select count(*) from app.listings
                           where moderation = 'hidden' and status <> 'deleted') as hidden_listings,
                         (select count(*) from app.orders
                           where app.order_is_open(status)) as open_orders"""
                )
            )
        )
        .mappings()
        .one()
    )
    return Summary(**row)


async def reports(db: AsyncConnection, status: str, urls: Urls) -> list[AdminReport]:
    rows = await db.execute(
        text(
            f"""{_REPORT_SQL} where r.status = cast(:s as app.report_status)
                order by r.created_at desc limit 100"""  # noqa: S608 - fixed fragments
        ),
        {"s": status},
    )
    return [_report(r, urls) for r in rows.mappings()]


async def update_report(
    db: AsyncConnection, report_id: uuid.UUID, body: ReportUpdate, urls: Urls
) -> AdminReport:
    row = (
        (await db.execute(text(f"{_REPORT_SQL} where r.id = :id"), {"id": report_id}))  # noqa: S608
        .mappings()
        .first()
    )
    if row is None:
        raise AppError(404, "report_not_found", "This report was not found.")
    if body.hide_listing:
        if row["listing_id"] is None:
            raise AppError(422, "no_listing", "This report is not about a listing.")
        await db.execute(
            text("select app.admin_set_moderation(:id, 'hidden', :note)"),
            {"id": row["listing_id"], "note": body.note},
        )
    if body.restrict_user:
        target = row["reported_user_id"] or row["l_seller_id"]
        if target is None:
            raise AppError(422, "no_user", "The reported account no longer exists.")
        await db.execute(
            text("select app.admin_set_restriction(:id, true, :note)"),
            {"id": target, "note": body.note},
        )
    await db.execute(
        text("select app.admin_set_report(:id, cast(:s as app.report_status), :note)"),
        {"id": report_id, "s": body.status, "note": body.note},
    )
    row = (
        (await db.execute(text(f"{_REPORT_SQL} where r.id = :id"), {"id": report_id}))  # noqa: S608
        .mappings()
        .one()
    )
    return _report(row, urls)


async def set_moderation(
    db: AsyncConnection, listing_id: uuid.UUID, moderation: str, note: str | None
) -> None:
    await db.execute(
        text("select app.admin_set_moderation(:id, cast(:m as app.moderation_status), :note)"),
        {"id": listing_id, "m": moderation, "note": note},
    )


_USER_SQL = """
    select p.id, p.username::text as username, p.display_name, p.avatar_path, p.created_at,
           p.restricted_at,
           (select count(*) from app.listings l
             where l.seller_id = p.id and l.status = 'active') as active_listings,
           (select count(*) from app.reports r
             where r.status = 'open' and (r.reported_user_id = p.id or r.listing_id in
               (select l.id from app.listings l where l.seller_id = p.id))) as open_reports
    from app.profiles p
"""


def _user(r: Any, urls: Urls) -> AdminUser:
    return AdminUser(
        username=r["username"],
        display_name=r["display_name"],
        avatar_url=urls.avatar(r["avatar_path"]),
        joined_at=r["created_at"],
        restricted_at=r["restricted_at"],
        active_listings=r["active_listings"],
        open_reports=r["open_reports"],
    )


async def users(db: AsyncConnection, query: str, urls: Urls) -> list[AdminUser]:
    """Username prefix search; with no query, restricted accounts first, then newest."""
    if query:
        sql = f"{_USER_SQL} where p.username like :q order by p.username limit 20"  # noqa: S608
        params = {"q": query.replace("\\", "").replace("%", "").replace("_", "\\_") + "%"}
    else:
        sql = (
            f"{_USER_SQL} order by p.restricted_at desc nulls last, "  # noqa: S608
            "p.created_at desc limit 20"
        )
        params = {}
    return [_user(r, urls) for r in (await db.execute(text(sql), params)).mappings()]


async def set_restriction(
    db: AsyncConnection, username: str, restricted: bool, note: str | None, urls: Urls
) -> AdminUser:
    profile_id = (
        await db.execute(text("select id from app.profiles where username = :u"), {"u": username})
    ).scalar_one_or_none()
    if profile_id is None:
        raise AppError(404, "user_not_found", "This user was not found.")
    await db.execute(
        text("select app.admin_set_restriction(:id, :r, :note)"),
        {"id": profile_id, "r": restricted, "note": note},
    )
    row = (
        (await db.execute(text(f"{_USER_SQL} where p.id = :id"), {"id": profile_id}))  # noqa: S608
        .mappings()
        .one()
    )
    return _user(row, urls)


_DISPUTE_SQL = """
    select d.id, d.reason::text as reason, d.details, d.status::text as status, d.respond_by,
           d.seller_note, d.admin_note, d.outcome, d.created_at, d.resolved_at,
           o.id as o_id, o.title, o.status::text as o_status, o.fulfilment::text as fulfilment,
           o.item_price_centavos, o.total_centavos, o.shipped_at, o.delivered_at,
           b.username::text as buyer, s.username::text as seller
    from app.disputes d
    join app.orders o on o.id = d.order_id
    left join app.profiles b on b.id = o.buyer_id
    left join app.profiles s on s.id = o.seller_id
"""


def _dispute(r: Any) -> AdminDispute:
    return AdminDispute(
        id=r["id"],
        reason=r["reason"],
        details=r["details"],
        status=r["status"],
        respond_by=r["respond_by"],
        seller_note=r["seller_note"],
        admin_note=r["admin_note"],
        outcome=r["outcome"],
        created_at=r["created_at"],
        resolved_at=r["resolved_at"],
        order=DisputeOrder(
            id=r["o_id"],
            title=r["title"],
            status=r["o_status"],
            fulfilment=r["fulfilment"],
            item_price_centavos=r["item_price_centavos"],
            total_centavos=r["total_centavos"],
            buyer=r["buyer"],
            seller=r["seller"],
            shipped_at=r["shipped_at"],
            delivered_at=r["delivered_at"],
        ),
    )


async def disputes(db: AsyncConnection, status: str) -> list[AdminDispute]:
    # Disputes whose seller ran out of time move to "escalated" first (lazy timer).
    await db.execute(
        text(
            """select app.order_apply_timers_admin(d.order_id) from app.disputes d
               where d.status = 'open' and d.respond_by < now()"""
        )
    )
    rows = await db.execute(
        text(
            f"""{_DISPUTE_SQL} where d.status = cast(:s as app.dispute_status)
                order by d.created_at limit 100"""  # noqa: S608 - fixed fragments
        ),
        {"s": status},
    )
    return [_dispute(r) for r in rows.mappings()]


async def resolve_dispute(
    db: AsyncConnection, dispute_id: uuid.UUID, outcome: str, note: str
) -> AdminDispute:
    await db.execute(
        text("select app.admin_resolve_dispute(:id, :outcome, :note)"),
        {"id": dispute_id, "outcome": outcome, "note": note},
    )
    row = (
        (await db.execute(text(f"{_DISPUTE_SQL} where d.id = :id"), {"id": dispute_id}))  # noqa: S608
        .mappings()
        .one()
    )
    return _dispute(row)


async def actions(db: AsyncConnection, urls: Urls) -> list[AdminAction]:
    rows = await db.execute(
        text(
            """select a.id, a.action, a.target_type, a.target_id, a.note, a.created_at,
                      p.username::text as username, p.display_name, p.avatar_path
               from app.admin_actions a left join app.profiles p on p.id = a.admin_id
               order by a.id desc limit 100"""
        )
    )
    return [
        AdminAction(
            id=r["id"],
            admin=_person(r["username"], r["display_name"], r["avatar_path"], urls),
            action=r["action"],
            target_type=r["target_type"],
            target_id=r["target_id"],
            note=r["note"],
            created_at=r["created_at"],
        )
        for r in rows.mappings()
    ]
