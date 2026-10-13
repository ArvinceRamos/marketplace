"""Read queries for browsing. Every query runs under RLS (anon or the signed-in user).

SQL is assembled only from fixed fragments chosen by validated enums; user input is
always passed as bound parameters.
"""

import uuid
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.schemas.catalog import (
    CategoryChild,
    CategoryNode,
    CategoryRef,
    CityRef,
    Condition,
    Courier,
    ListingCard,
    ListingDetail,
    ListingImage,
    ListingPage,
    Location,
    PaymentMethod,
    PublicProfile,
    SellerSummary,
    SortOrder,
)

_ORDER_BY = {
    SortOrder.newest: "l.published_at desc, l.id",
    SortOrder.price_asc: "l.price_centavos asc, l.published_at desc, l.id",
    SortOrder.price_desc: "l.price_centavos desc, l.published_at desc, l.id",
    SortOrder.relevance: (
        "ts_rank(l.search, websearch_to_tsquery('simple', :q)) desc, l.published_at desc, l.id"
    ),
}

CARD_COLUMNS = """
    l.id, l.title, l.price_centavos, l.condition::text as condition, l.status::text as status,
    l.published_at, l.size, loc.id as city_id, loc.slug as city_slug, loc.city as city_name,
    p.username::text as username, p.display_name, p.avatar_path,
    (select i.thumb_path from app.listing_images i
      where i.listing_id = l.id order by i.position limit 1) as cover_thumb
"""

CARD_FROM = """
    from app.listings l
    join app.profiles p on p.id = l.seller_id
    join app.locations loc on loc.id = l.city_id
"""


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class Urls:
    """Builds public file URLs from storage paths."""

    def __init__(self, public_storage_url: str) -> None:
        self.base = public_storage_url.rstrip("/")

    def listing(self, path: str | None) -> str | None:
        return f"{self.base}/listing-images/{path}" if path else None

    def avatar(self, path: str | None) -> str | None:
        return f"{self.base}/avatars/{path}" if path else None


def card_from_row(row: Any, urls: Urls) -> ListingCard:
    return ListingCard(
        id=row["id"],
        title=row["title"],
        price_centavos=row["price_centavos"],
        condition=row["condition"],
        status=row["status"],
        city=CityRef(id=row["city_id"], slug=row["city_slug"], name=row["city_name"]),
        cover_thumb_url=urls.listing(row["cover_thumb"]),
        seller=SellerSummary(
            username=row["username"],
            display_name=row["display_name"],
            avatar_url=urls.avatar(row["avatar_path"]),
        ),
        published_at=row["published_at"],
        size=row["size"],
    )


# --- reference data -------------------------------------------------------------


async def category_tree(db: AsyncConnection) -> list[CategoryNode]:
    rows = await db.execute(
        text(
            """select c.id, c.parent_id, c.slug, c.name,
                      array(select o.value from app.size_options o
                            where o.size_group = c.size_group
                            order by o.sort_order) as sizes
               from app.categories c order by c.sort_order, c.name"""
        )
    )
    parents: dict[int, CategoryNode] = {}
    children: list[Any] = []
    for r in rows.mappings():
        if r["parent_id"] is None:
            parents[r["id"]] = CategoryNode(id=r["id"], slug=r["slug"], name=r["name"])
        else:
            children.append(r)
    for r in children:
        if r["parent_id"] in parents:
            parents[r["parent_id"]].children.append(
                CategoryChild(id=r["id"], slug=r["slug"], name=r["name"], sizes=r["sizes"])
            )
    return list(parents.values())


async def locations(db: AsyncConnection) -> list[Location]:
    rows = await db.execute(
        text("select id, slug, city, province, region from app.locations order by city")
    )
    return [Location(**r) for r in rows.mappings()]


# --- search ----------------------------------------------------------------------


