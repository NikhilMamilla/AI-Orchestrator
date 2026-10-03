"""Adapter that gives the Knowledge Agent access to the hybrid RAG pipeline.

Retrieval (query understanding, multi-query dense+BM25 with RRF fusion, learner-level weighting,
prerequisite hop, cross-encoder rerank) lives in `backend.app.rag`; this class only converts the
ranked passages into the per-concept results the agent consumes.
"""
from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Sequence

from backend.app.models.concept import Concept
from backend.app.rag.pipeline import RAGPipeline as HybridPipeline
from backend.app.rag.types import LEVELS
from backend.app.services.concept_service import ConceptService


class RAGPipeline:
    def __init__(self, pipeline: HybridPipeline, concept_service: ConceptService):
        self.pipeline = pipeline
        self.concept_service = concept_service

    async def retrieve(self, query: str, n_results: int = 3, level: str = "beginner",
                       weak_concepts: Sequence[str] = ()) -> List[Dict[str, Any]]:
        """Return up to n_results distinct concepts, best first.

        A concept named explicitly in the query (e.g. "binary search") is always ranked first;
        remaining slots are filled from the reranked passages' parent documents.
        """
        plan, _, ranked = await asyncio.to_thread(
            self.pipeline.retrieve, query, LEVELS.get(level, 1), tuple(weak_concepts))
        titles = {d.id: d.title for d in self.pipeline.store.list_documents()}
        best: Dict[str, Dict[str, Any]] = {}
        for c in ranked:
            score = c.rerank_score if c.rerank_score is not None else c.fused_score
            cur = best.get(c.chunk.doc_id)
            if cur is None or score > cur["score"]:
                best[c.chunk.doc_id] = {"concept_id": c.chunk.doc_id, "slug": c.chunk.doc_id,
                                        "title": titles.get(c.chunk.doc_id, c.chunk.doc_id),
                                        "score": float(score), "document": c.chunk.text}
        ordered = sorted(best.values(), key=lambda d: d["score"], reverse=True)
        for rank, cid in enumerate(plan.concepts):          # explicit mentions win
            hit = best.get(cid) or {"concept_id": cid, "slug": cid, "title": titles.get(cid, cid),
                                    "score": 1.0, "document": ""}
            ordered = [hit] + [d for d in ordered if d["concept_id"] != cid]
        return ordered[:n_results]

    async def get_full_content(self, concept_ids: List[str]) -> List[Concept]:
        found = [await self.concept_service.get_concept_by_id(cid) for cid in concept_ids]
        return [c for c in found if c]
