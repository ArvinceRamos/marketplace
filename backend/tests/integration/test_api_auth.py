"""End to end: real Supabase tokens -> FastAPI -> Postgres RLS; sign-up and storage rules."""

import uuid

import httpx2
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def api(stack):
    dsn = stack.app_dsn.replace("postgresql://", "postgresql+asyncpg://", 1)
    settings = Settings(environment="test", supabase_url=stack.api_url, database_url=dsn)
    with TestClient(create_app(settings)) as client:
        yield client


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {user.token}"}


def test_ready_reaches_database(api):
    assert api.get("/api/v1/health/ready").json() == {"status": "ok"}


def test_me_returns_own_profile(api, users):
    alice = users.create("alice")
    res = api.get("/api/v1/me", headers=auth(alice))
    assert res.status_code == 200
    body = res.json()
    assert body["id"] == str(alice.id)
    assert body["email"] == alice.email
    assert body["age_confirmed"] is True


def test_me_requires_sign_in(api):
    assert api.get("/api/v1/me").status_code == 401


def test_update_me(api, users):
    alice = users.create("alice")
    name = f"alice_{uuid.uuid4().hex[:6]}"
    res = api.patch(
        "/api/v1/me", headers=auth(alice), json={"username": name.upper(), "bio": " Hello "}
    )
    assert res.status_code == 200
    assert res.json()["username"] == name  # normalised to lowercase
    assert res.json()["bio"] == "Hello"


def test_username_taken_is_409(api, users):
    alice, bob = users.create("alice"), users.create("bob")
    name = f"taken_{uuid.uuid4().hex[:6]}"
    assert api.patch("/api/v1/me", headers=auth(alice), json={"username": name}).is_success
    res = api.patch("/api/v1/me", headers=auth(bob), json={"username": name})
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "username_taken"


@pytest.mark.parametrize(
    "body",
    [
        {"id": str(uuid.uuid4())},
        {"age_confirmed": False},
        {"username": None},
        {"username": "a"},
        {"username": "bad name!"},
        {"bio": "x" * 501},
    ],
)
def test_update_me_rejects_bad_or_forbidden_fields(api, users, body):
    alice = users.create("alice")
    res = api.patch("/api/v1/me", headers=auth(alice), json=body)
    assert res.status_code == 422


def test_unknown_city_is_422(api, users):
    alice = users.create("alice")
    res = api.patch("/api/v1/me", headers=auth(alice), json={"city_id": 30000})
    assert res.status_code == 422


def test_token_of_deleted_user_cannot_read_profile(api, users, stack):
    ghost = users.create("ghost")
    httpx2.delete(
        f"{stack.api_url}/auth/v1/admin/users/{ghost.id}",
        headers={"apikey": stack.secret_key, "Authorization": f"Bearer {stack.secret_key}"},
        timeout=10,
    )
    assert api.get("/api/v1/me", headers=auth(ghost)).status_code == 404


# --- sign-up rule: 18+ confirmation ------------------------------------------


def test_email_signup_without_age_confirmation_fails(stack):
    res = httpx2.post(
        f"{stack.api_url}/auth/v1/signup",
        headers={"apikey": stack.publishable_key},
        json={"email": f"kid-{uuid.uuid4().hex[:8]}@example.test", "password": "a-long-pass-123"},
        timeout=10,
    )
    assert not res.is_success


# --- storage: own folder only -------------------------------------------------

# A tiny 1x1 WebP file.
WEBP = (
    b"RIFF\x1a\x00\x00\x00WEBPVP8L\x0d\x00\x00\x00/\x00\x00\x00"
    b"\x10\x07\x10\x11\x11\x88\x88\xfe\x07\x00"
)


def upload(stack, user, path, content_type="image/webp"):
    return httpx2.post(
        f"{stack.api_url}/storage/v1/object/listing-images/{path}",
        headers={
            "apikey": stack.publishable_key,
            "Authorization": f"Bearer {user.token}",
            "Content-Type": content_type,
        },
        content=WEBP,
        timeout=10,
    )


def test_upload_into_own_folder(stack, users):
    alice = users.create("alice")
    assert upload(stack, alice, f"{alice.id}/{uuid.uuid4()}.webp").is_success


def test_upload_into_other_users_folder_denied(stack, users):
    alice, bob = users.create("alice"), users.create("bob")
    assert not upload(stack, alice, f"{bob.id}/{uuid.uuid4()}.webp").is_success


def test_bucket_rejects_non_webp(stack, users):
    alice = users.create("alice")
    res = upload(stack, alice, f"{alice.id}/{uuid.uuid4()}.png", content_type="image/png")
    assert not res.is_success
