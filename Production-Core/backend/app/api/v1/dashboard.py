import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from backend.app.learning.rhythm import daily_progress
from backend.app.security import User, get_current_user
from backend.app.services.concept_service import ConceptService
from backend.app.services.database import Database, get_database
from backend.app.services.rag_service import get_store
from backend.app.services.student_profile_service import StudentProfileService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/")
async def get_dashboard_summary(user: User = Depends(get_current_user), db: Database = Depends(get_database)):
    """Dashboard data for the *authenticated* user. Every number comes from the stored profile;
    when there is no history yet the response says so rather than inventing placeholders."""
    service = StudentProfileService(db)
    profile = await service.get_profile_by_user_id(user.uid) or await service.create_profile_safe(user.uid)
    concepts = await ConceptService(await get_store()).outline()
    mastery = {str(m.concept_id): m.mastery_level for m in profile.concept_mastery}

    # Recommendation = the unlocked, not-yet-mastered concept with the lowest difficulty.
    ids = {c.id for c in concepts}
    ready = [c for c in concepts
             if mastery.get(c.id, 0.0) < 0.8
             and all(mastery.get(p, 0.0) >= 0.6 for p in c.prerequisites if p in ids)]
    ready.sort(key=lambda c: (c.difficulty_level, -mastery.get(c.id, 0.0), c.title))
    recommendations = profile.patterns.get("recommendations") or [
        {"title": c.title, "concept_id": c.id,
         "description": "Continue where you left off." if mastery.get(c.id, 0) > 0
         else ("All prerequisites met." if c.prerequisites else "A foundational topic to start with.")}
        for c in ready[:3]]

    history = daily_progress(profile.patterns.get("progress_history") or [], profile.patterns.get("attempts") or [],
                             datetime.now(timezone.utc))
    return {
        "progress_overview": {
            "concepts_mastered": sum(1 for m in mastery.values() if m >= 0.8),
            "concepts_total": len(concepts),
            "current_streak": profile.overall_stats.current_streak,
            "total_time_minutes": profile.overall_stats.total_time_minutes,
        },
        "analytics": {"progress_over_time": history,
                      "has_history": any(p["answers"] for p in history), "as_of": datetime.now(timezone.utc).isoformat()},
        "recommendations": recommendations,
    }


AGENT_TYPES = {"orchestrator": "orchestrator", "analyst": "analyst", "teaching": "tutor", "tutor": "tutor",
               "assessment": "assessor", "assessor": "assessor"}


@router.get("/activity")
async def get_agent_activity(limit: int = 20, user: User = Depends(get_current_user),
                             db: Database = Depends(get_database)):
    """The caller's most recent real agent decisions (empty until they have studied)."""
    rows = await db.fetch_all(
        "select agent, message, created_at from agent_events where user_id = %s "
        "order by created_at desc limit %s", (user.uid, max(1, min(limit, 50))))
    return [{"agent": r["agent"].title(), "action": r["message"], "timestamp": r["created_at"].isoformat(),
             "type": AGENT_TYPES.get(r["agent"].lower(), "orchestrator")} for r in rows]


@router.get("/achievements")
async def get_achievements(user: User = Depends(get_current_user), db: Database = Depends(get_database)):
    """Achievements computed from the learner's stored progress; nothing is hard-coded as earned."""
    service = StudentProfileService(db)
    profile = await service.get_profile_by_user_id(user.uid) or await service.create_profile_safe(user.uid)
    concepts = await ConceptService(await get_store()).outline()
    mastery = {str(m.concept_id): m.mastery_level for m in profile.concept_mastery}
    mastered = {cid for cid, v in mastery.items() if v >= 0.8}
    stats = profile.overall_stats

    def by_domain(domain: str):
        ids = [c.id for c in concepts if c.domain == domain]
        return len([i for i in ids if i in mastered]), len(ids)

    f_done, f_total = by_domain("foundations")
    d_done, d_total = by_domain("data-structures")
    streak = max(stats.current_streak, stats.longest_streak)
    specs = [
        ("first-steps", "First Steps", "Complete your first session", "star", stats.total_sessions, 1),
        ("streak-3", "Warming Up", "Study 3 days in a row", "flame", streak, 3),
        ("streak-7", "Hot Streak", "Study 7 days in a row", "flame", streak, 7),
        ("mastery-5", "Concept Collector", "Master 5 concepts", "trophy", len(mastered), 5),
        ("foundations", "Solid Foundations", "Master every foundations concept", "book", f_done, max(1, f_total)),
        ("structures", "Structure Builder", "Master every data-structures concept", "target", d_done, max(1, d_total)),
    ]
    return [{"id": i, "title": t, "description": d, "icon": icon, "earned": prog >= goal,
             "progress": min(prog, goal), "maxProgress": goal} for i, t, d, icon, prog, goal in specs]
