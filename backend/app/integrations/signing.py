"""Webhook signatures: `t=<unix time>,v1=<hex HMAC-SHA256 of "t.body">`.

The same scheme as common payment providers. The timestamp is signed too, so an
old request can't be replayed after the tolerance window; duplicates inside the
window are caught by the event ID (app.provider_events).
"""

import hashlib
import hmac
import time

TOLERANCE_SECONDS = 300


class SignatureError(Exception):
    pass


def _digest(secret: bytes, timestamp: int, body: bytes) -> str:
    return hmac.new(secret, f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()


def sign(secret: bytes, body: bytes, timestamp: int | None = None) -> str:
    t = int(time.time()) if timestamp is None else timestamp
    return f"t={t},v1={_digest(secret, t, body)}"


def verify(secret: bytes, body: bytes, header: str | None, now: float | None = None) -> None:
    """Raise SignatureError unless `header` signs `body` with `secret`, recently."""
    if not header:
        raise SignatureError("missing signature")
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    try:
        timestamp = int(parts["t"])
        given = parts["v1"]
    except (KeyError, ValueError) as exc:
        raise SignatureError("malformed signature") from exc
    current = time.time() if now is None else now
    if abs(current - timestamp) > TOLERANCE_SECONDS:
        raise SignatureError("signature too old")
    if not hmac.compare_digest(_digest(secret, timestamp, body), given):
        raise SignatureError("signature mismatch")
