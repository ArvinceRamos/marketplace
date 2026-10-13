from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def _preflight(client, origin):
    return client.options(
        "/api/v1/health",
        headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
    )


def test_cors_allows_configured_origin(client):
    res = _preflight(client, "http://localhost:3100")
    assert res.headers.get("access-control-allow-origin") == "http://localhost:3100"


def test_cors_rejects_other_origin(client):
    res = _preflight(client, "https://evil.example")
    assert "access-control-allow-origin" not in res.headers


def test_docs_hidden_in_production():
    client = TestClient(create_app(Settings(environment="production")))
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404


def test_docs_available_locally(client):
    assert client.get("/docs").status_code == 200


def test_security_headers_on_api_responses(client):
    res = client.get("/api/v1/health")
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["x-frame-options"] == "DENY"
    assert res.headers["referrer-policy"] == "no-referrer"
    assert res.headers["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"
    # Public answers may be cached; personal ones never.
    assert "cache-control" not in res.headers
    personal = client.get("/api/v1/health", headers={"Authorization": "Bearer x"})
    assert personal.headers["cache-control"] == "no-store"


def test_security_headers_on_errors(client):
    res = client.get("/api/v1/does-not-exist")
    assert res.status_code == 404
    assert res.headers["x-content-type-options"] == "nosniff"
