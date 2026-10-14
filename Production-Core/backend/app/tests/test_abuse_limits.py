"""Every route that spends LLM or sandbox quota is rate limited per user, the live WebSocket caps what one connection
can ask for, and oversized request bodies are refused before they are parsed."""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from backend.app.security import RateLimiter, User, get_current_user
from backend.app.services import database


@pytest.fixture
def app(monkeypatch):
    from backend.app import main
    monkeypatch.setattr(main.db, "connect_to_database", _noop)
    main.app.dependency_overrides[database.get_database] = lambda: database.db
    main.app.dependency_overrides[get_current_user] = lambda: User(uid="limit-user", email="l@x.com")
    yield main.app
    main.app.dependency_overrides.clear()


async def _noop(*_a, **_k):
    return None


def test_agent_routes_are_rate_limited_per_user(app, monkeypatch):
    from backend.app.api.v1 import agents as mod

    class Analyst:
        async def analyze_long_term_progress(self, student_id, time_period_days=30):
            return {"student": student_id}

    class Factory:
        def create_analyst_agent(self):
            return Analyst()

    async def factory(_db):
        return Factory()
    monkeypatch.setattr(mod, "_factory", factory)             # no models, no database: a fast route
    mod.agent_limiter._hits.clear()
    client = TestClient(app)
    codes = [client.get("/api/v1/agents/analyst/long-term-progress/me").status_code
             for _ in range(mod.agent_limiter.limit + 1)]
    assert codes[-1] == 429
    assert set(codes[:-1]) == {200}
    mod.agent_limiter._hits.clear()


def test_session_routes_are_rate_limited_per_user(app):
    from backend.app.api.v1 import sessions as mod
    mod.session_limiter._hits.clear()
    client = TestClient(app)
    # an invalid body (422) never reaches the route, yet the limiter runs first: the limit is what is under test
    codes = [client.post("/api/v1/sessions/start", json={}).status_code for _ in range(mod.session_limiter.limit + 1)]
    assert codes[-1] == 429
    assert set(codes[:-1]) == {422}
    mod.session_limiter._hits.clear()


def test_oversized_request_bodies_are_refused_with_413(app):
    client = TestClient(app)
    r = client.post("/api/v1/agents/knowledge/retrieve", json={"concept_query": "x" * 1_200_000})
    assert r.status_code == 413
    small = client.post("/api/v1/agents/knowledge/retrieve", json={})      # a small body gets as far as validation
    assert small.status_code == 422


def _live_socket(app, monkeypatch, limiter):
    from backend.app.api.v1 import websocket as ws

    async def auth(sock):
        await sock.receive_json()
        return User(uid="ws-user")

    class Queue:
        def __init__(self, *_a):
            pass

        async def connect(self):
            return None

    async def noop(*_a, **_k):
        return None

    monkeypatch.setattr(ws, "authenticate_websocket", auth)
    monkeypatch.setattr(ws, "LLMService", lambda: SimpleNamespace())
    monkeypatch.setattr(ws, "MessageQueue", Queue)
    monkeypatch.setattr(ws, "OrchestratorAgent", lambda *_a, **_k: SimpleNamespace())
    monkeypatch.setattr(ws, "handle_hint_request", noop)
    monkeypatch.setattr(ws, "ws_limiter", limiter)
    return TestClient(app)


def test_websocket_refuses_oversized_messages(app, monkeypatch):
    client = _live_socket(app, monkeypatch, RateLimiter(100))
    with client as c, c.websocket_connect("/api/v1/ws/session/active") as sock:
        sock.send_json({"type": "auth", "token": "t"})
        assert sock.receive_json() == {"type": "auth_ok"}
        sock.send_text('{"type":"request_hint","payload":{"x":"' + "a" * 40_000 + '"}}')
        msg = sock.receive_json()
        assert msg["type"] == "error" and "too long" in msg["message"].lower()


def test_websocket_limits_messages_per_minute(app, monkeypatch):
    client = _live_socket(app, monkeypatch, RateLimiter(2))
    with client as c, c.websocket_connect("/api/v1/ws/session/active") as sock:
        sock.send_json({"type": "auth", "token": "t"})
        assert sock.receive_json() == {"type": "auth_ok"}
        for _ in range(3):
            sock.send_json({"type": "request_hint", "payload": {}})
        msg = sock.receive_json()
        assert msg["type"] == "error" and "slow down" in msg["message"].lower()
