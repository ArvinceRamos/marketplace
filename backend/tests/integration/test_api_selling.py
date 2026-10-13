"""Seller flows end to end: real tokens -> FastAPI -> RLS + triggers -> real Storage.

Covers ownership (T2, T15), uploads (T6-T8), status rules, and photo rules.
"""

import io
import uuid

import httpx2
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import Settings
from app.main import create_app
from tests.integration.helpers import CHECK_VIOLATION, expect_error

pytestmark = [pytest.mark.integration]


@pytest.fixture(scope="module")
def api(stack):
    dsn = stack.app_dsn.replace("postgresql://", "postgresql+asyncpg://", 1)
    settings = Settings(
        environment="test",
        supabase_url=stack.api_url,
        supabase_publishable_key=stack.publishable_key,
        database_url=dsn,
    )
    with TestClient(create_app(settings)) as client:
        yield client


@pytest.fixture(scope="module")
def refs(api) -> dict[str, int]:
    tree = api.get("/api/v1/categories").json()
    electronics = next(c for c in tree if c["slug"] == "electronics")
    phones = next(c for c in electronics["children"] if c["slug"] == "mobile-phones")
    city = next(c for c in api.get("/api/v1/locations").json() if c["slug"] == "manila")
    return {"parent": electronics["id"], "phones": phones["id"], "city": city["id"]}


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {user.token}"}


def body(refs, **changes) -> dict:
    return {
        "title": "Used phone, good battery",
        "description": "Works well.",
        "category_id": refs["phones"],
        "city_id": refs["city"],
        "price_centavos": 550000,
        "condition": "well_used",
        "meetup": True,
        "delivery": False,
        "deal_note": "SM Manila, weekends",
        **changes,
    }


def jpeg(color=(30, 60, 200), *, gps=False) -> bytes:
    exif = Image.Exif()
    if gps:
        exif[0x8825] = {1: "N", 2: (14.0, 35.0, 0.0), 3: "E", 4: (121.0, 0.0, 0.0)}
    out = io.BytesIO()
    Image.new("RGB", (900, 700), color).save(out, "JPEG", exif=exif.tobytes())
    return out.getvalue()


def files(*blobs: bytes) -> list:
    return [("files", (f"photo{i}.jpg", b, "image/jpeg")) for i, b in enumerate(blobs)]


def create(api, user, refs, **changes) -> dict:
    res = api.post("/api/v1/listings", headers=auth(user), json=body(refs, **changes))
    assert res.status_code == 201, res.text
    return res.json()


def upload(api, user, listing_id, *blobs):
    return api.post(
        f"/api/v1/listings/{listing_id}/images", headers=auth(user), files=files(*blobs)
    )


def set_status(api, user, listing_id, status):
    return api.post(
        f"/api/v1/listings/{listing_id}/status", headers=auth(user), json={"status": status}
    )


def code(res) -> str:
    return res.json()["error"]["code"]


# --- create and edit -------------------------------------------------------------------


def test_create_draft_is_owned_by_caller(api, users, refs):
    seller = users.create("seller")
    listing = create(api, seller, refs)
    assert listing["status"] == "draft"
    assert listing["is_owner"] is True
    assert listing["category"]["id"] == refs["phones"]
    assert listing["city"]["id"] == refs["city"]
    assert listing["deal_note"] == "SM Manila, weekends"
    # Not public while a draft.
    assert api.get(f"/api/v1/listings/{listing['id']}").status_code == 404


def test_create_rejects_owner_and_status_fields(api, users, refs):
    seller, other = users.create("seller"), users.create("other")
    for extra in ({"seller_id": str(other.id)}, {"status": "active"}, {"published_at": "2026"}):
        res = api.post("/api/v1/listings", headers=auth(seller), json=body(refs, **extra))
        assert res.status_code == 422, extra


def test_create_requires_sign_in(api, refs):
    assert api.post("/api/v1/listings", json=body(refs)).status_code == 401


