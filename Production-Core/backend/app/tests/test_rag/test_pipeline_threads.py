"""Blocking work in the pipeline (the semantic guard may call a remote embedder, evidence building reads the database)
must not run on the event loop, or one slow call freezes every other request."""
import threading

from backend.app.rag import pipeline as pipeline_mod
from backend.app.rag.pipeline import RAGConfig, RAGPipeline
from backend.app.tests.test_rag.test_pipeline import FakeLLM


class RecordingGuard:
    def __init__(self):
        self.threads = []

    def score(self, q):
        self.threads.append(threading.get_ident())
        return 0.0


async def test_guard_and_evidence_building_run_off_the_event_loop(kb, monkeypatch):
    store, emb = kb
    loop_thread = threading.get_ident()
    seen = []
    real = pipeline_mod.build_evidence

    def recording(*a, **kw):
        seen.append(threading.get_ident())
        return real(*a, **kw)

    monkeypatch.setattr(pipeline_mod, "build_evidence", recording)
    pipe = RAGPipeline(store, emb, None, FakeLLM("Binary search halves the search space each step [1]."),
                       RAGConfig(use_rerank=False, min_top_score=0.0))
    guard = RecordingGuard()
    pipe.guard = guard
    ans = await pipe.answer("What is the time complexity of binary search?")
    assert ans.status == "grounded"
    assert guard.threads and all(t != loop_thread for t in guard.threads)
    assert seen and all(t != loop_thread for t in seen)
