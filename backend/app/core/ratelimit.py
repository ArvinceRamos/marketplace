"""Per-user and per-IP rate limits (API_SPECIFICATION §3), kept in process memory.

Render free runs one instance, so one in-memory counter is enough. Counts reset
when the server restarts or sleeps; that is a documented limit, not a bug.

Sliding window: each key keeps the times of its recent hits. A request is allowed
only if every rule for the action still has room. Requests that are refused are
not counted, so waiting out `Retry-After` always works.
"""

import math
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request

from app.core.errors import AppError
from app.core.security import Claims, require_claims


@dataclass(frozen=True)
class Rule:
    limit: int
    seconds: int


MINUTE, HOUR, DAY = 60, 3600, 86400

# Actions and their limits. The key is the user ID, except "search" (client IP).
RULES: dict[str, tuple[Rule, ...]] = {
    "start_conversation": (Rule(20, HOUR),),
    "send_message": (Rule(30, MINUTE), Rule(500, DAY)),
    "make_offer": (Rule(20, HOUR),),
    "create_listing": (Rule(30, DAY),),
    "upload_images": (Rule(60, HOUR),),  # counted per photo, not per request
    "report": (Rule(10, DAY),),
    "block": (Rule(30, HOUR),),  # block and unblock share one budget
    "follow": (Rule(60, HOUR),),  # follow and unfollow share one budget
    # Search pages render on the web server, so one IP (the server's) carries many
    # visitors; public lists are also cached there. Still caps direct scraping.
    "search": (Rule(600, MINUTE),),
    "create_order": (Rule(20, HOUR),),
    "pay": (Rule(30, HOUR),),  # starting a payment and MockPay's buttons
    "withdraw": (Rule(10, DAY),),
    "order_action": (Rule(30, DAY),),  # disputes and reviews
    "webhook": (Rule(120, MINUTE),),  # per IP
    "edit_profile": (Rule(20, HOUR),),
    "edit_listing": (Rule(120, HOUR),),  # field edits, status, photo order and removal
    "favorite": (Rule(120, HOUR),),  # save and unsave share one budget
    "offer_response": (Rule(60, HOUR),),  # accept, reject, withdraw
}

# Drop empty keys every this many checks, so memory stays bounded by active users.
_SWEEP_EVERY = 1000


class RateLimiter:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._hits: dict[tuple[str, str], deque[float]] = {}
        self._checks = 0

    def hit(self, action: str, key: str, cost: int = 1) -> None:
        """Count `cost` hits for `key`, or raise 429 if any rule would be exceeded."""
        rules = RULES[action]
        now = self._clock()
        longest = max(r.seconds for r in rules)
        times = self._hits.setdefault((action, key), deque())
        while times and times[0] <= now - longest:
            times.popleft()

        wait = 0.0
        for rule in rules:
            # Hits still inside this rule's window, oldest first.
            inside = [t for t in times if t > now - rule.seconds]
            if len(inside) + cost > rule.limit:
                # Room frees up when enough of the oldest hits leave the window.
                free_at = (
                    inside[len(inside) + cost - rule.limit - 1] + rule.seconds
                    if cost <= rule.limit
                    else now + rule.seconds
                )
                wait = max(wait, free_at - now)
        if wait > 0:
            raise AppError(
                429,
                "rate_limited",
                "You're doing that too often. Please wait and try again.",
                headers={"Retry-After": str(max(1, math.ceil(wait)))},
            )
        times.extend([now] * cost)

        self._checks += 1
        if self._checks % _SWEEP_EVERY == 0:
            self._sweep(now)

    def _sweep(self, now: float) -> None:
        for (action, key), times in list(self._hits.items()):
            longest = max(r.seconds for r in RULES[action])
            while times and times[0] <= now - longest:
                times.popleft()
            if not times:
                del self._hits[(action, key)]


def client_ip(request: Request) -> str:
    """The caller's IP. Behind a proxy (Render), the proxy appends the real client IP
    to X-Forwarded-For; earlier entries come from the client and can be faked, so
    only the entry added by our own trusted proxy hops is used."""
    hops: int = request.app.state.settings.trusted_proxy_hops
    if hops > 0:
        forwarded = [
            p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()
        ]
        if len(forwarded) >= hops:
            return forwarded[-hops]
    return request.client.host if request.client else "unknown"


def _limiter(request: Request) -> RateLimiter | None:
    return request.app.state.rate_limiter


def per_user(action: str):
    """Dependency: count one `action` for the signed-in caller."""

    async def check(request: Request, claims: Annotated[Claims, Depends(require_claims)]) -> None:
        limiter = _limiter(request)
        if limiter is not None:
            limiter.hit(action, str(claims["sub"]))

    return Depends(check)


def per_ip(action: str):
    """Dependency: count one `action` for the caller's IP (public routes)."""

    async def check(request: Request) -> None:
        limiter = _limiter(request)
        if limiter is not None:
            limiter.hit(action, client_ip(request))

    return Depends(check)
