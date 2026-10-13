from fastapi import Query
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.errors import AppError
from app.main import create_app


def _app_with_test_routes():
    app = create_app(Settings(environment="test"))

    @app.get("/boom")
    async def boom():
        raise RuntimeError("secret internal detail")

    @app.get("/conflict")
    async def conflict():
        raise AppError(409, "listing_not_active", "This listing is not active.")

    @app.get("/validate")
    async def validate(page: int = Query(ge=1)):
        return {"page": page}

    return app


def test_unknown_route_uses_error_shape(client):
    res = client.get("/api/v1/does-not-exist")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "not_found"


def test_wrong_method_uses_error_shape(client):
    res = client.post("/api/v1/health")
    assert res.status_code == 405
    assert res.json()["error"]["code"] == "method_not_allowed"


def test_validation_error_lists_fields():
    res = TestClient(_app_with_test_routes()).get("/validate?page=0")
    assert res.status_code == 422
    body = res.json()["error"]
    assert body["code"] == "validation_error"
    assert "page" in body["fields"]


def test_app_error_keeps_status_and_code():
    res = TestClient(_app_with_test_routes()).get("/conflict")
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "listing_not_active"


def test_unhandled_error_hides_details():
    client = TestClient(_app_with_test_routes(), raise_server_exceptions=False)
    res = client.get("/boom")
    assert res.status_code == 500
    assert res.json()["error"]["code"] == "internal_error"
    assert "secret internal detail" not in res.text