@dataclass
class SearchFilters:
    q: str | None = None
    category: str | None = None
    min_price_centavos: int | None = None
    max_price_centavos: int | None = None
    conditions: list[Condition] = field(default_factory=list)
    city: str | None = None
    seller_username: str | None = None
    sizes: list[str] = field(default_factory=list)
    payment_methods: list[PaymentMethod] = field(default_factory=list)
    couriers: list[Courier] = field(default_factory=list)
    # Feed: only sellers this user follows.
    followed_by: uuid.UUID | None = None
    sort: SortOrder = SortOrder.newest
    page: int = 1
    page_size: int = 24


async def search_listings(db: AsyncConnection, f: SearchFilters, urls: Urls) -> ListingPage:
    where = ["l.status = 'active'", "l.moderation = 'ok'"]
    params: dict[str, Any] = {}
    if f.q:
        # Match title/description words, partial titles, and category names
        # (so "laptop" also finds items listed under "Laptops & Computers").
        where.append(
            "(l.search @@ websearch_to_tsquery('simple', :q) or l.title ilike :like"
            " or l.category_id in (select c.id from app.categories c where c.name ilike :like))"
        )
        params["q"] = f.q
        params["like"] = f"%{_escape_like(f.q)}%"
    if f.category:
        where.append(
            "l.category_id in (select c.id from app.categories c where c.slug = :category "
            "or c.parent_id = (select p.id from app.categories p where p.slug = :category))"
        )
        params["category"] = f.category
    if f.min_price_centavos is not None:
        where.append("l.price_centavos >= :min_price")
        params["min_price"] = f.min_price_centavos
    if f.max_price_centavos is not None:
        where.append("l.price_centavos <= :max_price")
        params["max_price"] = f.max_price_centavos
    if f.conditions:
        where.append("l.condition::text = any(:conditions)")
        params["conditions"] = [c.value for c in f.conditions]
    if f.city:
        where.append("loc.slug = :city")
        params["city"] = f.city
    if f.seller_username:
        where.append("p.username = :seller")
        params["seller"] = f.seller_username
    if f.sizes:
        where.append("l.size = any(:sizes)")
        params["sizes"] = f.sizes
    if f.payment_methods:  # any of them
        where.append("l.payment_methods && cast(:payment_methods as text[])")
        params["payment_methods"] = [m.value for m in f.payment_methods]
    if f.couriers:
        where.append("l.couriers && cast(:couriers as text[])")
        params["couriers"] = [c.value for c in f.couriers]
    if f.followed_by:
        where.append(
            "l.seller_id in (select fo.followed_id from app.follows fo"
            " where fo.follower_id = :follower)"
        )
        params["follower"] = f.followed_by

    # Relevance needs a query; without one, fall back to newest.
    sort = f.sort if (f.sort != SortOrder.relevance or f.q) else SortOrder.newest
    where_sql = " and ".join(where)
    count_sql = f"select count(*) {CARD_FROM} where {where_sql}"  # noqa: S608
    total = (await db.execute(text(count_sql), params)).scalar_one()
    page_sql = (
        f"select {CARD_COLUMNS} {CARD_FROM} where {where_sql} "  # noqa: S608
        f"order by {_ORDER_BY[sort]} limit :limit offset :offset"
    )
    rows = await db.execute(
        text(page_sql), {**params, "limit": f.page_size, "offset": (f.page - 1) * f.page_size}
    )
    return ListingPage(
        items=[card_from_row(r, urls) for r in rows.mappings()],
        page=f.page,
        page_size=f.page_size,
        total=total,
        has_next=f.page * f.page_size < total,
    )


# --- detail ----------------------------------------------------------------------

_DETAIL_SQL = f"""
    select {CARD_COLUMNS}, l.seller_id, l.description, l.meetup, l.delivery,
           l.deal_note, l.payment_methods, l.couriers, l.created_at, l.updated_at,
           l.moderation = 'hidden' as hidden,
           c.id as cat_id, c.slug as cat_slug, c.name as cat_name,
           pc.id as pcat_id, pc.slug as pcat_slug, pc.name as pcat_name
    {CARD_FROM}
    join app.categories c on c.id = l.category_id
    left join app.categories pc on pc.id = c.parent_id
    where l.id = :id and l.status <> 'deleted'
"""  # noqa: S608 - fixed fragments only

