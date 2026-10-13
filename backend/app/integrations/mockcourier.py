"""MockCourier: a simulated courier (TEST MODE, no parcel moves).

When someone presses "Advance tracking (demo)", it builds the tracking event a
real courier would push and signs it. The event goes through the same handler as
`POST /shipping/webhooks/mock`, so signatures and idempotency are exercised.
"""

import json
import secrets

from app.integrations import signing

SIGNATURE_HEADER = "MockCourier-Signature"

# Tracking steps in order (app.shipment_status).
STEPS = ("label_created", "picked_up", "in_transit", "out_for_delivery", "delivered")


def next_step(current: str) -> str | None:
    i = STEPS.index(current)
    return STEPS[i + 1] if i + 1 < len(STEPS) else None


class MockCourier:
    name = "mockcourier"

    def __init__(self, secret: str) -> None:
        self._secret = secret.encode()

    def verify(self, body: bytes, signature: str | None) -> None:
        signing.verify(self._secret, body, signature)

    def event(self, tracking_number: str, status: str) -> tuple[bytes, str]:
        body = json.dumps(
            {
                "id": f"trk_{secrets.token_urlsafe(18)}",
                "type": "shipment.updated",
                "data": {"tracking_number": tracking_number, "status": status},
            },
            separators=(",", ":"),
        ).encode()
        return body, signing.sign(self._secret, body)