@pytest.mark.parametrize(
    ("changes", "field"),
    [
        ({"title": "ab"}, "title"),
        ({"title": "x" * 81}, "title"),
        ({"price_centavos": -1}, "price_centavos"),
        ({"price_centavos": 10_000_000_001}, "price_centavos"),
        ({"description": "x" * 5001}, "description"),
        ({"deal_note": "x" * 201}, "deal_note"),
        ({"condition": "mint"}, "condition"),
    ],
)
def test_create_validation(api, users, refs, changes, field):
    seller = users.create("seller")
    res = api.post("/api/v1/listings", headers=auth(seller), json=body(refs, **changes))
    assert res.status_code == 422
    assert field in res.json()["error"]["fields"]


def test_create_needs_leaf_category_real_city_and_a_deal_method(api, users, refs):
    seller = users.create("seller")
    res = api.post(
        "/api/v1/listings", headers=auth(seller), json=body(refs, category_id=refs["parent"])
    )
    assert res.status_code == 422
    assert res.json()["error"]["fields"] == {"category_id": "Choose a subcategory."}
    res = api.post("/api/v1/listings", headers=auth(seller), json=body(refs, city_id=32000))
    assert res.json()["error"]["fields"] == {"city_id": "Choose a city."}
    res = api.post(
        "/api/v1/listings", headers=auth(seller), json=body(refs, meetup=False, delivery=False)
    )
    assert res.status_code == 422


def test_edit_own_listing(api, users, refs):
    seller = users.create("seller")
    listing = create(api, seller, refs)
    res = api.patch(
        f"/api/v1/listings/{listing['id']}",
        headers=auth(seller),
        json={"title": "  New title  ", "price_centavos": 1000, "deal_note": None},
    )
    assert res.status_code == 200, res.text
    assert (res.json()["title"], res.json()["price_centavos"]) == ("New title", 1000)
    assert res.json()["deal_note"] is None
    # Nulls are only allowed for deal_note; switching off both deal methods is refused.
    url = f"/api/v1/listings/{listing['id']}"
    assert api.patch(url, headers=auth(seller), json={"title": None}).status_code == 422
    res = api.patch(url, headers=auth(seller), json={"meetup": False})
    assert res.status_code == 422
    assert "meetup" in res.json()["error"]["fields"]


def test_strangers_cannot_touch_a_listing(api, users, refs):
    seller, stranger = users.create("seller"), users.create("stranger")
    lid = create(api, seller, refs)["id"]
    upload(api, seller, lid, jpeg())
    assert set_status(api, seller, lid, "active").status_code == 200
    image_id = api.get(f"/api/v1/listings/{lid}").json()["images"][0]["id"]

    s = auth(stranger)
    attempts = [
        api.patch(f"/api/v1/listings/{lid}", headers=s, json={"title": "Mine now"}),
        api.post(f"/api/v1/listings/{lid}/status", headers=s, json={"status": "paused"}),
        api.delete(f"/api/v1/listings/{lid}", headers=s),
        api.post(f"/api/v1/listings/{lid}/images", headers=s, files=files(jpeg())),
        api.patch(
            f"/api/v1/listings/{lid}/images/order", headers=s, json={"image_ids": [image_id]}
        ),
        api.delete(f"/api/v1/listings/{lid}/images/{image_id}", headers=s),
    ]
    assert [r.status_code for r in attempts] == [404] * len(attempts)
    after = api.get(f"/api/v1/listings/{lid}").json()
    assert (after["title"], after["status"], len(after["images"])) == (
        "Used phone, good battery",
        "active",
        1,
    )
    # Guests are asked to sign in.
    assert api.delete(f"/api/v1/listings/{lid}").status_code == 401


# --- status --------------------------------------------------------------------------


def test_status_lifecycle(api, users, refs):
    seller = users.create("seller")
    lid = create(api, seller, refs)["id"]
    res = set_status(api, seller, lid, "active")
    assert (res.status_code, code(res)) == (409, "listing_needs_photo")

    assert upload(api, seller, lid, jpeg()).status_code == 200
    steps = [("active", 200), ("paused", 200), ("active", 200), ("sold", 200), ("active", 409)]
    for status, expected in steps:
        res = set_status(api, seller, lid, status)
        assert res.status_code == expected, (status, res.text)
    assert code(res) == "invalid_status_change"
    assert set_status(api, seller, lid, "paused").json()["status"] == "paused"  # undo sold
    assert set_status(api, seller, lid, "paused").status_code == 200  # repeat is harmless
    res = set_status(api, seller, lid, "draft")
    assert res.status_code == 422  # back to draft is not an option


