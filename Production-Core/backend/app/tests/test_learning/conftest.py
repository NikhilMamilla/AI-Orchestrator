"""Learning-test fixtures."""
import pytest

from backend.app.learning.service import LearningService, MemoryQuizRepo
from backend.app.models.student_profile import StudentProfile


class FakeProfiles:
    def __init__(self):
        self.p = {}

    async def get_profile_by_user_id(self, uid):
        return self.p.get(uid)

    async def create_profile_safe(self, uid):
        return self.p.setdefault(uid, StudentProfile(user_id=uid))

    async def update_profile(self, uid, updates):
        cur = self.p[uid].model_dump(mode="json")
        cur.update(updates)
        self.p[uid] = StudentProfile(**cur)
        return True


@pytest.fixture
def svc(kb):
    store, _ = kb
    events = []

    async def emit(uid, agent, msg, meta):
        events.append((uid, agent, msg, meta))
    s = LearningService(FakeProfiles(), MemoryQuizRepo(), store, llm=None, emit=emit)
    s.events = events
    return s
