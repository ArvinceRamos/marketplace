"""Profile photo upload and the seller's sold count (Phase 15)."""

import io

import pytest
from PIL import Image

from .test_api_orders import API, auth, code, orders_client

pytestmark = [pytest.mark.integration, pytest.mark.anyio]


@pytest.fixture(scope="module")
def api(stack):
    yield from orders_client(stack)


def photo(fmt="JPEG", size=(900, 600)) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, (40, 120, 90)).save(out, fmt)
    return out.getvalue()


def upload(api, user, data: bytes, name="me.jpg"):
    return api.put(
        f"{API}/me/avatar", headers=auth(user), files={"file": (name, data, "image/jpeg")}
    )


async def stored(db, user) -> list[str]:
    rows = await db.admin(
        "select name from storage.objects where bucket_id = 'avatars' and name like $1",
        f"{user.id}/%",
    )
    return [r["name"] for r in rows]


async def test_avatar_upload_replace_and_remove(api, db, users):
    user = users.create("avatar")
    assert api.put(f"{API}/me/avatar", files={"file": ("a.jpg", photo())}).status_code == 401

    res = upload(api, user, photo())
    assert res.status_code == 200, res.text
    me = res.json()
    first = me["avatar_path"]
    assert first.startswith(f"{user.id}/avatar-") and first.endswith(".webp")
    assert me["avatar_url"].endswith(f"/avatars/{first}")
    assert await stored(db, user) == [first]

    second = upload(api, user, photo("PNG")).json()["avatar_path"]
    assert second != first
    assert await stored(db, user) == [second]  # the old file is removed after commit

    name = api.get(f"{API}/me", headers=auth(user)).json()["username"]
    assert api.get(f"{API}/profiles/{name}").json()["avatar_url"].endswith(second)

    res = api.delete(f"{API}/me/avatar", headers=auth(user))
    assert (res.json()["avatar_path"], res.json()["avatar_url"]) == (None, None)
    assert await stored(db, user) == []


async def test_avatar_rejects_non_images(api, db, users):
    user = users.create("avatar")
    res = upload(api, user, b"<script>alert(1)</script>", name="x.jpg")
    assert (res.status_code, code(res)) == (422, "unsupported_image")
    assert await stored(db, user) == []
    assert api.get(f"{API}/me", headers=auth(user)).json()["avatar_path"] is None


async def test_profile_city_can_be_set_and_cleared(api, db, users):
    user = users.create("city")
    city = (await db.admin("select id from app.locations where slug = 'cebu-city'"))[0]["id"]
    res = api.patch(f"{API}/me", headers=auth(user), json={"city_id": city})
    assert res.json()["city_id"] == city
    name = res.json()["username"]
    assert api.get(f"{API}/profiles/{name}").json()["city"]["name"] == "Cebu City"
    assert (
        api.patch(f"{API}/me", headers=auth(user), json={"city_id": None}).json()["city_id"] is None
    )


async def test_public_profile_counts_sold_items(api, db, users):
    seller = users.create("seller")
    await db.make_listing(seller, "sold")
    await db.make_listing(seller, "sold")
    await db.make_listing(seller, "active")
    name = api.get(f"{API}/me", headers=auth(seller)).json()["username"]
    profile = api.get(f"{API}/profiles/{name}").json()
    assert (profile["sold_count"], profile["active_listing_count"]) == (2, 1)
