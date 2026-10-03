"""Learning-loop API: check questions, grading, roadmap, review queue. Identity always comes from the token."""
import json
import logging
from datetime import date, datetime, timezone
from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from backend.app.learning.service import LearningError, LearningService, PgQuizRepo
from backend.app.config import settings
from backend.app.learning import prefs, rhythm, sketch, study
from backend.app.learning.coding_profiles import PLATFORMS as CODING_PLATFORMS
from backend.app.security import RateLimiter, User, get_current_user, require_admin
from backend.app.rag.llm import LLMUnavailable
from backend.app.services.activity import record_event
from backend.app.services.database import Database, get_database
from backend.app.services.database import db as shared_db
from backend.app.services.llm import get_router, get_vision_router
from backend.app.services import rag_service
from backend.app.services.rag_service import get_pipeline, get_store
from backend.app.services.student_profile_service import StudentProfileService

logger = logging.getLogger(__name__)
router = APIRouter()
quiz_limiter = RateLimiter(20)


class QuizRequest(BaseModel):
    doc_id: str = Field(max_length=80)
    chunk_id: Optional[str] = Field(default=None, max_length=120)
    level: Literal["beginner", "intermediate", "advanced"] = "beginner"


class AnswerRequest(BaseModel):
    quiz_id: str = Field(max_length=64)
    chosen: int = Field(ge=0, le=3)
    confidence: Optional[Literal["guess", "unsure", "sure"]] = None
    tz_offset_min: Optional[int] = Field(default=None, ge=-840, le=840)     # JS getTimezoneOffset(): for time-of-day insight


async def service(db: Database = Depends(get_database)) -> LearningService:
    store = await get_store()                       # never waits for the model weights

    async def emit(user_id, agent, message, meta):
        await record_event(db, user_id, agent, message, meta)
    svc = LearningService(StudentProfileService(db), PgQuizRepo(db), store, get_router(), emit)
    pipe = rag_service._pipeline
    if pipe is not None:
        svc.embedder, svc.nli = pipe.embedder, pipe.nli
    svc.load_models = get_pipeline                  # teach-back loads them if they are not ready yet
    return svc


def _fail(e: LearningError):
    raise HTTPException(status_code=e.status, detail=str(e))


