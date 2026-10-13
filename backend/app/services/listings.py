"""Seller actions: create, edit, change status, delete, and manage photos.

Every function runs inside the caller's RLS transaction. The seller is always the
token's user ID. Each action first locks the listing row (`for update`) so two
requests cannot interleave (for example, two uploads both passing the 8-photo check).
Database triggers enforce the same rules again (see the migrations).
"""

import uuid
from typing import Any

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.errors import AppError
from app.schemas.catalog import ListingPage, ListingStatus
from app.schemas.listings import ListingCreate, ListingUpdate
from app.services.catalog import CARD_COLUMNS, CARD_FROM, Urls, card_from_row
from app.services.images import process_image
from app.services.safety import ensure_not_restricted
from app.services.storage import LISTING_BUCKET, Storage

MAX_PHOTOS = 8

# Same table as the listings_guard trigger (deleting has its own endpoint).
TRANSITIONS: dict[str, set[str]] = {
    "draft": {"active"},
    "active": {"paused", "sold"},
    "paused": {"active", "sold"},
    "sold": {"paused"},
    "reserved": set(),  # only its order moves it (TRANSACTIONS_DESIGN §4)
}

_RESERVED = AppError(
    409, "listing_reserved", "This item is reserved for an order. Finish or cancel the order first."
)

# Columns a seller may edit. SQL is built only from this fixed list.
_EDITABLE = (
    "title",
    "description",
    "category_id",
    "city_id",
    "price_centavos",
    "condition",
    "meetup",
    "delivery",
    "deal_note",
    "size",
    "payment_methods",
    "couriers",
)
_CASTS = {"condition": "cast(:condition as app.listing_condition)"}

_NOT_FOUND = AppError(404, "listing_not_found", "This listing is not available.")


