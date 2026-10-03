"""Question inspector: run a question through screening, understanding, retrieval, reranking and the evidence gate,
exactly as /rag/ask does, and stop before generation. No model call, no content-gap row, no request log."""
from __future__ import annotations

from typing import Any, Dict

from backend.app.rag.guard import QueryRejected, screen_query
from backend.app.rag.query import keywords
from backend.app.rag.rerank import build_evidence

LEVELS = {"beginner": 1, "intermediate": 2, "advanced": 3}


def inspect(pipe, query: str, level: str = "beginner") -> Dict[str, Any]:
    cfg = pipe.cfg
    out: Dict[str, Any] = {"query": query, "level": level}
    try:
        q = screen_query(query)
        guard = round(float(pipe.guard.score(q)), 3) if pipe.guard is not None else None
        out["screen"] = {"passed": guard is None or guard < cfg.semantic_guard_threshold, "guard_score": guard,
                         "guard_threshold": cfg.semantic_guard_threshold, "reason": None}
        if not out["screen"]["passed"]:
            out["screen"]["reason"] = "Semantic guard: reads like an attempt to change the tutor's instructions."
            return out
    except QueryRejected as e:
        out["screen"] = {"passed": False, "guard_score": None, "guard_threshold": cfg.semantic_guard_threshold,
                         "reason": f"{e.code}: {e.reason}"}
        return out

    plan, cands, ranked = pipe.retrieve(q, level=LEVELS.get(level, 1))
    titles = pipe.titles()
    out["plan"] = {"intent": plan.intent, "concepts": [{"id": c, "title": titles.get(c, c)} for c in plan.concepts],
                   "rewrites": plan.rewrites, "warnings": plan.warnings}
    kept = {c.chunk.id for c in ranked}

    def row(c, rank):
        return {"rank": rank, "chunk_id": c.chunk.id, "doc_id": c.chunk.doc_id, "doc_title": titles.get(c.chunk.doc_id, c.chunk.doc_id),
                "heading": c.chunk.heading_path, "text": c.chunk.text[:360],
                "dense": round(float(c.dense_score), 4), "bm25": round(float(c.bm25_score), 4),
                "fused": round(float(c.fused_score), 4),
                "rerank": None if c.rerank_score is None else round(float(c.rerank_score), 4),
                "via": list(dict.fromkeys(c.via))[:4], "kept": c.chunk.id in kept}

    out["candidates"] = [row(c, i + 1) for i, c in enumerate(ranked)] + \
                        [row(c, None) for c in cands if c.chunk.id not in kept][:6]
    out["retrieved"] = len(cands)

    evidence = build_evidence(plan.original, ranked, pipe.store, titles, max_items=cfg.evidence_items,
                              char_budget=900 if cfg.use_compression else 10_000)
    top = max((c.rerank_score if c.rerank_score is not None else c.fused_score for c in ranked[:1]), default=0.0)
    gate_score = top if cfg.use_rerank else min(1.0, (ranked[0].dense_score if ranked else 0.0))
    q_kw = set(keywords(plan.original))
    ev_kw = set(keywords(" ".join(e.text + " " + e.heading_path + " " + e.doc_title for e in evidence)))
    coverage = len(q_kw & ev_kw) / max(1, len(q_kw))
    reasons = []
    if not evidence:
        reasons.append("no evidence passages")
    if gate_score < cfg.min_top_score:
        reasons.append(f"top score {gate_score:.3f} is below {cfg.min_top_score}")
    if coverage < cfg.min_kw_coverage:
        reasons.append(f"keyword coverage {coverage:.0%} is below {cfg.min_kw_coverage:.0%}")
    out["gate"] = {"answer": not reasons, "top_score": round(float(gate_score), 4), "min_top_score": cfg.min_top_score,
                   "coverage": round(coverage, 3), "min_coverage": cfg.min_kw_coverage,
                   "missing_keywords": sorted(q_kw - ev_kw)[:12], "reasons": reasons}
    out["evidence"] = [{"ref": e.ref, "doc_title": e.doc_title, "heading": e.heading_path, "score": round(float(e.score), 4),
                        "text": e.text[:420]} for e in evidence]
    return out
