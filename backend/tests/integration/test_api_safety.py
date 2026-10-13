"""Reports, blocks, account deletion, and rate limits end to end (SECURITY_PLAN T5, T11, §4)."""

import io
import uuid

import httpx2
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import Settings
from app.main import create_app

pytestmark = [pytest.mark.integration, pytest.mark.anyio]

API = "/api/v1"


def _settings(stack, **extra) -> Settings:
    dsn = stack.app_dsn.replace("postgresql://", "postgresql+asyncpg://", 1)
    values = {
        "environment": "test",
        "supabase_url": stack.api_url,
        "supabase_publishable_key": stack.publishable_key,
        "supabase_secret_key": stack.secret_key,
        "database_url": dsn,
    }
    return Settings(**(values | extra))


@pytest.fixture(scope="module")
def api(stack):
    with TestClient(create_app(_settings(stack))) as client:
        yield client


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {user.token}"}


def code(res) -> str:
    return res.json()["error"]["code"]


async def username(db, user) -> str:
    return (await db.admin("select username::text as u from app.profiles where id = $1", user.id))[
        0
    ]["u"]


def report(api, user, **body):
    return api.post(f"{API}/reports", headers=auth(user), json={"reason": "scam", **body})


# --- reports -----------------------------------------------------------------------


async def test_report_listing_and_user(api, db, users):
    seller, reporter = users.create("seller"), users.create("reporter")
    listing = await db.make_listing(seller, "active")
    name = await username(db, seller)

    res = report(api, reporter, target_type="listing", listing_id=str(listing), details="  Fake  ")
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["listing"]["id"] == str(listing)
    assert (data["status"], data["details"], data["user"]) == ("open", "Fake", None)

    res = report(api, reporter, target_type="user", username=name.upper(), reason="offensive")
    assert res.status_code == 201, res.text
    assert res.json()["user"]["username"] == name

    # One open report per target.
    res = report(api, reporter, target_type="listing", listing_id=str(listing))
    assert (res.status_code, code(res)) == (409, "already_reported")
    res = report(api, reporter, target_type="user", username=name)
    assert (res.status_code, code(res)) == (409, "already_reported")

    mine = api.get(f"{API}/me/reports", headers=auth(reporter)).json()
    assert [r["target_type"] for r in mine] == ["user", "listing"]
    # Reports are private to the reporter.
    assert api.get(f"{API}/me/reports", headers=auth(seller)).json() == []


async def test_report_no_paths(api, db, users):
    seller, other = users.create("seller"), users.create("other")
    listing = await db.make_listing(seller, "active")
    draft = await db.make_listing(seller, "draft")
    name = await username(db, seller)

    res = report(api, seller, target_type="listing", listing_id=str(listing))
    assert (res.status_code, code(res)) == (422, "cannot_report_self")
    res = report(api, seller, target_type="user", username=name)
    assert (res.status_code, code(res)) == (422, "cannot_report_self")
    res = report(api, other, target_type="listing", listing_id=str(draft))
    assert (res.status_code, code(res)) == (404, "listing_not_found")
    res = report(api, other, target_type="listing", listing_id=str(uuid.uuid4()))
    assert (res.status_code, code(res)) == (404, "listing_not_found")
    res = report(api, other, target_type="user", username="no_such_user_x")
    assert (res.status_code, code(res)) == (404, "user_not_found")

    # Body rules: the matching target only, no reporter fields, known reasons, short details.
    bad_bodies = [
        {"target_type": "listing", "username": name},
        {"target_type": "user", "username": name, "listing_id": str(listing)},
        {"target_type": "user", "username": name, "reporter_id": str(other.id)},
        {"target_type": "user", "username": name, "reason": "boring"},
        {"target_type": "user", "username": name, "details": "x" * 1001},
    ]
    for bad in bad_bodies:
        res = report(api, other, **bad)
        assert res.status_code == 422, bad
    assert api.post(f"{API}/reports", json={"target_type": "user"}).status_code == 401


# --- blocks ------------------------------------------------------------------------


async def test_block_hides_chat_and_stops_messages(api, db, users):
    seller, buyer = users.create("seller"), users.create("buyer")
    listing = await db.make_listing(seller, "active")
    chat = api.post(f"{API}/listings/{listing}/conversations", headers=auth(buyer)).json()["id"]
    sent = api.post(
        f"{API}/conversations/{chat}/messages", headers=auth(buyer), json={"body": "Hi"}
    )
    assert sent.status_code == 201
    buyer_name = await username(db, buyer)

    def inbox(user):
        return [c["id"] for c in api.get(f"{API}/conversations", headers=auth(user)).json()]

    def unread(user):
        return api.get(f"{API}/me/unread-count", headers=auth(user)).json()["unread"]

    assert inbox(seller) == [chat] and unread(seller) == 1

    # Seller blocks the buyer (twice: idempotent).
    for _ in range(2):
        res = api.put(f"{API}/users/{buyer_name}/block", headers=auth(seller))
        assert res.status_code == 204
    blocks = api.get(f"{API}/me/blocks", headers=auth(seller)).json()
    assert [b["username"] for b in blocks] == [buyer_name]

    assert inbox(seller) == [] and unread(seller) == 0
    detail = api.get(f"{API}/conversations/{chat}", headers=auth(seller)).json()
    assert (detail["blocked_by_me"], detail["can_message"]) == (True, False)

    # The blocked buyer still sees the chat, can't write, and isn't told why.
    assert inbox(buyer) == [chat]
    detail = api.get(f"{API}/conversations/{chat}", headers=auth(buyer)).json()
    assert detail["can_message"] is False and detail["can_offer"] is False
    assert detail["blocked_by_me"] is False
    res = api.post(f"{API}/conversations/{chat}/messages", headers=auth(buyer), json={"body": "?"})
    assert (res.status_code, code(res)) == (403, "blocked")
    assert api.get(f"{API}/me/blocks", headers=auth(buyer)).json() == []

    # Unblock brings it back.
    for _ in range(2):
        res = api.delete(f"{API}/users/{buyer_name}/block", headers=auth(seller))
        assert res.status_code == 204
    assert inbox(seller) == [chat]
    detail = api.get(f"{API}/conversations/{chat}", headers=auth(buyer)).json()
    assert detail["can_message"] is True


