"""Old operational data is deleted on a schedule the app runs itself: request logs 90 days, code submissions 180, content gaps 90."""
import asyncio

from fastapi.testclient import TestClient

from backend.app.api.v1 import admin
from backend.app.services import retention


class FakeDb:
    def __init__(self, fail=False):
        self.pool, self.calls, self.fail = object(), [], fail

    async def execute(self, sql, params=()):
        if self.fail:
            raise RuntimeError("database blip")
        self.calls.append((sql, params))
        return 3


def test_retention_windows_are_the_documented_ones():
    assert retention.RETENTION_DAYS == {"rag_requests": 90, "code_submissions": 180, "content_gaps": 90}


def test_prune_deletes_each_table_by_its_own_window():
    db = FakeDb()
    out = asyncio.run(retention.prune(db))
    assert out == {"rag_requests": 3, "code_submissions": 3, "content_gaps": 3}
    assert [(c[0].split()[2], c[1]) for c in db.calls] == [("rag_requests", (90,)), ("code_submissions", (180,)), ("content_gaps", (90,))]
    assert all("delete from" in c[0] and "created_at <" in c[0] for c in db.calls)


def test_prune_does_nothing_without_a_database():
    db = FakeDb()
    db.pool = None
    assert asyncio.run(retention.prune(db)) == {}
    assert db.calls == []


def test_a_failing_prune_never_raises_into_start_up_or_the_loop():
    assert asyncio.run(retention.safe_prune(FakeDb(fail=True))) == {}


def test_the_loop_prunes_again_and_again_until_cancelled():
    db = FakeDb()

    async def go():
        task = asyncio.create_task(retention.retention_loop(db, interval_s=0.01))
        await asyncio.sleep(0.08)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    asyncio.run(go())
    assert len(db.calls) >= 6                                         # at least two rounds of three deletes


def test_the_app_prunes_at_start_up_and_runs_the_loop_through_its_lifespan(monkeypatch):
    from backend.app import main
    seen = {"prune": 0, "loop_started": False, "loop_cancelled": False}

    async def safe_prune(db):
        seen["prune"] += 1
        return {}

    async def loop(db, interval_s=86400):
        seen["loop_started"] = True
        try:
            await asyncio.sleep(3600)
        except asyncio.CancelledError:
            seen["loop_cancelled"] = True
            raise

    async def connect():
        return None

    monkeypatch.setattr(main.db, "connect_to_database", connect)
    monkeypatch.setattr(main.retention, "safe_prune", safe_prune)
    monkeypatch.setattr(main.retention, "retention_loop", loop)
    with TestClient(main.app):
        pass
    assert seen == {"prune": 1, "loop_started": True, "loop_cancelled": True}


def test_an_admin_can_run_the_retention_now(monkeypatch):
    fake = FakeDb()
    monkeypatch.setattr(admin, "db", fake)
    out = asyncio.run(admin._run_tool("prune-old-data"))
    assert out["affected"] == 9
    assert "rag_requests" in out["message"] and "90" in out["message"] and "180" in out["message"]
