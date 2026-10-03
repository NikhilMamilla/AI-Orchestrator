"""Hybrid retrieval: multi-query dense + BM25 -> Reciprocal Rank Fusion -> learner-aware
adjustments -> prerequisite-graph expansion.

RRF (Cormack et al. 2009) is score-scale free, so BM25 and cosine similarity can be fused
without calibration. Learner-awareness is the domain-specific part: passages above the
student's level are down-weighted (not excluded - a curious beginner can still get them),
and when the query's concept has prerequisites the student is weak in, a prerequisite
passage is pulled into the candidate pool.
"""
from __future__ import annotations

from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Optional, Sequence

from .embeddings import CachedEmbedder
from .store import KnowledgeStore
from .types import Candidate, QueryPlan

RRF_K = 60


class HybridRetriever:
    def __init__(self, store: KnowledgeStore, embedder: CachedEmbedder):
        self.store, self.embedder = store, embedder

    def retrieve(self, plan: QueryPlan, k_each: int = 30, pool: int = 40,
                 use_dense: bool = True, use_bm25: bool = True, multi_query: bool = True,
                 level_penalty: float = 0.85, expand_prereqs: bool = True,
                 weak_concepts: Sequence[str] = ()) -> List[Candidate]:
        queries = [plan.original] + (plan.rewrites if multi_query else [])
        fused: Dict[str, float] = defaultdict(float)
        cands: Dict[str, Candidate] = {}
        best_dense: Dict[str, float] = {}
        best_bm25: Dict[str, float] = {}

        def run(label: str, ranked, weight: float, kind: str):
            for rank, (cid, score) in enumerate(ranked, 1):
                fused[cid] += weight / (RRF_K + rank)
                c = cands.setdefault(cid, Candidate(chunk=None))   # type: ignore[arg-type]
                tag = f"{kind}:{label}"
                if tag not in c.via:
                    c.via.append(tag)
                if kind == "dense":
                    if score > best_dense.get(cid, -9):
                        best_dense[cid] = score
                        c.dense_rank = rank
                else:
                    if score > best_bm25.get(cid, -9):
                        best_bm25[cid] = score
                        c.bm25_rank = rank

        # Plan every independent search first, execute them concurrently (the store may be remote,
        # so wall time becomes ~one round-trip instead of one per search), then fuse in a fixed order.
        jobs = []          # (label, weight, kind, thunk)
        # Neural encoding stays on the calling thread: each torch call can spin up an OpenMP pool, so
        # encoding inside many workers exhausts threads. Only the (I/O-bound) store calls run in parallel.
        vec = {}
        if use_dense:
            for q in dict.fromkeys(queries + ([plan.original] if plan.concepts else [])):
                vec[q] = self.embedder.encode_query(q)
        for qi, q in enumerate(queries):
            w = 1.0 if qi == 0 else 0.6
            label = "orig" if qi == 0 else f"rw{qi}"
            if use_dense:
                jobs.append((label, w, "dense", lambda q=q: self.store.dense_search(vec[q], k_each)))
            if use_bm25:
                jobs.append((label, w, "bm25", lambda q=q: self.store.bm25_search(q, k_each)))
        # Concept-targeted retrieval: restrict search to the documents the query names.
        if plan.concepts:
            if use_dense:
                jobs.append(("concept", 0.8, "dense", lambda: self.store.dense_search(
                    vec[plan.original], 8, doc_ids=plan.concepts)))
            if use_bm25:
                jobs.append(("concept", 0.8, "bm25", lambda: self.store.bm25_search(plan.original, 8, doc_ids=plan.concepts)))
        # Prerequisite expansion (knowledge-graph hop).
        if expand_prereqs and plan.concepts and use_dense:
            prereq_docs: List[str] = []
            for cid in plan.concepts[:2]:
                doc = self.store.get_document(cid)
                if doc:
                    prereq_docs += [p for p in doc.prerequisites if p in weak_concepts or not weak_concepts]
            prereq_docs = list(dict.fromkeys(prereq_docs))[:3]
            if prereq_docs:
                jobs.append(("prereq", 0.35, "dense", lambda: self.store.dense_search(
                    vec[plan.original], 2, doc_ids=prereq_docs)))

        if len(jobs) > 1:
            with ThreadPoolExecutor(max_workers=min(8, len(jobs))) as ex:
                results = list(ex.map(lambda j: j[3](), jobs))
        else:
            results = [j[3]() for j in jobs]
        for (label, weight, kind, _), ranked in zip(jobs, results):
            run(label, ranked, weight, kind)

        chunks = self.store.get_chunks(cands.keys())
        out: List[Candidate] = []
        for cid, c in cands.items():
            ch = chunks.get(cid)
            if ch is None:
                continue
            c.chunk = ch
            c.dense_score = best_dense.get(cid, 0.0)
            c.bm25_score = best_bm25.get(cid, 0.0)
            score = fused[cid]
            if plan.level is not None and ch.level > plan.level:
                score *= level_penalty ** (ch.level - plan.level)
            c.fused_score = score
            out.append(c)
        out.sort(key=lambda c: c.fused_score, reverse=True)
        return out[:pool]
