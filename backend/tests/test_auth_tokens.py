"""Token verification without a database or a running Supabase.

A test key pair stands in for the project's JWKS. With no database configured,
a request that passes authentication reaches the DB layer and gets 503, which
proves the token was accepted; every rejection must be 401.
"""

import time
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.security import TokenVerifier
from app.main import create_app

SETTINGS = Settings(environment="test", supabase_url="http://auth.test", database_url=None)
ISSUER = SETTINGS.jwt_issuer
KEY = ec.generate_private_key(ec.SECP256R1())
OTHER_KEY = ec.generate_private_key(ec.SECP256R1())


class FakeVerifier(TokenVerifier):
    def _signing_key(self, token: str):
        return KEY.public_key()


def make_token(key=KEY, alg="ES256", **overrides) -> str:
    now = int(time.time())
    claims = {
        "sub": str(uuid.uuid4()),
        "iss": ISSUER,
        "aud": "authenticated",
        "role": "authenticated",
        "iat": now,
        "exp": now + 600,
        "email": "buyer@example.test",
    }
    claims.update(overrides)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, key, algorithm=alg, headers={"kid": "test"})


@pytest.fixture
def client() -> TestClient:
    app = create_app(SETTINGS)
    app.state.token_verifier = FakeVerifier(SETTINGS.jwks_url, ISSUER, "authenticated")
    return TestClient(app)


def get_me(client: TestClient, token: str | None = None, scheme: str = "Bearer"):
    headers = {"Authorization": f"{scheme} {token}"} if token else {}
    return client.get("/api/v1/me", headers=headers)


def test_valid_token_passes_authentication(client):
    res = get_me(client, make_token())
    assert res.status_code == 503  # past auth, stopped only by missing DB
    assert res.json()["error"]["code"] == "db_unavailable"


def test_missing_token_is_401(client):
    res = get_me(client)
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "not_authenticated"


@pytest.mark.parametrize(
    "token",
    [
        pytest.param(make_token(exp=int(time.time()) - 60), id="expired"),
        pytest.param(make_token(iss="https://evil.example/auth/v1"), id="wrong-issuer"),
        pytest.param(make_token(aud="other-app"), id="wrong-audience"),
        pytest.param(make_token(key=OTHER_KEY), id="wrong-signing-key"),
        pytest.param(make_token(role="anon"), id="anon-role"),
        pytest.param(make_token(role="service_role"), id="service-role"),
        pytest.param(make_token(sub=None), id="no-subject"),
        pytest.param(make_token(sub="not-a-uuid"), id="subject-not-uuid"),
        pytest.param(make_token(exp=None), id="no-expiry"),
        pytest.param(
            make_token(key="a-shared-secret-that-is-long-enough-123", alg="HS256"),
            id="hs256-shared-secret",
        ),
        pytest.param(make_token(key=None, alg="none"), id="alg-none"),
        pytest.param("not.a.jwt", id="garbage"),
    ],
)
def test_bad_tokens_are_401(client, token):
    res = get_me(client, token)
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "not_authenticated"


def test_tampered_payload_is_401(client):
    header, payload, sig = make_token().split(".")
    forged = jwt.utils.base64url_encode(
        b'{"sub":"' + str(uuid.uuid4()).encode() + b'","role":"authenticated"}'
    ).decode()
    res = get_me(client, f"{header}.{forged}.{sig}")
    assert res.status_code == 401


def test_non_bearer_scheme_is_401(client):
    res = get_me(client, make_token(), scheme="Basic")
    assert res.status_code == 401


def test_bad_token_on_public_route_is_rejected_not_ignored(client):
    res = client.get(
        "/api/v1/health/ready", headers={"Authorization": f"Bearer {make_token(aud='x')}"}
    )
    assert res.status_code == 401
