"""Two requests from the same learner arrive together. The API builds a new LearningService per request, so the
per-user lock must be shared by every instance, and an optional cross-process lock (Postgres advisory) must be taken."""
import asyncio
import contextlib

from backend.app.learning.service import LearningService, MemoryQuizRepo
from backend.app.models.student_profile import StudentProfile
from backend.app.services.database import Database


class CopyingProfiles:
    """Like Postgres: every read returns a fresh copy, and reads and writes take a moment."""

    def __init__(self):
        self.p = {}

    async def get_profile_by_user_id(self, uid):
        await asyncio.sleep(0.01)
        cur = self.p.get(uid)
        return StudentProfile(**cur.model_dump(mode="json")) if cur else None

    async def create_profile_safe(self, uid):
        self.p.setdefault(uid, StudentProfile(user_id=uid))
        return await self.get_profile_by_user_id(uid)

    async def update_profile(self, uid, updates):
        await asyncio.sleep(0.01)
        cur = self.p[uid].model_dump(mode="json")
        cur.update(updates)
        self.p[uid] = StudentProfile(**cur)
        return True


async def test_concurrent_answers_from_different_service_instances_are_both_recorded(kb):
    store, _ = kb
    profiles, quizzes = CopyingProfiles(), MemoryQuizRepo()
    make = lambda: LearningService(profiles, quizzes, store, llm=None)          # one per request, as in the API
    q1 = await make().create_quiz("u1", "binary-search")
    q2 = await make().create_quiz("u1", "binary-search")
    await asyncio.gather(make().answer("u1", q1["quiz_id"], 0), make().answer("u1", q2["quiz_id"], 0))
    attempts = profiles.p["u1"].patterns.get("attempts", [])
    assert len(attempts) == 2                       # one was silently lost before the lock was shared


async def test_the_cross_process_advisory_lock_is_taken_around_the_block(kb):
    store, _ = kb
    events = []

    class LockingProfiles(CopyingProfiles):
        @contextlib.asynccontextmanager
        async def advisory_lock(self, uid):
            events.append(("lock", uid))
            try:
                yield
            finally:
                events.append(("unlock", uid))

    profiles = LockingProfiles()
    svc = LearningService(profiles, MemoryQuizRepo(), store, llm=None)
    q = await svc.create_quiz("u2", "binary-search")
    await svc.answer("u2", q["quiz_id"], 0)
    assert events == [("lock", "u2"), ("unlock", "u2")]


class FakeConn:
    def __init__(self, log):
        self.log = log

    def execute(self, sql, params=()):
        self.log.append(("execute", sql.split("(")[0].strip(), params))

    def rollback(self):
        self.log.append(("rollback",))


class FakePool:
    def __init__(self, log):
        self.log, self.conn = log, FakeConn(log)

    def getconn(self):
        self.log.append(("getconn",))
        return self.conn

    def putconn(self, conn):
        self.log.append(("putconn",))


async def test_database_advisory_lock_holds_a_transaction_and_always_releases():
    log, db = [], Database()
    db.lock_pool = FakePool(log)
    try:
        async with db.advisory_lock("user-1"):
            log.append(("inside",))
            raise ValueError("boom")
    except ValueError:
        pass
    names = [e[0] for e in log]
    assert names == ["getconn", "execute", "inside", "rollback", "putconn"]
    assert "pg_advisory_xact_lock" in log[1][1]
