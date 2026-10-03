"""Regression tests for the security and reliability fixes: WebSocket isolation, agent ownership and validation,
atomic data deletion, the database-unavailable response and malformed share tokens."""
import asyncio

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.app.security import AuthError, User, get_current_user
from backend.app.services import database


@pytest.fixture
def app(monkeypatch):
    from backend.app import main
    monkeypatch.setattr(main.db, "connect_to_database", _noop)       # no real database in the offline suite
    main.app.dependency_overrides[database.get_database] = lambda: database.db
    yield main.app
    main.app.dependency_overrides.clear()


async def _noop(*_a, **_k):
    return None


def _as(app, uid):
    app.dependency_overrides[get_current_user] = lambda: User(uid=uid, email=f"{uid}@x.com")


# ---------------------------------------------------------------- TEST-001 / SEC-001
def test_websocket_connections_are_scoped_by_verified_user(app, monkeypatch):
    from backend.app.api.v1 import websocket as ws

    registered = []
    monkeypatch.setattr(ws.manager, "register", lambda sock, key: registered.append(key))

    async def auth(sock):
        msg = await sock.receive_json()
        if msg.get("token") not in ("tok-a", "tok-b"):
            await sock.close(code=4401)
            raise AuthError("bad token")
        return User(uid="user-a" if msg["token"] == "tok-a" else "user-b")
    monkeypatch.setattr(ws, "authenticate_websocket", auth)

    class Boom:                                                      # stop right after registration
        def __init__(self, *a, **k):
            raise RuntimeError("stop")
    monkeypatch.setattr(ws, "LLMService", Boom)

    with TestClient(app) as client:
        for token in ("tok-a", "tok-b"):
            with client.websocket_connect("/api/v1/ws/session/active") as sock:
                sock.send_json({"type": "auth", "token": token})
                try:
                    sock.receive_json()
                except WebSocketDisconnect:
                    pass
        # two learners on the same session id never share a key
        assert registered == ["user-a:active", "user-b:active"]

        # an unauthenticated socket is never registered, so it cannot replace anyone's connection
        with client.websocket_connect("/api/v1/ws/session/active") as sock:
            sock.send_json({"type": "auth", "token": "forged"})
            with pytest.raises(WebSocketDisconnect):
                sock.receive_json()
        assert registered == ["user-a:active", "user-b:active"]


# ---------------------------------------------------------------- TEST-002 / SEC-002 / BUG-001
class _Analyst:
    seen = []

    async def predict_performance(self, student_id, concept_id, context=None):
        self.seen.append(student_id)
        return {"student": student_id}

    async def analyze_long_term_progress(self, student_id, time_period_days=30):
        self.seen.append(student_id)
        return {"student": student_id}


@pytest.fixture
def agents(app, monkeypatch):
    from backend.app.api.v1 import agents as mod

    class Factory:
        def create_analyst_agent(self):
            return _Analyst()

    async def factory(_db):
        return Factory()
    monkeypatch.setattr(mod, "_factory", factory)
    _Analyst.seen = []
    _as(app, "me-uid")
    return TestClient(app)


def test_agents_act_on_the_caller_only(agents):
    r = agents.post("/api/v1/agents/analyst/predict-performance", json={"concept_id": "arrays"})
    assert r.status_code == 200 and r.json() == {"student": "me-uid"}
    r = agents.get("/api/v1/agents/analyst/long-term-progress/me")
    assert r.status_code == 200 and r.json() == {"student": "me-uid"}
    assert _Analyst.seen == ["me-uid", "me-uid"]


def test_agents_refuse_another_learners_id(agents):
    r = agents.post("/api/v1/agents/analyst/predict-performance", json={"concept_id": "arrays", "student_id": "victim"})
    assert r.status_code == 403
    r = agents.get("/api/v1/agents/analyst/long-term-progress/victim")
    assert r.status_code == 403
    assert _Analyst.seen == []                                       # the agent was never asked


def test_agents_reject_malformed_bodies_with_422(agents):
    assert agents.post("/api/v1/agents/assessment/generate", json={}).status_code == 422
    assert agents.post("/api/v1/agents/analyst/analyze-session", json={"session_data": {}}).status_code == 422
    assert agents.get("/api/v1/agents/analyst/long-term-progress/me?days=0").status_code == 422


# ---------------------------------------------------------------- TEST-003 / BUG-002
def test_delete_my_data_is_one_transaction_over_every_user_table(app, monkeypatch):
    from backend.app.api.v1 import learning

    calls = []

    async def execute_many(statements):
        calls.append(list(statements))
        return 0

    async def execute(*_a, **_k):
        raise AssertionError("deletion must not run statement by statement")
    monkeypatch.setattr(database.db, "execute_many", execute_many)
    monkeypatch.setattr(database.db, "execute", execute)
    _as(app, "me-uid")
    r = TestClient(app).delete("/api/v1/learning/data")
    assert r.status_code == 200
    assert len(calls) == 1                                           # a single transaction
    tables = [sql.split()[2] for sql, _ in calls[0]]
    assert tables == list(learning.USER_TABLES) and "student_profiles" in tables
    assert all(params == ("me-uid",) for _, params in calls[0])


def test_execute_many_rolls_back_on_failure():
    """The transaction helper is all-or-nothing: an error in any statement aborts the whole batch."""
    log = []

    class Tx:
        def __enter__(self): log.append("begin"); return self
        def __exit__(self, exc_type, *_): log.append("rollback" if exc_type else "commit"); return False

    class Conn:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def transaction(self): return Tx()
        def execute(self, sql, params):
            if "boom" in sql:
                raise RuntimeError("fails")
            return type("R", (), {"rowcount": 1})()

    class Pool:
        def connection(self): return Conn()

    d = database.Database()
    d.pool = Pool()
    with pytest.raises(RuntimeError):
        asyncio.run(d.execute_many([("delete a", ()), ("boom", ()), ("delete c", ())]))
    assert log == ["begin", "rollback"]


# ---------------------------------------------------------------- CODE-002
def test_no_database_is_a_clear_error_and_a_503(app, monkeypatch):
    d = database.Database()                                          # never connected
    with pytest.raises(database.DatabaseUnavailable):
        asyncio.run(d.fetch_one("select 1"))
    # code that reaches the shared database directly gets a 503, not an assertion crash
    from backend.app.api.v1 import learning

    async def broken(*_a, **_k):
        raise database.DatabaseUnavailable("down")
    monkeypatch.setattr(database.db, "execute_many", broken)
    _as(app, "me-uid")
    r = TestClient(app).delete("/api/v1/learning/data")
    assert r.status_code == 503 and "database" in r.json()["detail"].lower()
    assert learning.USER_TABLES


# ---------------------------------------------------------------- TEST-004
@pytest.mark.parametrize("token", ["short", "x" * 81])
def test_share_view_rejects_malformed_tokens(app, token):
    r = TestClient(app).get(f"/api/v1/share/view/{token}")
    assert r.status_code == 404


# ---------------------------------------------------------------- SEC-006 (hardening)
def test_coding_handles_must_match_whole_string():
    from backend.app.learning.coding_profiles import ProfileError, clean_handles as normalize
    with pytest.raises(ProfileError):
        normalize({"github": "good-name/../../evil"})
    assert normalize({"github": "  @good-name\n"}) == {"github": "good-name"}   # trimmed, then matched whole