def test_published_listing_appears_in_search(api, users, refs):
    seller, word = users.create("seller"), f"zq{uuid.uuid4().hex[:10]}"
    lid = create(api, seller, refs, title=f"Phone {word}")["id"]
    upload(api, seller, lid, jpeg())
    search = {"q": word}
    assert api.get("/api/v1/listings", params=search).json()["total"] == 0
    set_status(api, seller, lid, "active")
    items = api.get("/api/v1/listings", params=search).json()["items"]
    assert [i["id"] for i in items] == [lid]
    assert items[0]["cover_thumb_url"].endswith("-thumb.webp")


def test_my_listings_by_status(api, users, refs):
    seller, other = users.create("seller"), users.create("other")
    draft = create(api, seller, refs)["id"]
    live = create(api, seller, refs)["id"]
    upload(api, seller, live, jpeg())
    set_status(api, seller, live, "active")
    create(api, other, refs)

    def mine(status):
        res = api.get("/api/v1/me/listings", headers=auth(seller), params={"status": status})
        assert res.status_code == 200
        return [i["id"] for i in res.json()["items"]]

    assert mine("draft") == [draft]
    assert mine("active") == [live]
    assert mine("sold") == []
    assert api.get("/api/v1/me/listings").status_code == 401
    bad = api.get("/api/v1/me/listings", headers=auth(seller), params={"status": "deleted"})
    assert bad.status_code == 422


# --- delete --------------------------------------------------------------------------


def test_delete_listing_removes_photos(api, users, refs, stack):
    seller = users.create("seller")
    lid = create(api, seller, refs)["id"]
    detail = upload(api, seller, lid, jpeg(), jpeg((0, 0, 0))).json()
    set_status(api, seller, lid, "active")
    urls = [u for img in detail["images"] for u in (img["full_url"], img["thumb_url"])]
    assert all(httpx2.get(u).status_code == 200 for u in urls)

    assert api.delete(f"/api/v1/listings/{lid}", headers=auth(seller)).status_code == 204
    assert api.get(f"/api/v1/listings/{lid}", headers=auth(seller)).status_code == 404
    assert all(httpx2.get(u).status_code in (400, 404) for u in urls)
    # Already deleted: further changes are 404, not errors.
    assert api.delete(f"/api/v1/listings/{lid}", headers=auth(seller)).status_code == 404
    res = api.patch(f"/api/v1/listings/{lid}", headers=auth(seller), json={"title": "Back"})
    assert res.status_code == 404


# --- photos ---------------------------------------------------------------------------


def test_upload_strips_location_and_stores_webp(api, users, refs):
    seller = users.create("seller")
    lid = create(api, seller, refs)["id"]
    res = upload(api, seller, lid, jpeg(gps=True))
    assert res.status_code == 200, res.text
    image = res.json()["images"][0]
    assert image["full_url"].startswith(f"{api.app.state.settings.public_storage_url}/")
    assert f"/{seller.id}/{lid}/" in image["full_url"]  # the seller's own folder
    stored = httpx2.get(image["full_url"])
    assert stored.headers["content-type"] == "image/webp"
    img = Image.open(io.BytesIO(stored.content))
    assert img.format == "WEBP" and "exif" not in img.info
    assert (image["width"], image["height"]) == img.size


@pytest.mark.anyio
async def test_bad_uploads_store_nothing(api, users, refs, db):
    seller = users.create("seller")
    lid = create(api, seller, refs)["id"]
    fake = [("files", ("photo.jpg", b"<?php echo 'hi'; ?>", "image/jpeg"))]
    res = api.post(f"/api/v1/listings/{lid}/images", headers=auth(seller), files=fake)
    assert (res.status_code, code(res)) == (422, "unsupported_image")
    # A good file next to a bad one: nothing is stored.
    mixed = files(jpeg()) + fake
    res = api.post(f"/api/v1/listings/{lid}/images", headers=auth(seller), files=mixed)
    assert res.status_code == 422
    stored = await db.admin("select 1 from storage.objects where name like $1", f"{seller.id}/%")
    assert stored == []
    assert api.get(f"/api/v1/listings/{lid}", headers=auth(seller)).json()["images"] == []


