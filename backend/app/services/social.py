"""Favorites, chats, and offers. Runs under the caller's RLS transaction.

Conversations are only visible to their two participants (RLS), so "not found"
and "not yours" look the same (404). The API checks rules first to give clear
error codes; the guard triggers in the migrations enforce them again.
"""

import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.errors import AppError, sqlstate
from app.schemas.catalog import ListingPage, SellerSummary
from app.schemas.social import (
    ConversationDetail,
    ConversationListing,
    ConversationSummary,
    LastMessage,
    Message,
    MessagePage,
    Offer,
    Role,
)
from app.services.catalog import CARD_COLUMNS, CARD_FROM, Urls, card_from_row

_LISTING_GONE = AppError(404, "listing_not_found", "This listing is not available.")
_CONVERSATION_GONE = AppError(404, "conversation_not_found", "This chat was not found.")
_OFFER_GONE = AppError(404, "offer_not_found", "This offer was not found.")


# --- favorites ---------------------------------------------------------------------


async def add_favorite(db: AsyncConnection, uid: uuid.UUID, listing_id: uuid.UUID) -> None:
    row = (
        await db.execute(
            text(
                """select seller_id from app.listings
                   where id = :id and status in ('active', 'paused', 'sold')
                     and moderation = 'ok'"""
            ),
            {"id": listing_id},
        )
    ).first()
    if row is None:
        raise _LISTING_GONE
    if row.seller_id == uid:
        raise AppError(409, "own_listing", "You can't save your own listing.")
    await db.execute(
        text(
            """insert into app.favorites (user_id, listing_id) values (:uid, :id)
               on conflict do nothing"""
        ),
        {"uid": uid, "id": listing_id},
    )


async def remove_favorite(db: AsyncConnection, uid: uuid.UUID, listing_id: uuid.UUID) -> None:
    await db.execute(
        text("delete from app.favorites where user_id = :uid and listing_id = :id"),
        {"uid": uid, "id": listing_id},
    )


async def my_favorites(
    db: AsyncConnection, uid: uuid.UUID, page: int, page_size: int, urls: Urls
) -> ListingPage:
    # Deleted listings are no longer visible (RLS), so they drop out of the list.
    from_sql = (
        f"{CARD_FROM} join app.favorites f on f.listing_id = l.id "
        "where f.user_id = :uid and l.status in ('active', 'paused', 'sold')"
    )
    total = (
        await db.execute(text(f"select count(*) {from_sql}"), {"uid": uid})  # noqa: S608
    ).scalar_one()
    rows = await db.execute(
        text(
            f"select {CARD_COLUMNS} {from_sql} "  # noqa: S608
            "order by f.created_at desc, l.id limit :limit offset :offset"
        ),
        {"uid": uid, "limit": page_size, "offset": (page - 1) * page_size},
    )
    return ListingPage(
        items=[card_from_row(r, urls) for r in rows.mappings()],
        page=page,
        page_size=page_size,
        total=total,
        has_next=page * page_size < total,
    )


async def favorite_ids(db: AsyncConnection, uid: uuid.UUID) -> list[uuid.UUID]:
    """IDs only, for the hearts on listing cards. Newest 1,000 are plenty."""
    rows = await db.execute(
        text(
            """select listing_id from app.favorites where user_id = :uid
               order by created_at desc limit 1000"""
        ),
        {"uid": uid},
    )
    return [r.listing_id for r in rows]


# --- conversations -----------------------------------------------------------------

# My read marker and the other participant, depending on my side of the chat.
_MY_READ = "case when c.buyer_id = :uid then c.buyer_last_read_at else c.seller_last_read_at end"
_OTHER = "case when c.buyer_id = :uid then c.seller_id else c.buyer_id end"

_SUMMARY_SQL = f"""
    select c.id, c.buyer_id, c.seller_id,
           l.id as l_id, l.title as l_title, l.price_centavos as l_price,
           l.status::text as l_status,
           (select i.thumb_path from app.listing_images i
             where i.listing_id = l.id order by i.position limit 1) as l_thumb,
           op.username::text as o_username, op.display_name as o_display,
           op.avatar_path as o_avatar,
           lm.body as lm_body, lm.created_at as lm_at, lm.sender_id as lm_sender,
           (select count(*) from app.messages m
             where m.conversation_id = c.id and m.sender_id is distinct from :uid
               and m.created_at > coalesce({_MY_READ}, '-infinity')) as unread
    from app.conversations c
    left join app.listings l on l.id = c.listing_id
    left join app.profiles op on op.id = {_OTHER}
    left join lateral (
      select body, created_at, sender_id from app.messages m
      where m.conversation_id = c.id order by m.id desc limit 1
    ) lm on true
    where :uid in (c.buyer_id, c.seller_id)
"""  # noqa: S608 - fixed fragments only