async def test_block_no_paths(api, db, users):
    alice = users.create("alice")
    name = await username(db, alice)
    res = api.put(f"{API}/users/{name}/block", headers=auth(alice))
    assert (res.status_code, code(res)) == (422, "cannot_block_self")
    res = api.put(f"{API}/users/no_such_user_x/block", headers=auth(alice))
    assert (res.status_code, code(res)) == (404, "user_not_found")
    assert api.put(f"{API}/users/bad%20name!/block", headers=auth(alice)).status_code == 422
    assert api.put(f"{API}/users/{name}/block").status_code == 401


# --- account deletion --------------------------------------------------------------


def _jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), (200, 30, 30)).save(buf, "JPEG")
    return buf.getvalue()


async def _files(db, user) -> list[str]:
    rows = await db.admin(
        "select bucket_id || ':' || name as f from storage.objects "
        "where split_part(name, '/', 1) = $1",
        str(user.id),
    )
    return [r["f"] for r in rows]


async def test_delete_account_removes_files_then_user(api, db, users, stack):
    seller = users.create("seller")
    name = await username(db, seller)

    # A listing with a real photo (via the API), plus an avatar file in Storage.
    refs = {
        "cat": (await db.admin("select id from app.categories where slug = 'mobile-phones'"))[0][
            "id"
        ],
        "city": (await db.admin("select id from app.locations where slug = 'manila'"))[0]["id"],
    }
    created = api.post(
        f"{API}/listings",
        headers=auth(seller),
        json={
            "title": "Phone to delete",
            "category_id": refs["cat"],
            "city_id": refs["city"],
            "price_centavos": 100000,
            "condition": "well_used",
            "meetup": True,
            "delivery": False,
        },
    )
    assert created.status_code == 201, created.text
    listing = created.json()["id"]
    up = api.post(
        f"{API}/listings/{listing}/images",
        headers=auth(seller),
        files=[("files", ("a.jpg", _jpeg(), "image/jpeg"))],
    )
    assert up.status_code == 200, up.text
    avatar = httpx2.post(
        f"{stack.api_url}/storage/v1/object/avatars/{seller.id}/avatar.webp",
        headers={
            "apikey": stack.publishable_key,
            "Authorization": f"Bearer {seller.token}",
            "Content-Type": "image/webp",
        },
        content=b"RIFF\x00\x00\x00\x00WEBP",
        timeout=10,
    )
    assert avatar.is_success, avatar.text
    assert len(await _files(db, seller)) == 3  # full + thumb + avatar

    # Wrong confirmation: nothing happens.
    res = api.request("DELETE", f"{API}/me", headers=auth(seller), json={"confirm_username": "x"})
    assert (res.status_code, code(res)) == (422, "username_mismatch")
    assert len(await _files(db, seller)) == 3
    res = api.request("DELETE", f"{API}/me", headers=auth(seller), json={})
    assert res.status_code == 422
    assert api.request("DELETE", f"{API}/me", json={"confirm_username": name}).status_code == 401

    # Right confirmation ("@name" and any case are fine).
    res = api.request(
        "DELETE", f"{API}/me", headers=auth(seller), json={"confirm_username": f"@{name.upper()}"}
    )
    assert res.status_code == 204, res.text
    assert await _files(db, seller) == []
    assert await db.admin("select 1 from auth.users where id = $1", seller.id) == []
    assert await db.admin("select 1 from app.listings where id = $1", uuid.UUID(listing)) == []
    # The token still verifies until it expires, but there is no profile behind it.
    assert api.get(f"{API}/me", headers=auth(seller)).status_code == 404


async def test_delete_account_without_secret_key_removes_nothing(db, users, stack):
    user = users.create("keeper")
    name = await username(db, user)
    put = httpx2.post(
        f"{stack.api_url}/storage/v1/object/avatars/{user.id}/a.webp",
        headers={
            "apikey": stack.publishable_key,
            "Authorization": f"Bearer {user.token}",
            "Content-Type": "image/webp",
        },
        content=b"RIFF\x00\x00\x00\x00WEBP",
        timeout=10,
    )
    assert put.is_success
    with TestClient(create_app(_settings(stack, supabase_secret_key=None))) as client:
        res = client.request(
            "DELETE", f"{API}/me", headers=auth(user), json={"confirm_username": name}
        )
    assert (res.status_code, code(res)) == (503, "account_deletion_unavailable")
    assert len(await _files(db, user)) == 1
    assert await db.admin("select 1 from auth.users where id = $1", user.id) != []


# --- rate limits -------------------------------------------------------------------


async def test_reports_are_rate_limited(api, db, users):
    reporter = users.create("busy")
    targets = [users.create(f"t{i}") for i in range(11)]
    names = [await username(db, t) for t in targets]
    for name in names[:10]:
        assert report(api, reporter, target_type="user", username=name).status_code == 201
    res = report(api, reporter, target_type="user", username=names[10])
    assert (res.status_code, code(res)) == (429, "rate_limited")
    assert int(res.headers["Retry-After"]) > 0
    # Another user has their own budget.
    assert report(api, targets[0], target_type="user", username=names[1]).status_code == 201