async def _lock_own(db: AsyncConnection, listing_id: uuid.UUID, uid: uuid.UUID) -> Any:
    """The caller's own, not-deleted listing, locked. Anything else is a 404."""
    row = (
        (
            await db.execute(
                text(
                    """select id, status::text as status, meetup, delivery, category_id, size,
                              payment_methods, couriers
                       from app.listings
                       where id = :id and seller_id = :uid and status <> 'deleted'
                       for update"""
                ),
                {"id": listing_id, "uid": uid},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise _NOT_FOUND
    return row


async def _lock_editable(db: AsyncConnection, listing_id: uuid.UUID, uid: uuid.UUID) -> Any:
    """Like _lock_own, for changes to what buyers see (fields and photos). Not while an
    order holds the item (the buyer bought what it said then), and not while the
    seller is restricted. Triggers check both again."""
    row = await _lock_own(db, listing_id, uid)
    if row["status"] == "reserved":
        raise _RESERVED
    await ensure_not_restricted(db, uid)
    return row


async def _check_refs(db: AsyncConnection, category_id: int | None, city_id: int | None) -> None:
    fields: dict[str, str] = {}
    if category_id is not None:
        cat = (
            (
                await db.execute(
                    text(
                        """select exists (select 1 from app.categories c
                                          where c.parent_id = p.id) as has_children
                           from app.categories p where p.id = :id"""
                    ),
                    {"id": category_id},
                )
            )
            .mappings()
            .first()
        )
        if cat is None:
            fields["category_id"] = "Choose a category."
        elif cat["has_children"]:
            fields["category_id"] = "Choose a subcategory."
    if city_id is not None:
        found = await db.execute(
            text("select 1 from app.locations where id = :id"), {"id": city_id}
        )
        if found.first() is None:
            fields["city_id"] = "Choose a city."
    if fields:
        raise AppError(422, "validation_error", "Some fields are invalid.", fields)


async def _check_size(db: AsyncConnection, category_id: int, size: str | None) -> None:
    """The size must be on the category's list (the database checks this again)."""
    if size is None:
        return
    sizes = (
        await db.execute(
            text(
                """select o.value from app.categories c
                   join app.size_options o on o.size_group = c.size_group
                   where c.id = :id"""
            ),
            {"id": category_id},
        )
    ).scalars()
    allowed = set(sizes)
    if size not in allowed:
        message = "Pick a size from the list." if allowed else "This category has no sizes."
        raise AppError(422, "validation_error", "Some fields are invalid.", {"size": message})


def _check_deal_options(
    meetup: bool, delivery: bool, payment_methods: list[str], couriers: list[str]
) -> None:
    """Same rules as the listings_* check constraints, with field-level messages."""
    fields: dict[str, str] = {}
    if not (meetup or delivery):
        fields["meetup"] = "Choose meetup, delivery, or both."
    if not delivery and "cod" in payment_methods:
        fields["payment_methods"] = "Cash on delivery needs delivery."
    if not meetup and "cash" in payment_methods:
        fields["payment_methods"] = "Cash in person needs a meetup."
    if not delivery and couriers:
        fields["couriers"] = "Couriers need delivery."
    if fields:
        raise AppError(422, "validation_error", "Some fields are invalid.", fields)


# --- listing fields ----------------------------------------------------------------


async def create_listing(db: AsyncConnection, uid: uuid.UUID, body: ListingCreate) -> uuid.UUID:
    await ensure_not_restricted(db, uid)
    await _check_refs(db, body.category_id, body.city_id)
    await _check_size(db, body.category_id, body.size)
    values = body.model_dump(mode="json")
    _check_deal_options(body.meetup, body.delivery, values["payment_methods"], values["couriers"])
    row = await db.execute(
        text(
            """insert into app.listings
                 (seller_id, category_id, city_id, title, description, price_centavos,
                  condition, meetup, delivery, deal_note, size, payment_methods, couriers)
               values (:uid, :category_id, :city_id, :title, :description, :price_centavos,
                       cast(:condition as app.listing_condition), :meetup, :delivery,
                       :deal_note, :size, :payment_methods, :couriers)
               returning id"""
        ),
        {"uid": uid, **values},
    )
    return row.scalar_one()


async def update_listing(
    db: AsyncConnection, uid: uuid.UUID, listing_id: uuid.UUID, body: ListingUpdate
) -> None:
    current = await _lock_editable(db, listing_id, uid)
    changes = body.model_dump(mode="json", exclude_unset=True)
    await _check_refs(db, changes.get("category_id"), changes.get("city_id"))
    if "size" in changes or "category_id" in changes:
        await _check_size(
            db,
            changes.get("category_id", current["category_id"]),
            changes.get("size", current["size"]),
        )
    _check_deal_options(
        changes.get("meetup", current["meetup"]),
        changes.get("delivery", current["delivery"]),
        changes.get("payment_methods", current["payment_methods"]),
        changes.get("couriers", current["couriers"]),
    )
    columns = [c for c in _EDITABLE if c in changes]
    if not columns:
        return
    assignments = ", ".join(f"{c} = {_CASTS.get(c, ':' + c)}" for c in columns)
    await db.execute(
        text(f"update app.listings set {assignments} where id = :id"),  # noqa: S608
        {**{c: changes[c] for c in columns}, "id": listing_id},
    )


async def change_status(
    db: AsyncConnection, uid: uuid.UUID, listing_id: uuid.UUID, new: str
) -> None:
    current = await _lock_own(db, listing_id, uid)
    old = current["status"]
    if old == new:
        return  # repeating a click is harmless
    if old == "reserved":
        raise _RESERVED
    if new not in TRANSITIONS[old]:
        raise AppError(409, "invalid_status_change", f"A {old} listing can't be changed to {new}.")
    if new == "active":
        await ensure_not_restricted(db, uid)
    if new == "active" and await _photo_count(db, listing_id) == 0:
        raise AppError(409, "listing_needs_photo", "Add at least one photo before publishing.")
    await db.execute(
        text("update app.listings set status = cast(:s as app.listing_status) where id = :id"),
        {"s": new, "id": listing_id},
    )


async def delete_listing(db: AsyncConnection, uid: uuid.UUID, listing_id: uuid.UUID) -> list[str]:
    """Soft delete. Returns the photo files to remove from Storage after commit."""
    if (await _lock_own(db, listing_id, uid))["status"] == "reserved":
        raise _RESERVED
    await db.execute(
        text("update app.listings set status = 'deleted' where id = :id"), {"id": listing_id}
    )
    rows = await db.execute(
        text(
            """delete from app.listing_images where listing_id = :id
               returning full_path, thumb_path"""
        ),
        {"id": listing_id},
    )
    return [path for r in rows for path in (r.full_path, r.thumb_path)]


async def my_listings(
    db: AsyncConnection,
    uid: uuid.UUID,
    status: ListingStatus,
    page: int,
    page_size: int,
    urls: Urls,
) -> ListingPage:
    params = {"uid": uid, "status": status.value}
    where = "l.seller_id = :uid and l.status = cast(:status as app.listing_status)"
    total = (
        await db.execute(text(f"select count(*) {CARD_FROM} where {where}"), params)  # noqa: S608
    ).scalar_one()
    rows = await db.execute(
        text(
            f"select {CARD_COLUMNS} {CARD_FROM} where {where} "  # noqa: S608
            "order by l.updated_at desc, l.id limit :limit offset :offset"
        ),
        {**params, "limit": page_size, "offset": (page - 1) * page_size},
    )
    return ListingPage(
        items=[card_from_row(r, urls) for r in rows.mappings()],
        page=page,
        page_size=page_size,
        total=total,
        has_next=page * page_size < total,
    )


# --- photos ------------------------------------------------------------------------


async def _photo_count(db: AsyncConnection, listing_id: uuid.UUID) -> int:
    return (
        await db.execute(
            text("select count(*) from app.listing_images where listing_id = :id"),
            {"id": listing_id},
        )
    ).scalar_one()


async def _repack_positions(db: AsyncConnection, listing_id: uuid.UUID) -> None:
    """Keep positions 0..n-1 so position 0 is always the cover photo."""
    await db.execute(
        text(
            """update app.listing_images i set position = r.rn - 1
               from (select id, row_number() over (order by position) as rn
                     from app.listing_images where listing_id = :id) r
               where i.id = r.id and i.position <> r.rn - 1"""
        ),
        {"id": listing_id},
    )


async def add_photos(
    db: AsyncConnection,
    storage: Storage,
    token: str,
    uid: uuid.UUID,
    listing_id: uuid.UUID,
    uploads: list[bytes],
) -> None:
    await _lock_editable(db, listing_id, uid)
    count = await _photo_count(db, listing_id)
    if count + len(uploads) > MAX_PHOTOS:
        left = MAX_PHOTOS - count
        raise AppError(
            409,
            "too_many_photos",
            f"A listing can have up to {MAX_PHOTOS} photos. You can add {left} more.",
        )
    # Check and convert every file before uploading any, so one bad file stores nothing.
    processed = [await run_in_threadpool(process_image, data) for data in uploads]

    uploaded: list[str] = []
    try:
        for offset, photo in enumerate(processed):
            base = f"{uid}/{listing_id}/{uuid.uuid4().hex}"
            full_path, thumb_path = f"{base}-full.webp", f"{base}-thumb.webp"
            await storage.upload(token, LISTING_BUCKET, full_path, photo.full)
            uploaded.append(full_path)
            await storage.upload(token, LISTING_BUCKET, thumb_path, photo.thumb)
            uploaded.append(thumb_path)
            await db.execute(
                text(
                    """insert into app.listing_images
                         (listing_id, position, full_path, thumb_path, width, height)
                       values (:listing_id, :position, :full, :thumb, :width, :height)"""
                ),
                {
                    "listing_id": listing_id,
                    "position": count + offset,
                    "full": full_path,
                    "thumb": thumb_path,
                    "width": photo.width,
                    "height": photo.height,
                },
            )
    except Exception:
        # The transaction will roll back; do not leave orphan files behind.
        await storage.remove(token, LISTING_BUCKET, uploaded)
        raise


async def remove_photo(
    db: AsyncConnection, uid: uuid.UUID, listing_id: uuid.UUID, image_id: uuid.UUID
) -> list[str]:
    """Returns the files to remove from Storage after commit."""
    listing = await _lock_own(db, listing_id, uid)
    if listing["status"] == "reserved":
        raise _RESERVED
    image = (
        await db.execute(
            text(
                """select full_path, thumb_path from app.listing_images
                   where id = :image_id and listing_id = :listing_id"""
            ),
            {"image_id": image_id, "listing_id": listing_id},
        )
    ).first()
    if image is None:
        raise AppError(404, "image_not_found", "This photo was not found.")
    if listing["status"] == "active" and await _photo_count(db, listing_id) == 1:
        raise AppError(
            409,
            "last_photo",
            "A live listing needs at least one photo. Add another photo first, or pause it.",
        )
    await db.execute(text("delete from app.listing_images where id = :id"), {"id": image_id})
    await _repack_positions(db, listing_id)
    return [image.full_path, image.thumb_path]


async def reorder_photos(
    db: AsyncConnection, uid: uuid.UUID, listing_id: uuid.UUID, image_ids: list[uuid.UUID]
) -> None:
    await _lock_editable(db, listing_id, uid)
    current = {
        r.id
        for r in await db.execute(
            text("select id from app.listing_images where listing_id = :id"), {"id": listing_id}
        )
    }
    if len(image_ids) != len(set(image_ids)) or set(image_ids) != current:
        raise AppError(
            422, "image_order_mismatch", "Send every photo of this listing exactly once."
        )
    # The unique (listing_id, position) check runs at commit, so swaps are fine.
    for position, image_id in enumerate(image_ids):
        await db.execute(
            text("update app.listing_images set position = :p where id = :id"),
            {"p": position, "id": image_id},
        )