_IMAGES_SQL = """
    select id, position, full_path, thumb_path, width, height
    from app.listing_images where listing_id = :id order by position
"""


async def listing_detail(
    db: AsyncConnection, listing_id: uuid.UUID, viewer_id: uuid.UUID | None, urls: Urls
) -> ListingDetail | None:
    # An abandoned checkout frees the listing as soon as anyone looks at it.
    await db.execute(text("select app.listing_tick(:id)"), {"id": listing_id})
    row = (await db.execute(text(_DETAIL_SQL), {"id": listing_id})).mappings().first()
    if row is None:
        return None  # missing, deleted, or not visible to this caller (RLS)
    images = (await db.execute(text(_IMAGES_SQL), {"id": listing_id})).mappings()
    card = card_from_row(row, urls)
    parent = (
        CategoryRef(id=row["pcat_id"], slug=row["pcat_slug"], name=row["pcat_name"])
        if row["pcat_id"] is not None
        else None
    )
    return ListingDetail(
        **card.model_dump(),
        description=row["description"],
        category=CategoryRef(id=row["cat_id"], slug=row["cat_slug"], name=row["cat_name"]),
        parent_category=parent,
        images=[
            ListingImage(
                id=i["id"],
                position=i["position"],
                full_url=urls.listing(i["full_path"]) or "",
                thumb_url=urls.listing(i["thumb_path"]) or "",
                width=i["width"],
                height=i["height"],
            )
            for i in images
        ],
        meetup=row["meetup"],
        delivery=row["delivery"],
        deal_note=row["deal_note"],
        payment_methods=row["payment_methods"],
        couriers=row["couriers"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        is_owner=viewer_id is not None and row["seller_id"] == viewer_id,
        hidden=row["hidden"],
        **(await _viewer_state(db, listing_id, viewer_id)),
    )


async def _viewer_state(
    db: AsyncConnection, listing_id: uuid.UUID, viewer_id: uuid.UUID | None
) -> dict[str, Any]:
    if viewer_id is None:
        return {}
    row = (
        await db.execute(
            text(
                """select exists (select 1 from app.favorites
                                  where user_id = :uid and listing_id = :id) as fav,
                          (select id from app.conversations
                            where listing_id = :id and buyer_id = :uid) as conv,
                          (select id from app.orders
                            where listing_id = :id and buyer_id = :uid
                              and app.order_is_open(status)) as open_order"""
            ),
            {"id": listing_id, "uid": viewer_id},
        )
    ).one()
    return {
        "is_favorited": row.fav,
        "my_conversation_id": row.conv,
        "my_open_order_id": row.open_order,
    }


# --- public profiles ---------------------------------------------------------------

_PROFILE_SQL = """
    select p.username::text as username, p.display_name, p.avatar_path, p.bio,
           p.created_at, loc.id as city_id, loc.slug as city_slug, loc.city as city_name,
           (select count(*) from app.listings l
             where l.seller_id = p.id and l.status = 'active'
               and l.moderation = 'ok') as active_count,
           app.follower_count(p.id) as follower_count,
           rs.average as rating_average, rs.total as rating_count,
           p.restricted_at is not null as restricted
    from app.profiles p
    cross join lateral app.rating_summary(p.id) rs
    left join app.locations loc on loc.id = p.city_id
    where p.username = :username
"""


async def public_profile(db: AsyncConnection, username: str, urls: Urls) -> PublicProfile | None:
    row = (await db.execute(text(_PROFILE_SQL), {"username": username})).mappings().first()
    if row is None:
        return None
    city = (
        CityRef(id=row["city_id"], slug=row["city_slug"], name=row["city_name"])
        if row["city_slug"]
        else None
    )
    return PublicProfile(
        username=row["username"],
        display_name=row["display_name"],
        avatar_url=urls.avatar(row["avatar_path"]),
        bio=row["bio"],
        city=city,
        joined_at=row["created_at"],
        active_listing_count=row["active_count"],
        follower_count=row["follower_count"],
        rating_average=float(row["rating_average"]) if row["rating_average"] is not None else None,
        rating_count=row["rating_count"],
        restricted=row["restricted"],
    )