# A chat the buyer opened but never wrote in is not shown to the seller.
_HAS_MESSAGES_OR_MINE = (
    "(c.buyer_id = :uid or exists (select 1 from app.messages m where m.conversation_id = c.id))"
)


def _summary(row: Any, uid: uuid.UUID, urls: Urls) -> ConversationSummary:
    listing = None
    if row["l_id"] is not None:
        listing = ConversationListing(
            id=row["l_id"],
            title=row["l_title"],
            price_centavos=row["l_price"],
            status=row["l_status"],
            cover_thumb_url=urls.listing(row["l_thumb"]),
        )
    other = None
    if row["o_username"] is not None:
        other = SellerSummary(
            username=row["o_username"],
            display_name=row["o_display"],
            avatar_url=urls.avatar(row["o_avatar"]),
        )
    last = None
    if row["lm_at"] is not None:
        last = LastMessage(
            preview=row["lm_body"][:120], at=row["lm_at"], mine=row["lm_sender"] == uid
        )
    return ConversationSummary(
        id=row["id"],
        role=Role.buying if row["buyer_id"] == uid else Role.selling,
        listing=listing,
        other_user=other,
        last_message=last,
        unread_count=row["unread"],
    )


async def inbox(
    db: AsyncConnection,
    uid: uuid.UUID,
    role: Role | None,
    page: int,
    page_size: int,
    urls: Urls,
) -> list[ConversationSummary]:
    where = [_HAS_MESSAGES_OR_MINE]
    if role == Role.buying:
        where.append("c.buyer_id = :uid")
    elif role == Role.selling:
        where.append("c.seller_id = :uid")
    rows = await db.execute(
        text(
            f"{_SUMMARY_SQL} and {' and '.join(where)} "
            "order by c.last_message_at desc, c.id limit :limit offset :offset"
        ),
        {"uid": uid, "limit": page_size, "offset": (page - 1) * page_size},
    )
    return [_summary(r, uid, urls) for r in rows.mappings()]


async def _conversation_row(db: AsyncConnection, uid: uuid.UUID, conv_id: uuid.UUID) -> Any:
    row = (
        (await db.execute(text(f"{_SUMMARY_SQL} and c.id = :cid"), {"uid": uid, "cid": conv_id}))
        .mappings()
        .first()
    )
    if row is None:
        raise _CONVERSATION_GONE
    return row


async def _expire_stale(db: AsyncConnection, conv_id: uuid.UUID) -> None:
    await db.execute(text("select app.expire_stale_offers(:id)"), {"id": conv_id})


async def conversation(
    db: AsyncConnection, uid: uuid.UUID, conv_id: uuid.UUID, urls: Urls
) -> ConversationDetail:
    row = await _conversation_row(db, uid, conv_id)
    await _expire_stale(db, conv_id)
    summary = _summary(row, uid, urls)
    latest = await _latest_offer(db, conv_id)
    both_here = row["buyer_id"] is not None and row["seller_id"] is not None
    listing_active = summary.listing is not None and summary.listing.status == "active"
    return ConversationDetail(
        **summary.model_dump(),
        latest_offer=latest,
        can_message=both_here,
        can_offer=(
            summary.role == Role.buying
            and both_here
            and listing_active
            and (latest is None or latest.status != "pending")
        ),
    )


async def start_conversation(
    db: AsyncConnection, uid: uuid.UUID, listing_id: uuid.UUID
) -> uuid.UUID:
    """Get or create the caller's chat (as buyer) about a listing."""
    listing = (
        await db.execute(
            text(
                """select seller_id, status::text as status from app.listings
                   where id = :id and status <> 'deleted' and moderation = 'ok'"""
            ),
            {"id": listing_id},
        )
    ).first()
    if listing is None:
        raise _LISTING_GONE
    if listing.seller_id == uid:
        raise AppError(409, "own_listing", "This is your own listing.")

    existing = await _existing_chat(db, uid, listing_id)
    if existing is not None:
        return existing  # an old chat stays open even if the item is now sold
    if listing.status != "active":
        raise AppError(409, "listing_unavailable", "This item is no longer available.")
    blocked = await db.execute(
        text("select app.is_blocked_between(:a, :b)"), {"a": uid, "b": listing.seller_id}
    )
    if blocked.scalar_one():
        raise AppError(403, "blocked", "You can't message this user.")
    try:
        async with db.begin_nested():
            created = await db.execute(
                text(
                    """insert into app.conversations (listing_id, buyer_id)
                       values (:id, :uid) returning id"""
                ),
                {"id": listing_id, "uid": uid},
            )
            return created.scalar_one()
    except DBAPIError as exc:
        if sqlstate(exc) != "23505":
            raise
    # Two clicks at once: the other request created it first.
    existing = await _existing_chat(db, uid, listing_id)
    if existing is None:  # pragma: no cover - unique clash implies it exists
        raise _LISTING_GONE
    return existing


