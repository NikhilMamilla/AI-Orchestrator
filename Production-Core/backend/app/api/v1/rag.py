"""RAG HTTP API: grounded Q&A (SSE), knowledge graph, citation viewer, ingestion, admin metrics."""
from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import asdict
from typing import Annotated, Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.app.admin import audit
from backend.app.learning.service import LearningService, PgQuizRepo
from backend.app.rag.gaps import RETENTION_DAYS, MAX_ROWS, cluster, nearest_concepts
from backend.app.rag.ingest import MAX_UPLOAD_BYTES
from backend.app.rag.observability import metrics
from backend.app.learning import prefs
from backend.app.security import (User, ask_limiter, get_current_user, require_admin, upload_limiter)
from backend.app.services.database import db
from backend.app.services.rag_service import get_ingestor, get_pipeline
from backend.app.services.student_profile_service import StudentProfileService

router = APIRouter()
SSE_KEEPALIVE_S = 10.0


class HistoryMsg(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=2000)


class AskRequest(BaseModel):
    query: str = Field(max_length=1200)
    level: Literal["auto", "beginner", "intermediate", "advanced"] = "beginner"
    style: Literal["auto", "default", "socratic", "worked_example", "analogy"] = "default"
    weak_concepts: List[Annotated[str, Field(max_length=80)]] = Field(default_factory=list, max_length=20)
    history: List[HistoryMsg] = Field(default_factory=list, max_length=8)


def _serialize(ans) -> Dict[str, Any]:
    return {"text": ans.text, "status": ans.status, "confidence": ans.confidence,
            "citations": ans.citations, "unsupported_claims": ans.unsupported_claims,
            "evidence": [asdict(e) for e in ans.evidence], "trace": ans.trace}


def _sse(event: str, data: Dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _log_request(ans) -> None:
    """One anonymous row per answer feeds the admin quality history: no user id, no query or answer text."""
    t = ans.trace or {}
    meta = {k: t.get(k) for k in ("intent", "mode", "model", "failure", "cache_hit", "tokens_total", "top_score") if t.get(k) is not None}
    stages = [{"name": s.get("name"), "ms": s.get("ms"), "ok": s.get("ok")} for s in t.get("stages", [])]
    try:
        await db.execute("insert into rag_requests(request_id, user_id, status, confidence, total_ms, stages, meta) "
                         "values (%s, null, %s, %s, %s, %s::jsonb, %s::jsonb) on conflict (request_id) do nothing",
                         (t.get("request_id") or uuid.uuid4().hex[:12], ans.status, ans.confidence, t.get("total_ms"),
                          json.dumps(stages), json.dumps(meta)))
    except Exception:
        pass


@router.post("/ask")
async def ask(req: AskRequest, request: Request, user: User = Depends(get_current_user)):
    ask_limiter.check(user.uid)
    pipe = await get_pipeline()
    history = [m.model_dump() for m in req.history]
    queue: asyncio.Queue = asyncio.Queue()
    mastery, tone, pref_style = None, "neutral", None
    if db.pool is not None:                                  # mastery-aware answers; degrade to generic if unavailable
        try:
            profile = await StudentProfileService(db).get_profile_by_user_id(user.uid)
            mastery = {str(m.concept_id): m.mastery_level for m in profile.concept_mastery} if profile else {}
            tone = prefs.merged(profile.patterns.get("prefs") if profile else None)["tone"]
        except Exception:
            mastery = None

    style, style_info, learning = req.style, None, None
    if mastery is not None:
        learning = LearningService(StudentProfileService(db), PgQuizRepo(db), pipe.store)
    if style == "auto":                                  # meta-learning: pick the style that works for this learner
        style = "default"
        if learning is not None:
            try:
                style_info = await learning.choose_style(user.uid)
                style = style_info["style"]
            except Exception:
                style_info = None

    async def on_stage(name: str, info: Dict[str, Any]):
        await queue.put(("stage", {"name": name, **info}))

    async def run():
        try:
            ans = await pipe.answer(req.query, req.level, style, req.weak_concepts, history,
                                    on_stage=on_stage, mastery=mastery, tone=tone)
            if ans.status == "insufficient_evidence" and db.pool is not None:       # feeds the admin content-gap view
                try:
                    await db.execute("insert into content_gaps(question) values (%s)", (req.query.strip()[:300],))
                except Exception:
                    pass
            if db.pool is not None:
                await _log_request(ans)
            if style_info is not None:
                ans.trace["style"] = {"used": style, "auto": True, "summary": {k: style_info[k] for k in ("styles", "best", "total_trials")}}
                if ans.status == "grounded" and ans.citations:       # the next quiz on this concept settles the trial
                    try:
                        await learning.note_explanation(user.uid, ans.citations[0]["doc_id"], style)
                    except Exception:
                        pass
            await queue.put(("answer", _serialize(ans)))
        except Exception:                                            # never leak internals
            await queue.put(("error", {"message": "Something went wrong answering that."}))
        finally:
            await queue.put(None)

    task = asyncio.create_task(run())

    async def gen():
        try:
            while True:
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=SSE_KEEPALIVE_S)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"                    # keeps proxies from closing a slow answer
                    if await request.is_disconnected():
                        break
                    continue
                if item is None:
                    break
                yield _sse(*item)
                if await request.is_disconnected():
                    break
        finally:
            task.cancel()

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/documents")
async def list_documents(user: User = Depends(get_current_user)):
    pipe = await get_pipeline()
    docs, stats = await asyncio.to_thread(lambda: (pipe.store.list_documents(), pipe.store.stats()))   # remote DB: off the loop
    return {"documents": [{"id": d.id, "title": d.title, "level": d.level, "domain": d.domain, "prerequisites": d.prerequisites,
                           "tags": d.tags, "version": d.version} for d in docs],
            "stats": stats, "embedder": pipe.embedder.name, "reranker": pipe.reranker.name}


