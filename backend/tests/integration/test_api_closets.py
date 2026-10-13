"""Phase 7: sizes, deal options, and following sellers (API and RLS, allowed and denied)."""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from tests.integration.helpers import CHECK_VIOLATION, PERMISSION_DENIED, expect_error

pytestmark = [pytest.mark.integration, pytest.mark.anyio]

API = "/api/v1"


@pytest.fixture(scope="module")
def api(stack):
    settings = Settings(
        environment="test",
        supabase_url=stack.api_url,
        supabase_publishable_key=stack.publishable_key,
        database_url=stack.app_dsn.replace("postgresql://", "postgresql+asyncpg://", 1),
    )
    with TestClient(create_app(settings)) as client:
        yield client


@pytest.fixture(scope="module")
def refs(api) -> dict:
    tree = api.get(f"{API}/categories").json()
    leaves = {c["slug"]: c for p in tree for c in p["children"]}
    city = next(c for c in api.get(f"{API}/locations").json() if c["slug"] == "manila")
    return {"leaves": leaves, "city": city["id"]}


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {user.token}"}


def code(res) -> str:
    return res.json()["error"]["code"]


def fields(res) -> dict:
    return res.json()["error"].get("fields") or {}


def body(refs, slug="shoes", **changes) -> dict:
    return {
        "title": "Test item",
        "category_id": refs["leaves"][slug]["id"],
        "city_id": refs["city"],
        "price_centavos": 50000,
        "condition": "like_new",
        **changes,
    }


async def username(db, user) -> str:
    rows = await db.admin("select username::text as u from app.profiles where id = $1", user.id)
    return rows[0]["u"]


async def publish(db, listing_id) -> None:
    """Give a listing a photo row and make it active (test setup, as admin)."""
    await db.admin(
        """insert into app.listing_images (listing_id, position, full_path, thumb_path,
             width, height) values ($1, 0, 'x/y.webp', 'x/y.webp', 10, 10)""",
        listing_id,
    )
    await db.admin("update app.listings set status = 'active' where id = $1", listing_id)


# --- sizes -------------------------------------------------------------------------


def test_categories_list_their_sizes(refs):
    leaves = refs["leaves"]
    assert leaves["womens-fashion"]["sizes"][:4] == ["XXS", "XS", "S", "M"]
    assert leaves["shoes"]["sizes"][0] == "EU 35"
    assert leaves["kids-clothing"]["sizes"][0] == "0-6 months"
    assert leaves["mobile-phones"]["sizes"] == []


async def test_size_must_fit_the_category(api, db, users, refs):
    seller = users.create("sizes")
    res = api.post(f"{API}/listings", headers=auth(seller), json=body(refs, size="EU 40"))
    assert res.status_code == 201, res.text
    listing = res.json()
    assert listing["size"] == "EU 40"

    res = api.post(f"{API}/listings", headers=auth(seller), json=body(refs, size="M"))
    assert (res.status_code, fields(res)) == (422, {"size": "Pick a size from the list."})
    res = api.post(
        f"{API}/listings", headers=auth(seller), json=body(refs, "mobile-phones", size="M")
    )
    assert (res.status_code, fields(res)) == (422, {"size": "This category has no sizes."})

    # Moving a sized listing to a category without sizes needs the size cleared.
    url = f"{API}/listings/{listing['id']}"
    phones = refs["leaves"]["mobile-phones"]["id"]
    res = api.patch(url, headers=auth(seller), json={"category_id": phones})
    assert (res.status_code, fields(res)) == (422, {"size": "This category has no sizes."})
    res = api.patch(url, headers=auth(seller), json={"category_id": phones, "size": None})
    assert res.status_code == 200, res.text
    assert res.json()["size"] is None

    # The database refuses a bad size even without the API.
    await expect_error(
        db.as_user(
            seller, "update app.listings set size = 'XL' where id = $1", uuid.UUID(listing["id"])
        ),
        CHECK_VIOLATION,
    )