async def _existing_chat(
    db: AsyncConnection, uid: uuid.UUID, listing_id: uuid.UUID
) -> uuid.UUID | None:
    return (
        await db.execute(
            text("select id from app.conversations where listing_id = :id and buyer_id = :uid"),
            {"id": listing_id, "uid": uid},
        )
    ).scalar_one_or_none()


async def mark_read(db: AsyncConnection, uid: uuid.UUID, conv_id: uuid.UUID) -> None:
    row = await _conversation_row(db, uid, conv_id)
    # Two fixed statements; each participant may only move their own marker.
    column = "buyer_last_read_at" if row["buyer_id"] == uid else "seller_last_read_at"
    await db.execute(
        text(f"update app.conversations set {column} = now() where id = :id"),  # noqa: S608
        {"id": conv_id},
    )


async def unread_total(db: AsyncConnection, uid: uuid.UUID) -> int:
    return (
        await db.execute(
            text(
                f"""select count(*) from app.messages m
                    join app.conversations c on c.id = m.conversation_id
                    where :uid in (c.buyer_id, c.seller_id)
                      and m.sender_id is distinct from :uid
                      and m.created_at > coalesce({_MY_READ}, '-infinity')"""  # noqa: S608
            ),
            {"uid": uid},
        )
    ).scalar_one()


# --- messages ----------------------------------------------------------------------

_MESSAGE_SQL = """
    select m.id, m.kind::text as kind, m.body, m.sender_id, m.created_at,
           o.id as o_id, o.amount_centavos as o_amount, o.status::text as o_status,
           o.created_at as o_created, o.expires_at as o_expires, o.responded_at as o_responded
    from app.messages m
    left join app.offers o on o.id = m.offer_id
    where m.conversation_id = :cid
"""


def _message(row: Any, uid: uuid.UUID) -> Message:
    offer = None
    if row["o_id"] is not None:
        offer = Offer(
            id=row["o_id"],
            amount_centavos=row["o_amount"],
            status=row["o_status"],
            created_at=row["o_created"],
            expires_at=row["o_expires"],
            responded_at=row["o_responded"],
        )
    return Message(
        id=row["id"],
        kind=row["kind"],
        body=row["body"],
        mine=row["sender_id"] == uid,
        created_at=row["created_at"],
        offer=offer,
    )


async def messages(
    db: AsyncConnection,
    uid: uuid.UUID,
    conv_id: uuid.UUID,
    *,
    before: int | None,
    after: int | None,
    limit: int,
) -> MessagePage:
    """Newest page by default; `before` loads older ones; `after` polls for new ones."""
    await _conversation_row(db, uid, conv_id)
    await _expire_stale(db, conv_id)
    params: dict[str, Any] = {"cid": conv_id, "limit": limit + 1}
    if after is not None:
        sql = f"{_MESSAGE_SQL} and m.id > :after order by m.id asc limit :limit"
        params["after"] = after
    elif before is not None:
        sql = f"{_MESSAGE_SQL} and m.id < :before order by m.id desc limit :limit"
        params["before"] = before
    else:
        sql = f"{_MESSAGE_SQL} order by m.id desc limit :limit"
    rows = list((await db.execute(text(sql), params)).mappings())
    more = len(rows) > limit
    rows = rows[:limit]
    if after is None:
        rows.reverse()  # always oldest first
    items = [_message(r, uid) for r in rows]
    next_before = items[0].id if (more and after is None and items) else None
    return MessagePage(items=items, next_before=next_before)


async def send_message(
    db: AsyncConnection, uid: uuid.UUID, conv_id: uuid.UUID, body: str
) -> Message:
    row = await _conversation_row(db, uid, conv_id)
    if row["buyer_id"] is None or row["seller_id"] is None:
        raise AppError(409, "user_left", "The other person has deleted their account.")
    blocked = await db.execute(
        text("select app.is_blocked_between(:a, :b)"),
        {"a": row["buyer_id"], "b": row["seller_id"]},
    )
    if blocked.scalar_one():
        raise AppError(403, "blocked", "You can't message this user.")
    new_id = (
        await db.execute(
            text(
                """insert into app.messages (conversation_id, sender_id, kind, body)
                   values (:cid, :uid, 'text', :body) returning id"""
            ),
            {"cid": conv_id, "uid": uid, "body": body},
        )
    ).scalar_one()
    created = (
        (await db.execute(text(f"{_MESSAGE_SQL} and m.id = :mid"), {"cid": conv_id, "mid": new_id}))
        .mappings()
        .one()
    )
    return _message(created, uid)


