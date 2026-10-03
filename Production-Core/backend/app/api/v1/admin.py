"""Admin console API. Every route is admin-only and returns aggregates (see backend/app/admin/stats.py for the
privacy rules). Read-only except /tools/*, which only prune or clear derived data."""
from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from backend.app.admin import audit, stats
from backend.app.admin.inspect import inspect as inspect_question
from backend.app.config import settings
from backend.app.learning import challenges
from backend.app.rag.gaps import RETENTION_DAYS
from backend.app.security import User, require_admin
from backend.app.services import rag_service
from backend.app.services.database import db
from backend.app.services.llm import get_router

router = APIRouter()
EVAL_DIR = Path(__file__).resolve().parents[4] / "docs" / "eval"
MAX_PROFILES = 5000
_judge0: Dict[str, Any] = {"at": 0.0, "ok": None}


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _rows(sql: str, params: tuple = ()) -> List[Dict[str, Any]]:
    if db.pool is None:
        return []
    try:
        return await db.fetch_all(sql, params)
    except Exception:                                     # a missing table or a blip must not take the console down
        return []


async def _profiles() -> List[Dict[str, Any]]:
    rows = await _rows("select data from student_profiles order by updated_at desc limit %s", (MAX_PROFILES,))
    return [r["data"] if isinstance(r["data"], dict) else json.loads(r["data"]) for r in rows]


async def _titles() -> Dict[str, str]:
    store = await rag_service.get_store()                 # the store alone: never waits for the model weights
    docs = await asyncio.to_thread(store.list_documents)
    return {d.id: d.title for d in docs}


async def _questions(days: int) -> List[Dict[str, Any]]:
    return await _rows("select created_at, status, confidence, total_ms, meta from rag_requests "
                       "where created_at >= now() - make_interval(days => %s)", (days,))


@router.get("/overview")
async def admin_overview(days: int = Query(14, ge=7, le=60), user: User = Depends(require_admin)):
    profiles, questions = await _profiles(), await _questions(days)
    runs = [r["created_at"] for r in await _rows(
        "select created_at from code_submissions where created_at >= now() - make_interval(days => %s)", (days,))]
    ov = stats.overview(profiles, questions, runs, days, _now(), settings.admin_min_group)
    gaps = await _rows("select question from content_gaps where created_at >= now() - make_interval(days => %s)", (days,))
    top = [{"topic": q, "count": n} for q, n in _count(r["question"].strip().lower() for r in gaps)]
    sys = await _system_checks()
    ov["alerts"] = stats.alerts(ov, top, sys["docs_without_passages"],
                                {s["name"]: s["ok"] for s in sys["services"] if s["required"] and s["ok"] is not None})
    ov["min_group"] = settings.admin_min_group
    return ov


def _count(items):
    out: Dict[str, int] = {}
    for i in items:
        out[i] = out.get(i, 0) + 1
    return sorted(out.items(), key=lambda kv: -kv[1])[:5]


@router.get("/learners")
async def admin_learners(user: User = Depends(require_admin)):
    profiles, titles = await _profiles(), await _titles()
    k = settings.admin_min_group
    out = stats.learners(profiles, titles, _now(), k)
    quiz = await _rows("select user_id::text as user_id, doc_id, question, options, answer_index, chosen_index, correct "
                       "from quiz_items where answered_at is not null order by answered_at desc limit 3000")
    out["missed_questions"] = stats.missed_questions(quiz, titles, k)
    out["min_group"] = k
    return out


@router.get("/challenges")
async def admin_challenges(user: User = Depends(require_admin)):
    return {"challenges": stats.challenge_stats(await _profiles(), challenges.load(), settings.admin_min_group),
            "min_group": settings.admin_min_group}


@router.get("/quality")
async def admin_quality(days: int = Query(14, ge=7, le=60), user: User = Depends(require_admin)):
    out = stats.quality(await _questions(days), days, _now())
    files = {}
    for name in ("results", "generation", "teachback", "sketch"):
        p = EVAL_DIR / f"{name}.json"
        if p.exists():
            try:
                files[name] = json.loads(p.read_text(encoding="utf-8"))
            except ValueError:
                pass
    out["eval"] = stats.eval_summary(files)
    return out


async def _judge0_ok() -> bool | None:
    if time.monotonic() - _judge0["at"] < 60:
        return _judge0["ok"]
    headers = {"X-RapidAPI-Key": settings.JUDGE0_API_KEY} if settings.JUDGE0_API_KEY else {}
    try:
        async with httpx.AsyncClient(timeout=3) as c:
            r = await c.get(f"{settings.JUDGE0_API_URL.rstrip('/')}/about", headers=headers)
        ok = r.status_code < 500
    except httpx.HTTPError:
        ok = False
    _judge0.update(at=time.monotonic(), ok=ok)
    return ok


