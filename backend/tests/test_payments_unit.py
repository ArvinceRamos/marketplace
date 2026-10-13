"""Webhook signatures, MockPay events, and test-mode settings (no database)."""

import json

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.integrations import signing
from app.integrations.mockpay import MockPay
from app.main import create_app

SECRET = b"test-secret"


def test_sign_and_verify_round_trip():
    body = b'{"id":"evt_1"}'
    signing.verify(SECRET, body, signing.sign(SECRET, body))


@pytest.mark.parametrize(
    "header",
    [None, "", "garbage", "t=abc,v1=00", "v1=00", "t=1"],
)
def test_malformed_signatures_are_rejected(header):
    with pytest.raises(signing.SignatureError):
        signing.verify(SECRET, b"{}", header)


def test_wrong_secret_or_changed_body_is_rejected():
    body = b'{"amount_centavos":100}'
    header = signing.sign(SECRET, body)
    with pytest.raises(signing.SignatureError):
        signing.verify(b"other-secret", body, header)
    with pytest.raises(signing.SignatureError):
        signing.verify(SECRET, b'{"amount_centavos":1}', header)


def test_old_signature_is_rejected():
    body = b"{}"
    header = signing.sign(SECRET, body, timestamp=1_000_000)
    signing.verify(SECRET, body, header, now=1_000_000 + signing.TOLERANCE_SECONDS)
    with pytest.raises(signing.SignatureError):
        signing.verify(SECRET, body, header, now=1_000_000 + signing.TOLERANCE_SECONDS + 1)


def test_mockpay_event_is_signed_and_unique():
    pay = MockPay("s")
    ref = pay.create_session()
    assert ref.startswith("mock_sess_") and ref != pay.create_session()
    body, header = pay.event(ref, 12_345, "success")
    pay.verify(body, header)
    event = json.loads(body)
    assert event["type"] == "payment.succeeded"
    assert event["data"] == {"session": ref, "amount_centavos": 12_345}
    assert json.loads(pay.event(ref, 1, "failure")[0])["type"] == "payment.failed"
    assert json.loads(pay.event(ref, 1, "success")[0])["id"] != event["id"]


def test_production_needs_real_webhook_secrets():
    with pytest.raises(ValidationError):
        Settings(environment="production")
    ok = Settings(
        environment="production",
        mockpay_webhook_secret="a" * 32,
        mockcourier_webhook_secret="b" * 32,
    )
    assert ok.demo_tools is False  # off unless switched on
    assert Settings(environment="local").demo_tools is True


def test_demo_routes_are_absent_when_off():
    client = TestClient(create_app(Settings(environment="test", demo_tools_enabled=False)))
    assert client.post("/api/v1/mock-pay/sessions/x/complete").status_code == 404
    assert client.get("/api/v1/mock-pay/sessions/x").status_code == 404


def test_webhook_rejects_bad_signature_before_touching_the_database():
    client = TestClient(create_app(Settings(environment="test")))
    res = client.post(
        "/api/v1/payments/webhooks/mock",
        content=b'{"id":"evt"}',
        headers={"MockPay-Signature": "t=1,v1=00"},
    )
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "bad_signature"
