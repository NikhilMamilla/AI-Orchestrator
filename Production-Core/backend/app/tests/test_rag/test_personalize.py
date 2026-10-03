"""Mastery-aware answers: level choice and prerequisite hints come from measured mastery only."""
from backend.app.rag.observability import metrics
from backend.app.rag.personalize import assess, level_from_mastery
from backend.app.rag.pipeline import RAGConfig, RAGPipeline


def test_level_thresholds():
    assert level_from_mastery(None) == "beginner" and level_from_mastery(0.39) == "beginner"
    assert level_from_mastery(0.4) == "intermediate" and level_from_mastery(0.74) == "intermediate"
    assert level_from_mastery(0.75) == "advanced"


def test_assess_separates_unpracticed_from_weak(kb):
    store, _ = kb
    docs = store.list_documents()
    prereqs = next(d for d in docs if d.id == "binary-search").prerequisites
    assert prereqs, "fixture corpus should give binary-search a prerequisite"
    out = assess(["binary-search"], docs, {prereqs[0]: 0.2})
    first = next(p for p in out["prerequisites_to_revisit"] if p["id"] == prereqs[0])
    assert first["status"] == "weak" and first["mastery"] == 0.2
    out2 = assess(["binary-search"], docs, {})
    assert all(p["status"] == "unpracticed" and p["mastery"] is None for p in out2["prerequisites_to_revisit"])
    healthy = assess(["binary-search"], docs, {p: 0.9 for p in prereqs})
    assert healthy["prerequisites_to_revisit"] == []


def test_assess_without_known_concept_is_empty(kb):
    store, _ = kb
    assert assess([], store.list_documents(), {"arrays": 0.1}) == {}
    assert assess(["not-a-doc"], store.list_documents(), {}) == {}


async def test_pipeline_auto_level_and_trace(kb):
    store, emb = kb
    pipe = RAGPipeline(store, emb, None, None, RAGConfig(use_rerank=False, min_top_score=0.0, min_kw_coverage=0.0))
    ans = await pipe.answer("Why does binary search need a sorted array?", level="auto", mastery={"binary-search": 0.9})
    p = ans.trace["personalization"]
    assert p["focus"] == "binary-search" and p["level_used"] == "advanced"
    ans2 = await pipe.answer("Why does binary search need a sorted array?", level="auto", mastery={})
    assert ans2.trace["personalization"]["level_used"] == "beginner"
    ans3 = await pipe.answer("Why does binary search need a sorted array?", level="intermediate")
    assert "personalization" not in ans3.trace                       # no mastery supplied -> generic answer


async def test_personalisation_never_reaches_admin_metrics(kb):
    store, emb = kb
    pipe = RAGPipeline(store, emb, None, None, RAGConfig(use_rerank=False, min_top_score=0.0, min_kw_coverage=0.0))
    await pipe.answer("Why does binary search need a sorted array?", level="auto", mastery={"binary-search": 0.5})
    assert all("personalization" not in r for r in metrics.snapshot()["recent"])


async def test_grounded_answer_exposes_per_sentence_checks(kb):
    store, emb = kb
    pipe = RAGPipeline(store, emb, None, None, RAGConfig(use_rerank=False, min_top_score=0.0, min_kw_coverage=0.0))
    ans = await pipe.answer("Why does binary search need a sorted array?")
    checks = ans.trace["claim_checks"]
    assert checks and all({"text", "support", "supported", "cited"} <= set(c) for c in checks)