async def _redis_ok() -> bool | None:
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.REDIS_URL, socket_connect_timeout=1)
        try:
            return bool(await r.ping())
        finally:
            await r.aclose()
    except Exception:
        return False


async def _system_checks() -> Dict[str, Any]:
    t0 = time.perf_counter()
    db_ok = None
    if db.pool is not None:
        try:
            await db.fetch_one("select 1 as ok")
            db_ok = True
        except Exception:
            db_ok = False
    db_ms = round((time.perf_counter() - t0) * 1000)
    llm = get_router()
    providers = llm.status()
    judge0, redis_ok = await asyncio.gather(_judge0_ok(), _redis_ok())
    pipe = rag_service._pipeline                          # report on the models only if they are already loaded
    store = await rag_service.get_store()

    def count_empty() -> int:                             # one worker thread for all the lookups, off the event loop
        return sum(1 for d in store.list_documents() if not store.passages_for_doc(d.id))
    no_passages = await asyncio.to_thread(count_empty)
    services = [
        {"name": "Database (Supabase)", "ok": db_ok, "detail": f"{db_ms} ms" if db_ok else "not connected", "required": True},
        {"name": "LLM providers", "ok": any(not p["cooling_down"] for p in providers) if providers else False,
         "detail": ", ".join(f"{p['provider']}{' (cooling down)' if p['cooling_down'] else ''}" for p in providers) or "none configured",
         "required": True},
        {"name": "Judge0 sandbox", "ok": judge0, "detail": settings.JUDGE0_API_URL, "required": True},
        {"name": "Firebase sign-in", "ok": bool(settings.FIREBASE_PROJECT_ID), "detail": "project set" if settings.FIREBASE_PROJECT_ID else "FIREBASE_PROJECT_ID missing", "required": True},
        {"name": "Redis (optional queue)", "ok": redis_ok, "detail": "used by the agent message queue when present", "required": False},
        {"name": "Retrieval models", "ok": True if pipe is not None else None,
         "detail": f"{pipe.embedder.name} · {pipe.reranker.name}" if pipe is not None else "loading in the background", "required": False},
    ]
    return {"services": services, "docs_without_passages": no_passages}


SETTINGS = ("DATABASE_URL", "FIREBASE_PROJECT_ID", "MISTRAL_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEYS", "JUDGE0_API_URL",
            "ADMIN_EMAILS", "ALLOWED_ORIGINS", "REDIS_URL")


@router.get("/system")
async def admin_system(user: User = Depends(require_admin)):
    checks = await _system_checks()
    return {**checks,
            "env": settings.ENV, "auth_disabled": bool(settings.AUTH_DISABLED and not settings.is_production),
            "settings": [{"name": n, "set": bool(getattr(settings, n, None))} for n in SETTINGS],   # never the values
            "admins": sorted(settings.admin_emails), "min_group": settings.admin_min_group,
            "you": {"email": user.get("email"), "verified": bool(user.get("email_verified")) or not user.get("firebase_uid")}}


@router.post("/tools/{tool}")
async def admin_tool(tool: Literal["clear-cache", "prune-shares", "prune-gaps"], user: User = Depends(require_admin)):
    out = await _run_tool(tool)
    await audit.record(db, user.get("email"), f"tool:{tool}", {"affected": out["affected"]})
    return out


async def _run_tool(tool: str) -> Dict[str, Any]:
    if tool == "clear-cache":
        llm = get_router()
        n = 0
        for c in [llm.cache, *(p.cache for p in llm.providers)]:
            n += len(c._d)
            c._d.clear()
        return {"tool": tool, "affected": n, "message": f"Cleared {n} cached model answers."}
    if db.pool is None:
        raise HTTPException(503, "The database is not connected.")
    if tool == "prune-shares":
        n = await db.execute("delete from progress_shares where expires_at < now() or revoked_at is not null")
        return {"tool": tool, "affected": n, "message": f"Removed {n} expired or revoked share links."}
    n = await db.execute("delete from content_gaps where created_at < now() - make_interval(days => %s)", (RETENTION_DAYS,))
    return {"tool": tool, "affected": n, "message": f"Removed {n} content-gap entries older than {RETENTION_DAYS} days."}


