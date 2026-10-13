"""In-memory rate limiter: sliding windows, Retry-After, costs, and client IPs."""

from types import SimpleNamespace

import pytest

from app.core.errors import AppError
from app.core.ratelimit import RateLimiter, client_ip


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_allows_up_to_the_limit_then_429_with_retry_after():
    clock = Clock()
    limiter = RateLimiter(clock)
    for _ in range(10):
        limiter.hit("report", "u1")
        clock.now += 60
    with pytest.raises(AppError) as info:
        limiter.hit("report", "u1")
    assert info.value.status_code == 429
    assert info.value.code == "rate_limited"
    # The first hit leaves the 24 h window 86400 s after it happened.
    assert info.value.headers == {"Retry-After": str(86400 - 600)}


def test_window_slides_and_keys_are_separate():
    clock = Clock()
    limiter = RateLimiter(clock)
    for _ in range(20):
        limiter.hit("make_offer", "u1")
    with pytest.raises(AppError):
        limiter.hit("make_offer", "u1")
    limiter.hit("make_offer", "u2")  # another user is not affected
    limiter.hit("start_conversation", "u1")  # nor another action
    clock.now += 3600
    limiter.hit("make_offer", "u1")  # the hour has passed


def test_refused_requests_are_not_counted():
    clock = Clock()
    limiter = RateLimiter(clock)
    for _ in range(30):
        limiter.hit("send_message", "u1")
    for _ in range(5):
        with pytest.raises(AppError):
            limiter.hit("send_message", "u1")
    clock.now += 60
    limiter.hit("send_message", "u1")


def test_every_rule_applies():
    clock = Clock()
    limiter = RateLimiter(clock)
    for _ in range(500):  # 30 per minute, 500 per day
        limiter.hit("send_message", "u1")
        clock.now += 2.1
    clock.now += 120  # the minute rule has room again, the daily rule does not
    with pytest.raises(AppError) as info:
        limiter.hit("send_message", "u1")
    assert int(info.value.headers["Retry-After"]) > 80_000


def test_cost_counts_each_photo():
    limiter = RateLimiter(Clock())
    limiter.hit("upload_images", "u1", cost=8)
    for _ in range(6):
        limiter.hit("upload_images", "u1", cost=8)  # 56 photos
    with pytest.raises(AppError):
        limiter.hit("upload_images", "u1", cost=8)  # would be 64
    limiter.hit("upload_images", "u1", cost=4)  # exactly 60


def test_sweep_drops_idle_keys():
    clock = Clock()
    limiter = RateLimiter(clock)
    for i in range(999):
        limiter.hit("search", f"ip{i}")
    clock.now += 61
    limiter.hit("search", "fresh")  # the 1000th check sweeps
    assert list(limiter._hits) == [("search", "fresh")]


def _request(peer: str, forwarded: str | None, hops: int):
    headers = {"x-forwarded-for": forwarded} if forwarded else {}
    return SimpleNamespace(
        app=SimpleNamespace(
            state=SimpleNamespace(settings=SimpleNamespace(trusted_proxy_hops=hops))
        ),
        headers=headers,
        client=SimpleNamespace(host=peer),
    )


def test_client_ip_ignores_forwarded_header_without_trusted_proxy():
    assert client_ip(_request("10.0.0.5", "1.2.3.4", 0)) == "10.0.0.5"


def test_client_ip_uses_entry_added_by_trusted_proxy():
    # The client faked "6.6.6.6"; the proxy appended the real address last.
    assert client_ip(_request("10.0.0.5", "6.6.6.6, 203.0.113.9", 1)) == "203.0.113.9"
    assert client_ip(_request("10.0.0.5", None, 1)) == "10.0.0.5"