async def test_size_filter(api, db, users, refs):
    seller = users.create("sizefilter")
    small = api.post(f"{API}/listings", headers=auth(seller), json=body(refs, size="EU 36"))
    large = api.post(f"{API}/listings", headers=auth(seller), json=body(refs, size="EU 45"))
    for res in (small, large):
        await publish(db, res.json()["id"])
    name = await username(db, seller)

    res = api.get(f"{API}/listings", params={"category": "shoes", "size": ["EU 45", "EU 46"]})
    ids = {i["id"] for i in res.json()["items"]}
    assert large.json()["id"] in ids and small.json()["id"] not in ids
    card = next(i for i in res.json()["items"] if i["id"] == large.json()["id"])
    assert (card["size"], card["seller"]["username"]) == ("EU 45", name)

    too_many = api.get(f"{API}/listings", params={"size": [f"S{n}" for n in range(16)]})
    assert too_many.status_code == 422


# --- deal options ------------------------------------------------------------------


async def test_deal_options_rules(api, db, users, refs):
    seller = users.create("deals")

    def post(**changes):
        return api.post(
            f"{API}/listings", headers=auth(seller), json=body(refs, "mobile-phones", **changes)
        )

    res = post(meetup=True, delivery=False, payment_methods=["cod"])
    assert (res.status_code, fields(res)) == (
        422,
        {"payment_methods": "Cash on delivery needs delivery."},
    )
    res = post(meetup=True, delivery=False, couriers=["jnt"])
    assert (res.status_code, fields(res)) == (422, {"couriers": "Couriers need delivery."})
    res = post(meetup=False, delivery=True, payment_methods=["cash"])
    assert (res.status_code, fields(res)) == (
        422,
        {"payment_methods": "Cash in person needs a meetup."},
    )
    res = post(payment_methods=["paypal"])
    assert res.status_code == 422

    res = post(
        meetup=True,
        delivery=True,
        payment_methods=["gcash", "maya", "gcash", "cod"],
        couriers=["jnt", "lalamove"],
    )
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["payment_methods"] == ["gcash", "maya", "cod"]  # duplicates dropped
    assert data["couriers"] == ["jnt", "lalamove"]

    # Turning delivery off while couriers are set is refused, with the field named.
    res = api.patch(f"{API}/listings/{data['id']}", headers=auth(seller), json={"delivery": False})
    assert res.status_code == 422
    assert set(fields(res)) == {"payment_methods", "couriers"}

    # The database enforces the same rules.
    await expect_error(
        db.as_user(
            seller,
            "update app.listings set payment_methods = '{venmo}' where seller_id = $1",
            seller.id,
        ),
        CHECK_VIOLATION,
    )


async def test_deal_option_filters(api, db, users, refs):
    seller = users.create("dealfilter")
    gcash = api.post(
        f"{API}/listings",
        headers=auth(seller),
        json=body(
            refs, "mobile-phones", delivery=True, payment_methods=["gcash"], couriers=["flash"]
        ),
    ).json()
    cash = api.post(
        f"{API}/listings",
        headers=auth(seller),
        json=body(refs, "mobile-phones", payment_methods=["cash"]),
    ).json()
    for listing in (gcash, cash):
        await publish(db, listing["id"])
    name = await username(db, seller)

    def found(**params) -> set[str]:
        items = api.get(f"{API}/listings", params={"q": "Test item", **params}).json()["items"]
        return {i["id"] for i in items if i["seller"]["username"] == name}

    assert found(payment=["gcash", "maya"]) == {gcash["id"]}
    assert found(payment=["cash"]) == {cash["id"]}
    assert found(courier=["flash"]) == {gcash["id"]}
    assert found(courier=["jnt"]) == set()
    assert api.get(f"{API}/listings", params={"payment": "paypal"}).status_code == 422


# --- follows -----------------------------------------------------------------------


