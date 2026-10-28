def test_health_returns_ok(client):
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_health_answers_head_for_uptime_monitors(client):
    res = client.head("/api/v1/health")
    assert res.status_code == 200
    assert res.content == b""


def test_every_response_has_a_request_id(client):
    res = client.get("/api/v1/health")
    assert len(res.headers["X-Request-ID"]) == 32


def test_client_cannot_choose_request_id(client):
    res = client.get("/api/v1/health", headers={"X-Request-ID": "attacker-value"})
    assert res.headers["X-Request-ID"] != "attacker-value"