@router.get("/graph")
async def concept_graph(user: User = Depends(get_current_user)):
    """Prerequisite graph for the knowledge map (derived from document metadata, not mocked)."""
    pipe = await get_pipeline()
    docs = await asyncio.to_thread(pipe.store.list_documents)
    ids = {d.id for d in docs}
    return {"nodes": [{"id": d.id, "title": d.title, "level": d.level} for d in docs],
            "edges": [{"from": p, "to": d.id} for d in docs for p in d.prerequisites if p in ids]}


@router.get("/chunks/{chunk_id}")
async def get_chunk(chunk_id: str, user: User = Depends(get_current_user)):
    pipe = await get_pipeline()
    chunk = (await asyncio.to_thread(pipe.store.get_chunks, [chunk_id])).get(chunk_id)
    if not chunk:
        raise HTTPException(404, "chunk not found")
    doc = await asyncio.to_thread(pipe.store.get_document, chunk.doc_id)
    return {"id": chunk.id, "doc_id": chunk.doc_id, "doc_title": doc.title if doc else chunk.doc_id,
            "heading_path": chunk.heading_path, "text": chunk.text, "version": doc.version if doc else None}


@router.post("/documents")
async def upload_document(file: UploadFile = File(...), user: User = Depends(require_admin)):
    upload_limiter.check(user.uid)
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    ingestor = await get_ingestor()
    report = await asyncio.to_thread(ingestor.ingest_bytes, file.filename or "upload", data)
    if report.failed:
        raise HTTPException(422, next(iter(report.failed.values())))
    await audit.record(db, user.get("email"), "upload", {"file": (file.filename or "upload")[:120], "added": len(report.added),
                                                         "updated": len(report.updated), "quarantined": report.quarantined_spans})
    return asdict(report)


@router.get("/admin/metrics")
async def admin_metrics(user: User = Depends(require_admin)):
    return metrics.snapshot()


@router.get("/admin/gaps")
async def content_gaps(user: User = Depends(require_admin)):
    """Refused questions grouped by topic, with the closest existing concept: what to write next."""
    if db.pool is None:
        return {"clusters": [], "total": 0}
    await db.execute("delete from content_gaps where created_at < now() - make_interval(days => %s)", (RETENTION_DAYS,))
    rows = await db.fetch_all("select question from content_gaps order by created_at desc limit %s", (MAX_ROWS,))
    pipe = await get_pipeline()

    def work():
        clusters = cluster([r["question"] for r in rows], pipe.embedder)
        return nearest_concepts(clusters, pipe.store.list_documents(), pipe.embedder)
    return {"clusters": (await asyncio.to_thread(work))[:12], "total": len(rows), "retention_days": RETENTION_DAYS}
