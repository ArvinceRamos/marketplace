"""Browsing API end to end: search, filters, detail visibility, seller profiles."""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

pytestmark = [pytest.mark.integration]


@pytest.fixture(scope="module")
def api(stack):
    dsn = stack.app_dsn.replace("postgresql://", "postgresql+asyncpg://", 1)
    settings = Settings(environment="test", supabase_url=stack.api_url, database_url=dsn)
    with TestClient(create_app(settings)) as client:
        yield client


def token() -> str:
    """A unique word so each test only matches its own listings."""
    return f"zq{uuid.uuid4().hex[:10]}"


async def make(
    db,
    seller,
    status="active",
    *,
    word,
    price=1000,
    category="mobile-phones",
    condition="like_new",
    city="quezon-city",
):
    # Set fields while still a draft, then walk to the target status (the guard
    # trigger rightly refuses edits to deleted listings).
    listing = await db.make_listing(seller, "draft")
    await db.admin(
        """update app.listings set title = $2, price_centavos = $3,
             category_id = (select id from app.categories where slug = $4),
             condition = $5::app.listing_condition,
             city_id = (select id from app.locations where slug = $6)
           where id = $1""",
        listing,
        f"Item {word}",
        price * 100,
        category,
        condition,
        city,
    )
    steps = {
        "draft": [],
        "active": ["active"],
        "paused": ["active", "paused"],
        "sold": ["active", "sold"],
        "deleted": ["deleted"],
    }[status]
    for step in steps:
        await db.admin("update app.listings set status = $2 where id = $1", listing, step)
    return listing


def ids(res) -> set[str]:
    assert res.status_code == 200, res.text
    return {item["id"] for item in res.json()["items"]}


@pytest.mark.anyio
async def test_search_shows_only_active(api, db, users):
    seller, word = users.create("seller"), token()
    active = await make(db, seller, "active", word=word)
    for status in ("draft", "paused", "sold", "deleted"):
        await make(db, seller, status, word=word)
    assert ids(api.get("/api/v1/listings", params={"q": word})) == {str(active)}


@pytest.mark.anyio
async def test_parent_category_includes_children(api, db, users):
    seller, word = users.create("seller"), token()
    phone = await make(db, seller, word=word, category="mobile-phones")
    laptop = await make(db, seller, word=word, category="laptops")
    shirt = await make(db, seller, word=word, category="mens-fashion")
    res = api.get("/api/v1/listings", params={"q": word, "category": "electronics"})
    assert ids(res) == {str(phone), str(laptop)}
    res = api.get("/api/v1/listings", params={"q": word, "category": "mens-fashion"})
    assert ids(res) == {str(shirt)}


@pytest.mark.anyio
async def test_price_condition_city_filters_and_sort(api, db, users):
    seller, word = users.create("seller"), token()
    cheap = await make(db, seller, word=word, price=500, condition="well_used")
    mid = await make(db, seller, word=word, price=1500, condition="like_new", city="manila")
    dear = await make(db, seller, word=word, price=9000, condition="like_new")
    base = {"q": word}
    assert ids(api.get("/api/v1/listings", params={**base, "min_price": 1000})) == {
        str(mid),
        str(dear),
    }
    assert ids(api.get("/api/v1/listings", params={**base, "max_price": 1500})) == {
        str(cheap),
        str(mid),
    }
    assert ids(api.get("/api/v1/listings", params={**base, "condition": "well_used"})) == {
        str(cheap)
    }
    assert ids(api.get("/api/v1/listings", params={**base, "city": "manila"})) == {str(mid)}
    res = api.get("/api/v1/listings", params={**base, "sort": "price_desc"})
    assert [i["id"] for i in res.json()["items"]] == [str(dear), str(mid), str(cheap)]


@pytest.mark.anyio
async def test_pagination(api, db, users):
    seller, word = users.create("seller"), token()
    for _ in range(3):
        await make(db, seller, word=word)
    first = api.get("/api/v1/listings", params={"q": word, "page_size": 2}).json()
    second = api.get("/api/v1/listings", params={"q": word, "page_size": 2, "page": 2}).json()
    assert (first["total"], len(first["items"]), first["has_next"]) == (3, 2, True)
    assert (len(second["items"]), second["has_next"]) == (1, False)
    assert not {i["id"] for i in first["items"]} & {i["id"] for i in second["items"]}