async def test_follow_unfollow_and_feed(api, db, users):
    fan, seller, other = users.create("fan"), users.create("followed"), users.create("other")
    followed_listing = await db.make_listing(seller, "active")
    await db.make_listing(seller, "draft")
    other_listing = await db.make_listing(other, "active")
    name = await username(db, seller)
    url = f"{API}/users/{name}/follow"

    assert api.get(url, headers=auth(fan)).json() == {"following": False}
    assert api.put(url, headers=auth(fan)).status_code == 204
    assert api.put(url, headers=auth(fan)).status_code == 204  # idempotent
    assert api.get(url, headers=auth(fan)).json() == {"following": True}
    assert api.get(f"{API}/profiles/{name}").json()["follower_count"] == 1

    following = api.get(f"{API}/me/following", headers=auth(fan)).json()
    assert [f["username"] for f in following] == [name]

    feed = api.get(f"{API}/me/feed", headers=auth(fan)).json()
    ids = [i["id"] for i in feed["items"]]
    assert ids == [str(followed_listing)]  # no drafts, no other sellers
    assert str(other_listing) not in ids

    assert api.delete(url, headers=auth(fan)).status_code == 204
    assert api.delete(url, headers=auth(fan)).status_code == 204
    assert api.get(f"{API}/me/feed", headers=auth(fan)).json()["items"] == []
    assert api.get(f"{API}/profiles/{name}").json()["follower_count"] == 0


async def test_follow_no_paths(api, db, users):
    me, seller = users.create("me"), users.create("seller")
    mine, theirs = await username(db, me), await username(db, seller)

    res = api.put(f"{API}/users/{mine}/follow", headers=auth(me))
    assert (res.status_code, code(res)) == (422, "cannot_follow_self")
    res = api.put(f"{API}/users/nobody_here_123/follow", headers=auth(me))
    assert (res.status_code, code(res)) == (404, "user_not_found")
    assert api.put(f"{API}/users/{theirs}/follow").status_code == 401
    assert api.get(f"{API}/me/feed").status_code == 401


async def test_blocking_ends_follows_both_ways(api, db, users):
    a, b = users.create("blocka"), users.create("blockb")
    name_a, name_b = await username(db, a), await username(db, b)
    assert api.put(f"{API}/users/{name_b}/follow", headers=auth(a)).status_code == 204
    assert api.put(f"{API}/users/{name_a}/follow", headers=auth(b)).status_code == 204

    assert api.put(f"{API}/users/{name_a}/block", headers=auth(b)).status_code == 204
    assert api.get(f"{API}/profiles/{name_a}").json()["follower_count"] == 0
    assert api.get(f"{API}/profiles/{name_b}").json()["follower_count"] == 0

    # Neither side can follow again while the block stands; the reason isn't shown.
    for user, target in ((a, name_b), (b, name_a)):
        res = api.put(f"{API}/users/{target}/follow", headers=auth(user))
        assert (res.status_code, code(res)) == (403, "follow_not_allowed")

    assert api.delete(f"{API}/users/{name_a}/block", headers=auth(b)).status_code == 204
    assert api.put(f"{API}/users/{name_b}/follow", headers=auth(a)).status_code == 204


async def test_follows_rls(db, users):
    a, b, c = users.create("rlsa"), users.create("rlsb"), users.create("rlsc")
    await db.as_user(
        a, "insert into app.follows (follower_id, followed_id) values ($1, $2)", a.id, b.id
    )

    # Only your own follow list is readable; others see nothing.
    assert len(await db.as_user(a, "select * from app.follows")) == 1
    assert await db.as_user(b, "select * from app.follows") == []
    await expect_error(db.as_user(None, "select * from app.follows"), PERMISSION_DENIED)

    # You can't follow on someone else's behalf, or delete their follows.
    await expect_error(
        db.as_user(
            c, "insert into app.follows (follower_id, followed_id) values ($1, $2)", b.id, a.id
        ),
        PERMISSION_DENIED,
    )
    await db.as_user(c, "delete from app.follows where follower_id = $1", a.id)
    assert len(await db.as_user(a, "select * from app.follows")) == 1
    # created_at is set by the database, not the client.
    await expect_error(
        db.as_user(
            a,
            "insert into app.follows (follower_id, followed_id, created_at) "
            "values ($1, $2, now() - interval '1 year')",
            a.id,
            c.id,
        ),
        PERMISSION_DENIED,
    )
    # The public count works for guests.
    rows = await db.as_user(None, "select app.follower_count($1) as n", b.id)
    assert rows[0]["n"] == 1