@router.post("/quiz")
async def create_quiz(req: QuizRequest, user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    quiz_limiter.check(user.uid)
    try:
        return await svc.create_quiz(user.uid, req.doc_id, req.chunk_id, req.level)
    except LearningError as e:
        _fail(e)


@router.post("/answer")
async def answer(req: AnswerRequest, user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    try:
        return await svc.answer(user.uid, req.quiz_id, req.chosen, req.tz_offset_min, req.confidence)
    except LearningError as e:
        _fail(e)


@router.get("/path")
async def path(goal: Optional[str] = Query(default=None, max_length=80), user: User = Depends(get_current_user),
               svc: LearningService = Depends(service)):
    return await svc.path(user.uid, goal)


@router.get("/review")
async def review(user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    return await svc.review_queue(user.uid)


@router.get("/insights")
async def insights(user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    """Behavioural Analyst: patterns, struggles and misconceptions detected from the learner's own attempts."""
    return await svc.insights(user.uid)


@router.get("/plan")
async def session_plan(minutes: Optional[int] = Query(default=None, ge=10, le=120),
                       level: Literal["beginner", "intermediate", "advanced"] = "beginner",
                       user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    """Orchestrator: a session plan with the 60/25/15 time split and 30/50/20 difficulty mix."""
    if minutes is None:                                  # the learner's saved preference, else 40
        minutes = (await svc.get_prefs(user.uid))["session_minutes"]
    return await svc.session_plan(user.uid, minutes, level)


@router.get("/strategy")
async def strategy_summary(user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    """Which teaching styles have worked for this learner (counted trials, not guesses)."""
    return await svc.strategy_summary(user.uid)


@router.post("/diagnostic/next")
async def diagnostic_next(level: Literal["beginner", "intermediate", "advanced"] = "beginner",
                          user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    """Adaptive placement check (about 8 questions). Answer each via POST /learning/answer, then call this again."""
    quiz_limiter.check(user.uid)
    try:
        return await svc.diagnostic_next(user.uid, level)
    except LearningError as e:
        _fail(e)


@router.delete("/diagnostic")
async def diagnostic_reset(user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    await svc.diagnostic_reset(user.uid)
    return {"ok": True}


class GoalRequest(BaseModel):
    goal: Optional[str] = Field(default=None, max_length=80)          # a concept id, or null for the whole curriculum
    deadline: date
    daily_minutes: int = Field(ge=10, le=480)


@router.put("/goal")
async def set_goal(req: GoalRequest, user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    """Set a goal and deadline; returns a feasibility check and a week-by-week plan."""
    try:
        return await svc.set_goal(user.uid, req.goal, req.deadline, req.daily_minutes)
    except LearningError as e:
        _fail(e)


@router.get("/goal")
async def get_goal(user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    return await svc.goal_plan(user.uid)


@router.get("/journal")
async def journal(days: int = Query(default=7, ge=1, le=90), user: User = Depends(get_current_user),
                  svc: LearningService = Depends(service)):
    """Auto-generated learning journal for the last `days` days, built from the learner's recorded answers."""
    return await svc.journal(user.uid, days)


class HintRequest(BaseModel):
    quiz_id: str = Field(max_length=64)


@router.post("/hint")
async def hint(req: HintRequest, user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    quiz_limiter.check(user.uid)
    try:
        return await svc.hint(user.uid, req.quiz_id)
    except LearningError as e:
        _fail(e)


challenge_limiter = RateLimiter(12)


class ChallengeSubmit(BaseModel):
    code: str = Field(min_length=1, max_length=8000)


@router.get("/challenges")
async def list_challenges(user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    return await svc.challenge_list(user.uid)


@router.post("/challenges/{challenge_id}/hint")
async def challenge_hint(challenge_id: str, user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    """Reveal the hint now; passing after it earns hint-level credit (the help ladder's cost)."""
    try:
        return await svc.challenge_hint(user.uid, challenge_id)
    except LearningError as e:
        _fail(e)


@router.post("/challenges/{challenge_id}/submit")
async def submit_challenge(challenge_id: str, req: ChallengeSubmit, user: User = Depends(get_current_user),
                           svc: LearningService = Depends(service)):
    challenge_limiter.check(user.uid)
    try:
        return await svc.challenge_submit(user.uid, challenge_id, req.code)
    except LearningError as e:
        _fail(e)


teachback_limiter = RateLimiter(10)
verify_limiter = RateLimiter(6)              # each check reads a third-party site


class TeachBackRequest(BaseModel):
    doc_id: str = Field(max_length=80)
    explanation: str = Field(min_length=1, max_length=1500)


@router.post("/teachback")
async def teachback(req: TeachBackRequest, user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    """Grade the learner's own explanation of a concept against the course material (no LLM involved)."""
    teachback_limiter.check(user.uid)
    try:
        return await svc.teachback(user.uid, req.doc_id, req.explanation)
    except LearningError as e:
        _fail(e)


# ---------- Evidence Lab (opt-in pre/post study) ----------
class StudyJoin(BaseModel):
    consent: bool


class StudyAnswer(BaseModel):
    quiz_id: str = Field(max_length=64)
    chosen: int = Field(ge=0, le=3)


@router.get("/study")
async def study_status(user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    return await svc.study_status(user.uid)


@router.post("/study/join")
async def study_join(req: StudyJoin, user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    if not req.consent:
        raise HTTPException(status_code=400, detail="Consent is required to join the study.")
    return await svc.study_join(user.uid)


@router.get("/study/result")
async def study_result(user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    try:
        return await svc.study_result(user.uid)
    except LearningError as e:
        _fail(e)


@router.post("/study/{phase}/start")
async def study_start(phase: Literal["pre", "post"], user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    quiz_limiter.check(user.uid)
    try:
        return await svc.study_start(user.uid, phase)
    except LearningError as e:
        _fail(e)


@router.post("/study/{phase}/answer")
async def study_answer(phase: Literal["pre", "post"], req: StudyAnswer, user: User = Depends(get_current_user),
                       svc: LearningService = Depends(service)):
    try:
        return await svc.study_answer(user.uid, phase, req.quiz_id, req.chosen)
    except LearningError as e:
        _fail(e)


async def _study_rows(db: Database):
    return await db.fetch_all(
        "select user_id::text as uid, data->'patterns'->'study' as study from student_profiles "
        "where data->'patterns'->'study' is not null")


@router.get("/announcement")
async def current_announcement(user: User = Depends(get_current_user)):
    """The newest live announcement from an admin, or null (also null with no database or before migration 0009)."""
    if shared_db.pool is None:
        return {"announcement": None}
    try:
        row = await shared_db.fetch_one("select id, text, level, created_at from announcements where retracted_at is null "
                                 "and expires_at > now() order by created_at desc limit 1")
    except Exception:
        return {"announcement": None}
    return {"announcement": row and {"id": row["id"], "text": row["text"], "level": row["level"], "created_at": row["created_at"].isoformat()}}


@router.get("/announcements")
async def recent_announcements(user: User = Depends(get_current_user)):
    """The learner's inbox: announcements from the last 30 days, newest first (empty before migration 0009)."""
    if shared_db.pool is None:
        return {"announcements": []}
    try:
        rows = await shared_db.fetch_all(
            "select id, text, level, created_at, expires_at from announcements where retracted_at is null "
            "and created_at > now() - interval '30 days' order by created_at desc limit 10")
    except Exception:
        return {"announcements": []}
    now = datetime.now(timezone.utc)
    return {"announcements": [{"id": r["id"], "text": r["text"], "level": r["level"], "created_at": r["created_at"].isoformat(),
                               "live": r["expires_at"] > now} for r in rows]}


@router.get("/rhythm")
async def my_rhythm(user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    """When and how much the caller studies, from their own answers."""
    profile = await svc._profile(user.uid)
    return rhythm.rhythm(profile.patterns.get("attempts", []), datetime.now(timezone.utc))


@router.get("/export")
async def export_my_data(user: User = Depends(get_current_user), db: Database = Depends(get_database)):
    """Everything Kiddoo stores about the caller, as one JSON download (share-link secrets excluded)."""
    uid = user.uid
    profile = await db.fetch_one("select data, updated_at from student_profiles where user_id = %s", (uid,))
    out: Dict[str, Any] = {
        "exported_at": datetime.now(timezone.utc).isoformat(), "account": {"email": user.get("email")},
        "learner_profile": profile["data"] if profile else None,
        "quiz_answers": await db.fetch_all(
            "select doc_id, question, options, answer_index, chosen_index, correct, explanation, created_at, answered_at "
            "from quiz_items where user_id = %s order by created_at", (uid,)),
        "code_runs": await db.fetch_all(
            "select language, source_code, stdout, stderr, status, created_at from code_submissions where user_id = %s "
            "order by created_at desc limit 500", (uid,)),
        "agent_decisions": await db.fetch_all(
            "select agent, message, meta, created_at from agent_events where user_id = %s order by created_at desc limit 1000", (uid,)),
        "share_links": await db.fetch_all(
            "select label, created_at, expires_at, revoked_at, last_viewed_at, views from progress_shares where user_id = %s", (uid,)),
    }
    body = json.dumps(out, default=str, ensure_ascii=False, indent=2)
    return Response(body, media_type="application/json",
                    headers={"Content-Disposition": 'attachment; filename="kiddoo-my-data.json"'})


@router.get("/study/role")
async def study_role(user: User = Depends(get_current_user)):
    """Lets the page decide whether to ask for the organiser report, without a failing request for ordinary learners."""
    return {"admin": bool(user.is_admin or user.get("dev"))}


@router.get("/study/admin/report")
async def study_report(user: User = Depends(require_admin), db: Database = Depends(get_database)):
    """Cohort result for the organiser: counts, paired statistics and per-concept gains. No identities leave this endpoint."""
    rows = await _study_rows(db)
    done = [r["study"] for r in rows if study.next_step(r["study"]) == "done"]
    pairs = [{"pre": s["pre"]["score"], "post": s["post"]["score"]} for s in done]
    return {"joined": len(rows), "pre_done": sum(1 for r in rows if r["study"]["pre"]["score"] is not None), "completed": len(done),
            "result": study.analyse(pairs), "design": {"items_per_test": study.PER_CONCEPT * len(study.CONCEPTS), "concepts": study.CONCEPTS,
                                                       "control_group": False}}


@router.get("/study/admin/export.csv")
async def study_export(user: User = Depends(require_admin), db: Database = Depends(get_database)):
    """Anonymised per-learner scores (salted hash prefix, no email or id) for analysis in a spreadsheet or R."""
    rows = await _study_rows(db)
    salt = settings.SUPABASE_URL or "kiddoo"
    lines = ["learner,pre,post,gain"]
    for r in rows:
        s = r["study"]
        if study.next_step(s) == "done":
            lines.append(f"{study.pseudonym(r['uid'], salt)},{s['pre']['score']:.3f},{s['post']['score']:.3f},{s['post']['score'] - s['pre']['score']:.3f}")
    return Response("\n".join(lines) + "\n", media_type="text/csv")


# ---------- Sketch check (vision reads, rules judge) ----------
sketch_limiter = RateLimiter(6)
PNG_PREFIX = "data:image/png;base64,"


class SketchRequest(BaseModel):
    kind: Literal["bst", "min-heap", "max-heap"]
    image: str = Field(max_length=1_500_000)


@router.post("/sketch")
async def check_sketch(req: SketchRequest, user: User = Depends(get_current_user)):
    """A vision model reads the drawn tree; deterministic rules decide whether it is a valid BST/heap."""
    sketch_limiter.check(user.uid)
    if not req.image.startswith(PNG_PREFIX):
        raise HTTPException(status_code=400, detail="Send the drawing as a PNG data URL.")
    router_ = get_vision_router()
    if not router_.available:
        raise HTTPException(status_code=503, detail="The drawing reader is unavailable right now.")
    try:
        out = await sketch.read_and_check(router_, req.image, req.kind)
    except sketch.SketchError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except LLMUnavailable:
        raise HTTPException(status_code=503, detail="The drawing reader is busy. Try again in a moment.")
    return out


# ---------- Preferences, leaderboard opt-in, data controls ----------
class PrefsUpdate(BaseModel):
    style: Optional[Literal["auto", "default", "socratic", "worked_example", "analogy"]] = None
    tone: Optional[Literal["encouraging", "neutral", "challenging"]] = None
    session_minutes: Optional[int] = Field(default=None, ge=10, le=120)
    ui: Optional[Dict[str, Any]] = None                                    # appearance, synced across devices


class LeaderboardOptIn(BaseModel):
    nickname: Optional[str] = Field(default=None, max_length=40)       # null = opt out


@router.get("/preferences")
async def get_preferences(user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    return await svc.get_prefs(user.uid)


@router.put("/preferences")
async def put_preferences(req: PrefsUpdate, user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    try:
        return await svc.set_prefs(user.uid, req.model_dump(exclude_none=True))
    except LearningError as e:
        _fail(e)


@router.put("/leaderboard/optin")
async def leaderboard_optin(req: LeaderboardOptIn, user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    try:
        return await svc.set_leaderboard(user.uid, req.nickname)
    except LearningError as e:
        _fail(e)


class CodingProfilesUpdate(BaseModel):
    github: Optional[str] = Field(default=None, max_length=40)
    leetcode: Optional[str] = Field(default=None, max_length=40)
    codeforces: Optional[str] = Field(default=None, max_length=40)
    hackerrank: Optional[str] = Field(default=None, max_length=40)
    codechef: Optional[str] = Field(default=None, max_length=40)


@router.get("/coding-profiles")
async def get_coding_profiles(refresh: bool = False, user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    """The learner's linked coding profiles with live public stats (cached ten minutes; refresh at most once a minute)."""
    return await svc.get_coding_profiles(user.uid, force=refresh)


@router.put("/coding-profiles")
async def put_coding_profiles(req: CodingProfilesUpdate, user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    try:
        return await svc.set_coding_profiles(user.uid, req.model_dump(exclude_none=True))
    except LearningError as e:
        _fail(e)


@router.post("/coding-profiles/{platform}/verify")
async def verify_coding_profile(platform: str, user: User = Depends(get_current_user), svc: LearningService = Depends(service)):
    """Checks the platform's public profile right now for the learner's verification code."""
    verify_limiter.check(user.uid)
    try:
        return await svc.verify_coding_profile(user.uid, platform)
    except LearningError as e:
        _fail(e)


@router.get("/data/summary")
async def my_data_summary(user: User = Depends(get_current_user), db: Database = Depends(get_database)):
    """How much Kiddoo stores about the caller, counted live from the database."""
    uid = user.uid
    counts = {}
    for key, table in (("quiz_answers", "quiz_items"), ("code_runs", "code_submissions"), ("agent_decisions", "agent_events"),
                       ("share_links", "progress_shares")):
        row = await db.fetch_one(f"select count(*)::int as n from {table} where user_id = %s", (uid,))   # fixed table names
        counts[key] = row["n"] if row else 0
    live = await db.fetch_one("select count(*)::int as n from progress_shares where user_id = %s and revoked_at is null "
                              "and expires_at > now()", (uid,))
    prof = await db.fetch_one("select data, updated_at from student_profiles where user_id = %s", (uid,))
    data = (prof or {}).get("data") or {}
    pat = data.get("patterns") or {}
    return {**counts, "live_share_links": live["n"] if live else 0,
            "concepts_tracked": len(data.get("concept_mastery") or []), "attempts_logged": len(pat.get("attempts") or []),
            "coding_profiles": len(pat.get("coding_profiles") or {}), "has_goal": bool(pat.get("goal")),
            "in_study": bool(pat.get("study")), "on_leaderboard": bool((pat.get("leaderboard") or {}).get("nickname")),
            "profile_updated_at": prof["updated_at"].isoformat() if prof else None}


PARTS = {
    "code_runs": ("delete from code_submissions where user_id = %s",),
    "agent_history": ("delete from agent_events where user_id = %s",),
    "share_links": ("update progress_shares set revoked_at = now() where user_id = %s and revoked_at is null",),
}


@router.delete("/data/{part}")
async def delete_part_of_my_data(part: Literal["code_runs", "agent_history", "share_links", "coding_profiles"],
                                 user: User = Depends(get_current_user), db: Database = Depends(get_database),
                                 svc: LearningService = Depends(service)):
    """Erase one kind of data and keep the rest."""
    if part == "coding_profiles":
        await svc.set_coding_profiles(user.uid, {p: "" for p in CODING_PLATFORMS})
        return {"deleted": part, "affected": None}
    affected = 0
    for sql in PARTS[part]:
        affected += await db.execute(sql, (user.uid,))
    return {"deleted": part, "affected": affected}


@router.get("/leaderboard")
async def leaderboard(user: User = Depends(get_current_user), db: Database = Depends(get_database)):
    """Opted-in learners only, by chosen nickname, ranked by points derived from measured mastery."""
    rows = await db.fetch_all(
        "select user_id::text as uid, data->'patterns'->'leaderboard'->>'nickname' as nick, data->'concept_mastery' as cm "
        "from student_profiles where data->'patterns'->'leaderboard'->>'nickname' is not null limit 2000")
    return prefs.board(rows, user.uid)


# every table holding a learner's rows (migration 0008 removed the cascading foreign keys, so deletion is explicit)
USER_TABLES = ("quiz_items", "agent_events", "progress_shares", "code_submissions", "interactions", "sessions",
               "concept_mastery", "student_profiles")


@router.delete("/data")
async def delete_my_learning_data(user: User = Depends(get_current_user), db: Database = Depends(get_database)):
    """Erase the caller's learning data: mastery, answers, plans, journal, share links and agent events."""
    await db.execute_many([(f"delete from {table} where user_id = %s", (user.uid,))     # fixed names, parameterised id
                           for table in USER_TABLES])                                 # one transaction: all or nothing
    return {"deleted": True}
