"""Learner profile persistence (Supabase Postgres, one JSONB document per user, RLS-protected)."""
from __future__ import annotations

import asyncio
import contextlib
import weakref
from typing import Dict, Optional

from backend.app.models.student_profile import StudentProfile
from backend.app.services.database import Database, json_param


_LOCKS: "weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, Dict[str, asyncio.Lock]]" = weakref.WeakKeyDictionary()


def local_user_lock(user_id: str) -> asyncio.Lock:
    """One lock per learner in this process, shared by every request. (The API builds a new service per request, so a
    lock stored on the service would protect nothing.)"""
    return _LOCKS.setdefault(asyncio.get_running_loop(), {}).setdefault(user_id, asyncio.Lock())


@contextlib.asynccontextmanager
async def user_lock(profiles, user_id: str):
    """Serialise a learner's profile read-modify-write: first against other requests in this process, then against other
    worker processes through the store's advisory lock (when the store has one)."""
    async with local_user_lock(user_id):
        advisory = getattr(profiles, "advisory_lock", None)
        if advisory is None:
            yield
        else:
            async with advisory(user_id):
                yield


class StudentProfileService:
    def __init__(self, db: Database):
        self.db = db

    def advisory_lock(self, user_id: str):
        return self.db.advisory_lock(f"profile:{user_id}")

    async def get_profile_by_user_id(self, user_id: str) -> Optional[StudentProfile]:
        row = await self.db.fetch_one("select data from student_profiles where user_id = %s", (user_id,))
        return StudentProfile(user_id=user_id, **row["data"]) if row else None

    async def create_profile_safe(self, user_id: str) -> StudentProfile:
        """Idempotent and race-free: ON CONFLICT DO NOTHING, then read back."""
        profile = StudentProfile(user_id=user_id)
        await self.db.execute(
            "insert into student_profiles(user_id, data) values (%s, %s) on conflict (user_id) do nothing",
            (user_id, json_param(profile.model_dump(mode="json", exclude={"user_id"}))))
        return await self.get_profile_by_user_id(user_id) or profile

    async def update_profile(self, user_id: str, updates: dict) -> bool:
        """Shallow-merge top-level keys into the profile document."""
        n = await self.db.execute(
            "update student_profiles set data = data || %s, updated_at = now() where user_id = %s",
            (json_param(updates), user_id))
        return n > 0

    async def recent_sessions(self, user_id: str, limit: int = 100) -> list[dict]:
        return await self.db.fetch_all(
            "select id::text, doc_id, started_at, ended_at, summary from sessions "
            "where user_id = %s order by started_at desc limit %s", (user_id, limit))