def test_too_large_uploads_are_413(api, users, refs):
    seller = users.create("seller")
    lid = create(api, seller, refs)["id"]
    big = [("files", ("big.jpg", b"\xff\xd8" + b"0" * (9 * 1024 * 1024), "image/jpeg"))]
    res = api.post(f"/api/v1/listings/{lid}/images", headers=auth(seller), files=big)
    assert (res.status_code, code(res)) == (413, "file_too_large")
    # Whole request over the limit: refused from the header, before the body is read.
    huge = [("files", (f"{i}.jpg", b"0" * (8 * 1024 * 1024), "image/jpeg")) for i in range(9)]
    res = api.post(f"/api/v1/listings/{lid}/images", headers=auth(seller), files=huge)
    assert (res.status_code, code(res)) == (413, "payload_too_large")
    # JSON bodies have a small limit too.
    res = api.patch(
        f"/api/v1/listings/{lid}", headers=auth(seller), json={"description": "x" * 70_000}
    )
    assert res.status_code == 413
    # No Content-Length (chunked): counted while streaming and refused.
    chunks = (b"x" * 16_384 for _ in range(10))
    res = api.patch(
        f"/api/v1/listings/{lid}",
        headers={**auth(seller), "Content-Type": "application/json"},
        content=chunks,
    )
    assert res.status_code in (400, 413)
    assert api.get(f"/api/v1/listings/{lid}", headers=auth(seller)).json()["description"] == (
        "Works well."
    )


def test_photo_limit_is_eight(api, users, refs):
    seller = users.create("seller")
    lid = create(api, seller, refs)["id"]
    res = upload(api, seller, lid, *[jpeg((i * 30, 0, 0)) for i in range(7)])
    assert len(res.json()["images"]) == 7
    res = upload(api, seller, lid, jpeg(), jpeg())
    assert (res.status_code, code(res)) == (409, "too_many_photos")
    assert len(upload(api, seller, lid, jpeg()).json()["images"]) == 8
    assert upload(api, seller, lid, jpeg()).status_code == 409


def test_reorder_and_delete_photos(api, users, refs):
    seller = users.create("seller")
    lid = create(api, seller, refs)["id"]
    images = upload(api, seller, lid, jpeg(), jpeg((0, 0, 0)), jpeg((0, 200, 0))).json()["images"]
    a, b, c = (i["id"] for i in images)
    url = f"/api/v1/listings/{lid}/images/order"

    res = api.patch(url, headers=auth(seller), json={"image_ids": [c, a, b]})
    assert [i["id"] for i in res.json()["images"]] == [c, a, b]
    assert api.patch(url, headers=auth(seller), json={"image_ids": [c, a]}).status_code == 422
    assert api.patch(url, headers=auth(seller), json={"image_ids": [c, a, a]}).status_code == 422

    res = api.delete(f"/api/v1/listings/{lid}/images/{c}", headers=auth(seller))
    assert res.status_code == 200
    remaining = res.json()["images"]
    assert [(i["id"], i["position"]) for i in remaining] == [(a, 0), (b, 1)]  # a is the cover
    assert httpx2.get(images[2]["full_url"]).status_code in (400, 404)
    missing = api.delete(f"/api/v1/listings/{lid}/images/{c}", headers=auth(seller))
    assert (missing.status_code, code(missing)) == (404, "image_not_found")


@pytest.mark.anyio
async def test_live_listing_keeps_its_last_photo(api, users, refs, db):
    seller = users.create("seller")
    lid = create(api, seller, refs)["id"]
    image = upload(api, seller, lid, jpeg()).json()["images"][0]["id"]
    set_status(api, seller, lid, "active")

    res = api.delete(f"/api/v1/listings/{lid}/images/{image}", headers=auth(seller))
    assert (res.status_code, code(res)) == (409, "last_photo")
    # Second wall: the database refuses it too, even without the API check.
    await expect_error(
        db.as_user(seller, "delete from app.listing_images where id = $1", uuid.UUID(image)),
        CHECK_VIOLATION,
    )
    # Paused listings may drop their last photo; resuming then needs a new one.
    set_status(api, seller, lid, "paused")
    assert api.delete(f"/api/v1/listings/{lid}/images/{image}", headers=auth(seller)).is_success
    assert code(set_status(api, seller, lid, "active")) == "listing_needs_photo"