# --- offers ------------------------------------------------------------------------

_OFFER_COLUMNS = (
    "o.id, o.amount_centavos, o.status::text as status, o.created_at, o.expires_at, o.responded_at"
)


def _offer(row: Any) -> Offer:
    return Offer(**row)


async def _latest_offer(db: AsyncConnection, conv_id: uuid.UUID) -> Offer | None:
    row = (
        (
            await db.execute(
                text(
                    f"""select {_OFFER_COLUMNS} from app.offers o
                        where o.conversation_id = :id order by o.created_at desc limit 1"""  # noqa: S608
                ),
                {"id": conv_id},
            )
        )
        .mappings()
        .first()
    )
    return _offer(row) if row else None


async def offers(db: AsyncConnection, uid: uuid.UUID, conv_id: uuid.UUID) -> list[Offer]:
    await _conversation_row(db, uid, conv_id)
    await _expire_stale(db, conv_id)
    rows = await db.execute(
        text(
            f"""select {_OFFER_COLUMNS} from app.offers o
                where o.conversation_id = :id order by o.created_at desc"""  # noqa: S608
        ),
        {"id": conv_id},
    )
    return [_offer(r) for r in rows.mappings()]


async def make_offer(
    db: AsyncConnection, uid: uuid.UUID, conv_id: uuid.UUID, amount_centavos: int
) -> Offer:
    row = await _conversation_row(db, uid, conv_id)
    if row["buyer_id"] != uid:
        raise AppError(403, "not_buyer", "Only the buyer can make an offer.")
    if row["seller_id"] is None:
        raise AppError(409, "user_left", "The other person has deleted their account.")
    if row["l_status"] != "active":
        raise AppError(409, "listing_unavailable", "This item is no longer available.")
    await _expire_stale(db, conv_id)
    latest = await _latest_offer(db, conv_id)
    if latest is not None and latest.status == "pending":
        raise AppError(409, "offer_pending", "You already have an offer waiting for an answer.")
    try:
        async with db.begin_nested():
            created = await db.execute(
                text(
                    f"""insert into app.offers (conversation_id, amount_centavos)
                        values (:cid, :amount)
                        returning {_OFFER_COLUMNS.replace("o.", "")}"""  # noqa: S608
                ),
                {"cid": conv_id, "amount": amount_centavos},
            )
            return _offer(created.mappings().one())
    except DBAPIError as exc:
        if sqlstate(exc) == "23505":  # another tab made an offer at the same moment
            raise AppError(
                409, "offer_pending", "You already have an offer waiting for an answer."
            ) from exc
        raise


# Who may move a pending offer to which status.
_RESPONSES = {"accepted": "seller", "rejected": "seller", "withdrawn": "buyer"}


async def respond_to_offer(
    db: AsyncConnection, uid: uuid.UUID, offer_id: uuid.UUID, new_status: str
) -> Offer:
    lookup = text(
        f"""select {_OFFER_COLUMNS}, o.conversation_id, o.buyer_id, o.seller_id
            from app.offers o where o.id = :id for update"""  # noqa: S608
    )
    row = (await db.execute(lookup, {"id": offer_id})).mappings().first()
    if row is None:
        raise _OFFER_GONE
    await _expire_stale(db, row["conversation_id"])
    row = (await db.execute(lookup, {"id": offer_id})).mappings().one()

    side = _RESPONSES[new_status]
    if row[f"{side}_id"] != uid:
        who = "seller" if side == "seller" else "buyer"
        raise AppError(403, "not_allowed", f"Only the {who} can do that.")
    if row["status"] == "expired":
        raise AppError(409, "offer_expired", "This offer has expired.")
    if row["status"] != "pending":
        raise AppError(409, "offer_not_pending", "This offer was already answered.")
    updated = await db.execute(
        text(
            f"""update app.offers set status = cast(:s as app.offer_status) where id = :id
                returning {_OFFER_COLUMNS.replace("o.", "")}"""  # noqa: S608
        ),
        {"s": new_status, "id": offer_id},
    )
    return _offer(updated.mappings().one())
