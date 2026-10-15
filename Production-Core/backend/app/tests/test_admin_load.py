"""The admin console must not re-read every learner profile on each page view, must say when its statistics are capped, and
the in-memory metrics must never hold answer text."""
import asyncio

from backend.app.api.v1 import admin
from backend.app.rag.observability import Metrics


def test_profiles_are_cached_for_a_minute(monkeypatch):
    calls = []

    async def rows(sql, params=()):
        calls.append(sql)
        return [{"data": {"patterns": {}}}]
    monkeypatch.setattr(admin, "_rows", rows)
    monkeypatch.setattr(admin, "_profile_cache", {"at": 0.0, "rows": [], "total": 0})
    clock = {"t": 1000.0}
    monkeypatch.setattr(admin.time, "monotonic", lambda: clock["t"])

    async def go():
        await admin._profiles()
        await admin._profiles()
        clock["t"] += 30
        await admin._profiles()                       # still inside the minute
        n = len(calls)
        clock["t"] += 31
        await admin._profiles()                       # expired: read again
        return n, len(calls)
    within, after = asyncio.run(go())
    assert within == 2 and after == 4                 # (profiles + count) once, then once more after the minute


def test_a_capped_load_says_so(monkeypatch):
    async def rows(sql, params=()):
        if "count(*)" in sql:
            return [{"n": 7200}]
        return [{"data": {}}] * 3
    monkeypatch.setattr(admin, "_rows", rows)
    monkeypatch.setattr(admin, "_profile_cache", {"at": 0.0, "rows": [], "total": 0})
    monkeypatch.setattr(admin, "MAX_PROFILES", 3)
    cov = asyncio.run(_coverage())
    assert cov == {"profiles_used": 3, "profiles_total": 7200, "capped": True}


async def _coverage():
    await admin._profiles()
    return admin.profile_coverage()


def test_metrics_keep_no_answer_text_or_learner_data():
    m = Metrics()
    m.record({"request_id": "r1", "total_ms": 5.0, "status": "grounded", "stages": [],
              "claim_checks": [{"text": "Binary search halves the space [1]."}], "personalization": {"level": "advanced"}})
    row = m.snapshot()["recent"][0]
    assert "claim_checks" not in row and "personalization" not in row and row["request_id"] == "r1"
