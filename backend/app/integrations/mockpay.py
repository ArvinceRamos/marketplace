"""MockPay: a simulated payment provider (TEST MODE, no real money).

It plays the provider's part of a hosted checkout: it creates a session, and when
the buyer presses "Simulate success/failure" on the MockPay page it builds the
event a real provider would send and signs it. The event then goes through the
same webhook handler as `POST /payments/webhooks/mock`, so signature checks and
idempotency are exercised exactly as for an outside call.

A real Philippine provider would be a second class with the same three methods.
"""

import json
import secrets
from typing import Literal, Protocol

from app.integrations import signing

SIGNATURE_HEADER = "MockPay-Signature"


class PaymentProvider(Protocol):
    name: str

    def create_session(self) -> str: ...

    def verify(self, body: bytes, signature: str | None) -> None: ...


class MockPay:
    name = "mock"

    def __init__(self, secret: str) -> None:
        self._secret = secret.encode()

    def create_session(self) -> str:
        return f"mock_sess_{secrets.token_urlsafe(18)}"

    def verify(self, body: bytes, signature: str | None) -> None:
        signing.verify(self._secret, body, signature)

    def event(
        self, ref: str, amount_centavos: int, outcome: Literal["success", "failure"]
    ) -> tuple[bytes, str]:
        """A signed event, as the provider would POST it to our webhook."""
        body = json.dumps(
            {
                "id": f"evt_{secrets.token_urlsafe(18)}",
                "type": "payment.succeeded" if outcome == "success" else "payment.failed",
                "data": {"session": ref, "amount_centavos": amount_centavos},
            },
            separators=(",", ":"),
        ).encode()
        return body, signing.sign(self._secret, body)
