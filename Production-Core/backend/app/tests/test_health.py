"""/health stays 200 (hosts restart a service whose health check fails) but says honestly whether the database answers."""
import pytest
from fastapi.testclient import TestClient

from backend.app.services import database


@pytest.fixture
def client(monkeypatch):
    from backend.app import main
    monkeypatch.setattr(main, "_db_probe", {"at": 0.0, "state": None})        # no cached answer from another test
    return TestClient(main.app)


def test_health_reports_database_not_configured(client, monkeypatch):
    monkeypatch.setattr(database.db, "pool", None)
    r = client.get("/api/v1/health")
    assert r.status_code == 200 and r.json()["status"] == "ok" and r.json()["database"] == "not_configured"


def test_health_reports_a_database_that_does_not_answer(client, monkeypatch):
    async def boom(*_a, **_k):
        raise RuntimeError("down")
    monkeypatch.setattr(database.db, "pool", object())
    monkeypatch.setattr(database.db, "fetch_one", boom)
    r = client.get("/api/v1/health")
    assert r.status_code == 200 and r.json()["database"] == "down"


def test_health_reports_a_database_that_answers(client, monkeypatch):
    async def ok(*_a, **_k):
        return {"ok": 1}
    monkeypatch.setattr(database.db, "pool", object())
    monkeypatch.setattr(database.db, "fetch_one", ok)
    assert client.get("/api/v1/health").json()["database"] == "up"