def test_query_matches_category_names(api):
    # Demo-independent: "Laptops & Computers" is seed reference data.
    res = api.get("/api/v1/listings", params={"q": "laptops & computers", "page_size": 48})
    assert res.status_code == 200
    # Every result must be in that category or mention the words.
    for item in res.json()["items"]:
        detail = api.get(f"/api/v1/listings/{item['id']}").json()
        text = f"{detail['title']} {detail['description']}".lower()
        assert detail["category"]["slug"] == "laptops" or "laptop" in text


@pytest.mark.anyio
async def test_category_name_search_finds_untitled_items(api, db, users):
    seller, word = users.create("seller"), token()
    laptop = await make(db, seller, word=word, category="laptops")
    phone = await make(db, seller, word=word, category="mobile-phones")
    found = ids(api.get("/api/v1/listings", params={"q": "laptop", "page_size": 48}))
    assert str(laptop) in found
    assert str(phone) not in found


def test_like_wildcards_are_literal(api):
    # "%" must not match everything.
    res = api.get("/api/v1/listings", params={"q": "%"})
    assert res.status_code == 200
    assert res.json()["total"] == 0


@pytest.mark.parametrize(
    "params",
    [
        {"page": 0},
        {"page": 51},
        {"page_size": 49},
        {"min_price": -1},
        {"min_price": 500, "max_price": 100},
        {"condition": "mint"},
        {"sort": "random"},
        {"category": "Bad Slug!"},
        {"q": "x" * 101},
    ],
)
def test_invalid_search_params_are_422(api, params):
    assert api.get("/api/v1/listings", params=params).status_code == 422


@pytest.mark.anyio
async def test_detail_visibility(api, db, users):
    seller, stranger = users.create("seller"), users.create("stranger")
    word = token()
    sold = await make(db, seller, "sold", word=word)
    draft = await make(db, seller, "draft", word=word)
    deleted = await make(db, seller, "deleted", word=word)

    res = api.get(f"/api/v1/listings/{sold}")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "sold"
    assert body["is_owner"] is False
    assert body["images"] and body["images"][0]["full_url"].startswith("http")
    assert body["parent_category"]["slug"] == "electronics"

    assert api.get(f"/api/v1/listings/{draft}").status_code == 404
    strange = {"Authorization": f"Bearer {stranger.token}"}
    assert api.get(f"/api/v1/listings/{draft}", headers=strange).status_code == 404
    own = api.get(f"/api/v1/listings/{draft}", headers={"Authorization": f"Bearer {seller.token}"})
    assert own.status_code == 200
    assert own.json()["is_owner"] is True

    assert api.get(f"/api/v1/listings/{deleted}").status_code == 404
    assert api.get(f"/api/v1/listings/{uuid.uuid4()}").status_code == 404
    assert api.get("/api/v1/listings/not-a-uuid").status_code == 422


@pytest.mark.anyio
async def test_seller_profile_and_listings(api, db, users):
    seller = users.create("seller")
    username = f"shop_{uuid.uuid4().hex[:8]}"
    await db.admin("update app.profiles set username = $2 where id = $1", seller.id, username)
    word = token()
    active = await make(db, seller, word=word)
    await make(db, seller, "paused", word=word)

    profile = api.get(f"/api/v1/profiles/{username}")
    assert profile.status_code == 200
    body = profile.json()
    assert body["active_listing_count"] == 1
    assert "email" not in body and "id" not in body  # no private fields

    assert ids(api.get(f"/api/v1/profiles/{username.upper()}/listings")) == {str(active)}
    assert api.get("/api/v1/profiles/nobody_xyz_123").status_code == 404


def test_reference_data(api):
    tree = api.get("/api/v1/categories").json()
    electronics = next(c for c in tree if c["slug"] == "electronics")
    assert any(child["slug"] == "mobile-phones" for child in electronics["children"])
    cities = api.get("/api/v1/locations").json()
    assert any(c["slug"] == "cebu-city" for c in cities)
