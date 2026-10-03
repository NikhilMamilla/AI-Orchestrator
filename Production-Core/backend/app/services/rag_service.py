"""Process-wide RAG singleton: store + embedder + reranker + LLM, ingested incrementally at startup."""
from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path
from typing import Optional

from backend.app.config import settings
from backend.app.rag.embeddings import load_embedder
from backend.app.rag.ingest import Ingestor
from backend.app.rag.pipeline import RAGConfig, RAGPipeline
from backend.app.rag.guard import SemanticGuard
from backend.app.rag.nli import load_nli
from backend.app.rag.rerank import CrossEncoderReranker
from backend.app.rag.store import KnowledgeStore
from backend.app.services.llm import get_router

logger = logging.getLogger(__name__)
KNOWLEDGE_DIR = Path(__file__).resolve().parents[3] / "data" / "knowledge"

_pipeline: Optional[RAGPipeline] = None
_ingestor: Optional[Ingestor] = None
_store = None
_lock = asyncio.Lock()
_store_lock = asyncio.Lock()


def _make_store():
    if settings.DATABASE_URL:
        from backend.app.rag.pg_store import PostgresKnowledgeStore
        return PostgresKnowledgeStore(settings.DATABASE_URL)       # Supabase: pgvector + FTS
    return KnowledgeStore(settings.RAG_DB_PATH)                    # local SQLite: dev / offline


def _build() -> tuple[RAGPipeline, Ingestor]:
    store = _store or _make_store()                               # the one get_store() already opened, if any
    embedder = load_embedder(prefer_neural=settings.RAG_NEURAL)
    reranker = CrossEncoderReranker(enabled=settings.RAG_NEURAL)
    llm = get_router()                                       # shared with the agents
    ingestor = Ingestor(store, embedder)
    report = ingestor.ingest_directory(KNOWLEDGE_DIR)          # incremental: unchanged docs are skipped
    logger.info("RAG ready: %s | embedder=%s reranker=%s llm=%s | ingest: +%d ~%d =%d !%d",
                store.stats(), embedder.name, reranker.name, ",".join(p.name for p in llm.providers) or "none",
                len(report.added), len(report.updated), len(report.unchanged), len(report.failed))
    nli = load_nli(enabled=settings.RAG_NEURAL)               # entailment-based claim verification
    guard = SemanticGuard(embedder) if settings.RAG_NEURAL else None      # needs real embeddings to be meaningful
    return RAGPipeline(store, embedder, reranker, llm, RAGConfig(), nli, guard), ingestor


async def get_pipeline() -> RAGPipeline:
    global _pipeline, _ingestor
    if _pipeline is None:
        async with _lock:
            if _pipeline is None:
                _pipeline, _ingestor = await asyncio.to_thread(_build)   # heavy model load off the event loop
    return _pipeline


async def get_store():
    """The knowledge store alone, without the models: what the dashboard, the learning path and the concept pages read.
    It never waits for the embedder, reranker and NLI weights, so those pages answer at once while the models load."""
    global _store
    if _pipeline is not None:
        return _pipeline.store
    if _store is None:
        async with _store_lock:
            if _store is None:
                _store = await asyncio.to_thread(_make_store)
    return _store


def warm_up() -> None:
    """Start loading the models in the background as the server starts, so the first question does not wait for them."""
    if "pytest" in sys.modules:                                    # the offline test suite never loads model weights
        return
    async def run():
        try:
            await get_pipeline()
        except Exception:                                          # noqa: BLE001 - a failed warm-up retries on first use
            logger.exception("RAG warm-up failed; it will load on first use")
    asyncio.get_running_loop().create_task(run())


async def get_ingestor() -> Ingestor:
    await get_pipeline()
    assert _ingestor is not None
    return _ingestor
