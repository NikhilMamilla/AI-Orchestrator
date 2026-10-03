"""Learner profile persistence (Supabase Postgres, one JSONB document per user, RLS-protected)."""
from __future__ import annotations

from typing import Optional

from backend.app.models.student_profile import StudentProfile
from backend.app.services.database import Database, json_param


class StudentProfileService:
    def __init__(self, db: Database):
        self.db = db

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
