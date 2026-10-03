"""End-to-end RAG pipeline.

screen -> understand -> hybrid retrieve (multi-query dense+BM25, RRF, level-aware,
prereq hop) -> cross-encoder rerank -> parent-child context + compression ->
evidence gate -> grounded generation -> claim verification & citation repair.

Every stage is timed in the trace and reported through `on_stage` *only when it really
runs*, so the UI's progress display is a faithful view of the system, not an animation.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field, replace
from typing import Any, Awaitable, Callable, Dict, List, Mapping, Optional, Sequence

from .generate import (SENTINEL, build_messages, confidence, extractive_answer, normalize_citations,
                       repair_citations, verify_answer)
from .guard import QueryRejected, screen_query
from .llm import LLMUnavailable
from .observability import Trace, metrics
from .personalize import assess
from .query import QueryAnalyzer, keywords
from .rerank import CrossEncoderReranker, build_evidence
from .retrieval import HybridRetriever
from .store import KnowledgeStore
from .types import LEVELS, Answer, Candidate, Evidence, QueryPlan

logger = logging.getLogger(__name__)
StageCb = Optional[Callable[[str, Dict[str, Any]], Awaitable[None]]]

INSUFFICIENT_MSG = ("I couldn't find enough support for that in the course material, so I won't "
                    "guess. Try rephrasing, name the concept, or upload a source that covers it.")


@dataclass
class RAGConfig:
    use_dense: bool = True
    use_bm25: bool = True
    multi_query: bool = True
    expand_prereqs: bool = True
    use_rerank: bool = True
    use_compression: bool = True
    k_each: int = 30
    pool: int = 12                    # candidates sent to the cross-encoder (latency is linear in this)
    top_n: int = 6
    evidence_items: int = 4
    min_top_score: float = 0.14       # evidence gate; calibrated by `rag.eval` on out-of-scope queries
    min_kw_coverage: float = 0.34
    support_threshold: float = 0.45           # lexical+embedding verifier
    nli_weight: float = 0.35                  # blend weight of NLI entailment (0.65 over-flags paraphrased answers; docs/eval/verifier.md)
    nli_floor: float = 0.22                   # below this a claim is 'unsupported'; between floor and threshold it is 'partly supported'
    nli_support_threshold: float = 0.34       # blend score; calibrated on real generated answers (docs/eval/verifier_generation.md)
    semantic_guard_threshold: float = 0.72    # lowest threshold with 0 false positives on 101 benign questions (docs/eval/redteam.md)


class RAGPipeline:
    def __init__(self, store: KnowledgeStore, embedder, reranker: Optional[CrossEncoderReranker] = None,
                 llm=None, config: Optional[RAGConfig] = None, nli=None, guard=None):
        self.store, self.embedder = store, embedder
        self.reranker = reranker or CrossEncoderReranker(enabled=False)
        self.llm, self.cfg, self.nli, self.guard = llm, config or RAGConfig(), nli, guard
        self.retriever = HybridRetriever(store, embedder)
        self._analyzer: Optional[QueryAnalyzer] = None
        self._analyzer_docs = -1

    # ----- helpers -----
    def analyzer(self) -> QueryAnalyzer:
        n = self.store.stats()["documents"]
        if self._analyzer is None or n != self._analyzer_docs:
            self._analyzer, self._analyzer_docs = QueryAnalyzer(self.store.list_documents()), n
        return self._analyzer

    def titles(self) -> Dict[str, str]:
        return {d.id: d.title for d in self.store.list_documents()}

    # ----- retrieval only (used by eval and by the knowledge agent) -----
    def retrieve(self, query: str, level: int = 1, weak_concepts: Sequence[str] = ()
                 ) -> tuple[QueryPlan, List[Candidate], List[Candidate]]:
        plan = self.analyzer().analyze(query, level=level)
        cands = self.retriever.retrieve(
            plan, k_each=self.cfg.k_each, pool=self.cfg.pool, use_dense=self.cfg.use_dense,
            use_bm25=self.cfg.use_bm25, multi_query=self.cfg.multi_query,
            expand_prereqs=self.cfg.expand_prereqs, weak_concepts=weak_concepts)
        if self.cfg.use_rerank:
            ranked = self.reranker.rerank(plan.original, list(cands), top_n=self.cfg.top_n)
        else:
            for c in cands:
                c.rerank_score = None
            ranked = cands[: self.cfg.top_n]
        return plan, cands, ranked

    # ----- full answer -----
    async def answer(self, query: str, level: str = "beginner", style: str = "default",
                     weak_concepts: Sequence[str] = (), history: Sequence[Dict[str, str]] = (),
                     on_stage: StageCb = None, on_token: Optional[Callable[[str], Awaitable[None]]] = None,
                     mastery: Optional[Mapping[str, float]] = None, tone: str = "neutral") -> Answer:
        trace = Trace(len(query or ""))

        async def emit(name: str, **info):
            if on_stage:
                try:
                    await on_stage(name, info)
                except Exception:                         # a dead websocket must not kill the request
                    logger.debug("stage callback failed", exc_info=True)

        def done(ans: Answer, **extra) -> Answer:
            trace.set(status=ans.status, confidence=ans.confidence,
                      embedder=getattr(self.embedder, "name", "?"),
                      reranker=self.reranker.name, **extra)
            ans.trace = trace.finish()
            metrics.record(ans.trace)
            return ans

        try:
            with trace.stage("screen"):
                await emit("screen")
                q = screen_query(query)
                if self.guard is not None and self.guard.score(q) >= self.cfg.semantic_guard_threshold:
                    raise QueryRejected(                       # paraphrased / translated / obfuscated attack
                        "That looks like an attempt to change my instructions. Ask a question about the "
                        "learning material instead.", "prompt_injection")
        except QueryRejected as e:
            return done(Answer(text=e.reason, status="rejected", confidence=0.0, citations=[],
                               unsupported_claims=[], evidence=[], trace={}), failure=e.code)

        lvl = LEVELS.get(level, 1)
        try:
            with trace.stage("understand") as st:
                await emit("understand")
                plan = await asyncio.to_thread(lambda: self.analyzer().analyze(q, level=lvl))
                st.update(intent=plan.intent, concepts=plan.concepts, rewrites=len(plan.rewrites))
                if mastery is not None:                    # personalise from measured mastery (BKT), never guessed
                    docs = await asyncio.to_thread(self.store.list_documents)
                    pers = assess(plan.concepts, docs, mastery)
                    if pers:
                        if level == "auto":
                            level = pers["suggested_level"]
                            plan.level = LEVELS.get(level, 1)
                        weak_concepts = list(dict.fromkeys([*weak_concepts, *(p["id"] for p in pers["prerequisites_to_revisit"])]))
                        pers["level_used"] = level
                        trace.set(personalization=pers)
                if level == "auto":
                    level = "beginner"
            with trace.stage("retrieve") as st:
                await emit("retrieve", queries=1 + len(plan.rewrites))
                cands = await asyncio.to_thread(
                    lambda: self.retriever.retrieve(
                        plan, k_each=self.cfg.k_each, pool=self.cfg.pool, use_dense=self.cfg.use_dense,
                        use_bm25=self.cfg.use_bm25, multi_query=self.cfg.multi_query,
                        expand_prereqs=self.cfg.expand_prereqs, weak_concepts=weak_concepts))
                st.update(candidates=len(cands))
            with trace.stage("rerank") as st:
                await emit("rerank", candidates=len(cands))
                if self.cfg.use_rerank:
                    ranked = await asyncio.to_thread(self.reranker.rerank, plan.original, list(cands), self.cfg.top_n)
                else:
                    ranked = cands[: self.cfg.top_n]
                st.update(model=self.reranker.name if self.cfg.use_rerank else "off", kept=len(ranked))
            with trace.stage("context") as st:
                await emit("context")
                evidence = build_evidence(
                    plan.original, ranked, self.store, self.titles(), max_items=self.cfg.evidence_items,
                    char_budget=900 if self.cfg.use_compression else 10_000)
                st.update(evidence=len(evidence))
        except Exception as e:
            logger.exception("retrieval failure")
            return done(Answer(text="The knowledge base is temporarily unavailable. Please try again.",
                               status="error", confidence=0.0, citations=[], unsupported_claims=[],
                               evidence=[], trace={}), failure=f"retrieval:{type(e).__name__}")

        # ---- evidence gate: refuse before spending a model call ----
        top = max((c.rerank_score if c.rerank_score is not None else c.fused_score for c in ranked[:1]),
                  default=0.0)
        q_kw = set(keywords(plan.original))
        ev_kw = set(keywords(" ".join(e.text + " " + e.heading_path + " " + e.doc_title for e in evidence)))
        coverage = len(q_kw & ev_kw) / max(1, len(q_kw))
        trace.set(top_score=round(float(top), 4), kw_coverage=round(coverage, 3), retrieved=len(cands),
                  evidence_items=len(evidence), intent=plan.intent, warnings=plan.warnings)
        gate_score = top if self.cfg.use_rerank else min(1.0, (ranked[0].dense_score if ranked else 0.0))
        if not evidence or gate_score < self.cfg.min_top_score or coverage < self.cfg.min_kw_coverage:
            return done(Answer(text=INSUFFICIENT_MSG, status="insufficient_evidence", confidence=0.0,
                               citations=[], unsupported_claims=[], evidence=evidence, trace={}),
                        gate="low_evidence")

        # ---- generation (with graceful degradation) ----
        text, model, tokens, mode = "", "extractive", 0, "extractive"
        if self.llm and self.llm.available:
            try:
                with trace.stage("generate") as st:
                    await emit("generate")
                    msgs = build_messages(plan.original, evidence, level, style, history, tone)
                    res = await self.llm.complete(msgs)
                    text, model, mode = res.text.strip(), res.model, "llm"
                    tokens = res.prompt_tokens + res.completion_tokens
                    st.update(model=model, tokens=tokens, cached=res.cached)
                    trace.set(cache_hit=res.cached)
            except LLMUnavailable as e:
                logger.warning("LLM unavailable: %s", e)
                trace.set(failure="llm_unavailable")
        if mode == "llm" and SENTINEL in text:
            return done(Answer(text=INSUFFICIENT_MSG, status="insufficient_evidence", confidence=0.0,
                               citations=[], unsupported_claims=[], evidence=evidence, trace={}),
                        gate="model_declined", model=model, tokens_total=tokens)
        if not text:
            text = extractive_answer(plan.original, evidence)
            mode = "extractive"

        text = normalize_citations(text)
        # ---- verification ----
        with trace.stage("verify") as st:
            await emit("verify")
            threshold = self.cfg.nli_support_threshold if self.nli is not None else self.cfg.support_threshold
            report = await asyncio.to_thread(verify_answer, text, evidence, self.embedder, threshold,
                                             self.nli, self.cfg.nli_weight,
                                             self.cfg.nli_floor if self.nli is not None else None)
            text = repair_citations(text, report)
            st.update(claims=len(report["claims"]), unsupported=len(report["unsupported"]), verifier=report["verifier"])
            trace.set(claim_checks=[{"text": c["text"][:240], "support": c["support"], "supported": c["supported"],
                                     "entailment": c["entailment"], "status": c["status"], "cited": c["cited"] or ([c["repaired_ref"]] if c["repaired_ref"] else [])}
                                    for c in report["claims"]], verifier=report["verifier"])
        conf = confidence(float(top), report, len(evidence))
        used = sorted({n for c in report["claims"] for n in c["cited"]} |
                      {c["repaired_ref"] for c in report["claims"] if c["repaired_ref"]})
        by_ref = {e.ref: e for e in evidence}
        citations = [{"ref": n, "chunk_id": by_ref[n].chunk_id, "doc_id": by_ref[n].doc_id,
                      "title": by_ref[n].doc_title, "section": by_ref[n].heading_path,
                      "score": round(by_ref[n].score, 3)} for n in used if n in by_ref]
        status = "grounded"
        if report["claims"] and len(report["unsupported"]) / len(report["claims"]) > 0.5:
            status = "insufficient_evidence"
            text = INSUFFICIENT_MSG
            citations, conf = [], 0.0
        if on_token and status == "grounded":
            await on_token(text)
        return done(Answer(text=text, status=status, confidence=conf, citations=citations,
                           unsupported_claims=report["unsupported"], evidence=evidence, trace={}),
                    model=model, mode=mode, tokens_total=tokens,
                    invalid_citations=report["invalid_citations"],
                    mean_support=round(report["mean_support"], 3))