# ---------------------------------------------------------------- drill-downs
@router.get("/concept/{concept_id}")
async def admin_concept(concept_id: str, user: User = Depends(require_admin)):
    store = await rag_service.get_store()                 # the store alone: never waits for the model weights
    docs = await asyncio.to_thread(store.list_documents)
    doc = next((d for d in docs if d.id == concept_id), None)
    if doc is None:
        raise HTTPException(404, "Unknown concept.")
    titles = {d.id: d.title for d in docs}
    k = settings.admin_min_group
    out = stats.concept_detail(await _profiles(), concept_id, titles, doc.prerequisites,
                               [d.id for d in docs if concept_id in d.prerequisites], _now(), k)
    quiz = await _rows("select user_id::text as user_id, doc_id, question, options, answer_index, chosen_index, correct "
                       "from quiz_items where answered_at is not null and doc_id = %s order by answered_at desc limit 1000", (concept_id,))
    out["missed_questions"] = stats.missed_questions(quiz, titles, k)[:5]
    out["challenges"] = [c for c in stats.challenge_stats(await _profiles(), challenges.load(), k) if c["concept"] == concept_id]
    out["document"] = {"level": doc.level, "domain": doc.domain, "tags": doc.tags, "version": doc.version,
                       "passages": len(await asyncio.to_thread(store.passages_for_doc, concept_id))}
    out["min_group"] = k
    return out


@router.get("/documents/{doc_id}")
async def admin_document(doc_id: str, user: User = Depends(require_admin)):
    """A source as the retriever sees it: metadata and every citable passage."""
    store = await rag_service.get_store()
    doc = await asyncio.to_thread(store.get_document, doc_id)
    if doc is None:
        raise HTTPException(404, "Unknown document.")
    passages = await asyncio.to_thread(store.passages_for_doc, doc_id)
    return {"id": doc.id, "title": doc.title, "level": doc.level, "domain": doc.domain, "prerequisites": doc.prerequisites,
            "tags": doc.tags, "version": doc.version, "source": doc.source,
            "passages": [{"id": pid, "text": text} for pid, text in passages]}


@router.get("/engagement")
async def admin_engagement(user: User = Depends(require_admin)):
    out = stats.engagement(await _profiles(), _now(), settings.admin_min_group)
    out["min_group"] = settings.admin_min_group
    return out


class InspectRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1200)
    level: Literal["beginner", "intermediate", "advanced"] = "beginner"


@router.post("/inspect")
async def admin_inspect(req: InspectRequest, user: User = Depends(require_admin)):
    """What the tutor would do with a question, stopping before the model: screen, plan, scores, gate."""
    pipe = await rag_service.get_pipeline()
    return await asyncio.to_thread(inspect_question, pipe, req.query, req.level)


# ---------------------------------------------------------------- announcements and audit (migration 0009)
MIGRATION_HINT = "Run python scripts/migrate.py to create the announcements and audit tables (migration 0009)."


class AnnouncementIn(BaseModel):
    text: str = Field(min_length=1, max_length=280)
    level: Literal["info", "warning"] = "info"
    days: int = Field(7, ge=1, le=30)


def _ann(r: Dict[str, Any]) -> Dict[str, Any]:
    return {"id": r["id"], "text": r["text"], "level": r["level"], "created_by": r.get("created_by"),
            "created_at": r["created_at"].isoformat(), "expires_at": r["expires_at"].isoformat(),
            "live": r.get("retracted_at") is None and r["expires_at"] > _now()}


async def _strict(sql: str, params: tuple = ()) -> List[Dict[str, Any]]:
    if db.pool is None:
        raise HTTPException(503, "The database is not connected.")
    try:
        return await db.fetch_all(sql, params)
    except Exception:
        raise HTTPException(503, MIGRATION_HINT)


@router.get("/announcements")
async def list_announcements(user: User = Depends(require_admin)):
    rows = await _strict("select * from announcements order by created_at desc limit 30")
    return {"announcements": [_ann(r) for r in rows]}


@router.post("/announcements")
async def create_announcement(req: AnnouncementIn, user: User = Depends(require_admin)):
    rows = await _strict("insert into announcements(text, level, created_by, expires_at) "
                         "values (%s, %s, %s, now() + make_interval(days => %s)) returning *",
                         (req.text.strip(), req.level, user.get("email") or "admin", req.days))
    await audit.record(db, user.get("email"), "announcement:post", {"id": rows[0]["id"], "level": req.level, "days": req.days})
    return _ann(rows[0])


@router.delete("/announcements/{ann_id}")
async def retract_announcement(ann_id: int, user: User = Depends(require_admin)):
    rows = await _strict("update announcements set retracted_at = now() where id = %s and retracted_at is null returning *", (ann_id,))
    if not rows:
        raise HTTPException(404, "Already retracted or not found.")
    await audit.record(db, user.get("email"), "announcement:retract", {"id": ann_id})
    return _ann(rows[0])


@router.get("/audit")
async def audit_log(user: User = Depends(require_admin)):
    rows = await _strict("select actor, action, detail, created_at from admin_audit order by created_at desc limit 60")
    return {"entries": [{**r, "created_at": r["created_at"].isoformat()} for r in rows]}
