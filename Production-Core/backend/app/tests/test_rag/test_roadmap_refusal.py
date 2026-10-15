"""A refusal about a roadmap topic that has no course note yet says so, instead of a generic "not enough evidence"."""
import asyncio
from pathlib import Path

from backend.app.rag.llm import LLMResult
from backend.app.rag.pipeline import INSUFFICIENT_MSG, RAGConfig, RAGPipeline
from backend.app.rag.roadmap import load_roadmap

ROOT = Path(__file__).resolve().parents[4]
ROADMAP = ROOT / "data" / "curriculum" / "dsa_roadmap.md"


def test_the_backend_copy_of_the_roadmap_is_the_curriculum_file():
    assert ROADMAP.read_bytes() == (ROOT.parent / "curriculum" / "dsa_roadmap.md").read_bytes()


def test_a_topic_on_the_roadmap_without_notes_is_named(kb):
    store, _ = kb
    rm = load_roadmap(ROADMAP)
    docs = store.list_documents()
    hit = rm.uncovered_mention("How do segment trees handle range queries?", docs)
    assert hit is not None and hit.name.lower().startswith("segment tree")
    assert rm.uncovered_mention("What is a Fenwick tree?", docs).name.lower().startswith("fenwick")
    assert rm.uncovered_mention("Explain Mo's algorithm", docs) is not None


def test_a_topic_that_has_notes_or_is_not_on_the_roadmap_is_not_flagged(kb):
    store, _ = kb
    rm, docs = load_roadmap(ROADMAP), store.list_documents()
    assert rm.uncovered_mention("How does binary search work?", docs) is None             # there is a note
    assert rm.uncovered_mention("How do I bake sourdough bread?", docs) is None           # not DSA at all
    assert rm.uncovered_mention("What is the weather today?", docs) is None


class NoCallLLM:
    available = True

    async def complete(self, messages, **kw):
        raise AssertionError("a refusal must not call the model")


def ask(kb, question, roadmap):
    store, emb = kb
    pipe = RAGPipeline(store, emb, None, NoCallLLM(), RAGConfig(use_rerank=False), roadmap=roadmap)
    return asyncio.run(pipe.answer(question))


def test_the_refusal_names_the_roadmap_topic(kb):
    ans = ask(kb, "How do segment trees handle range queries?", load_roadmap(ROADMAP))
    assert ans.status == "insufficient_evidence"
    assert "roadmap" in ans.text.lower() and "segment tree" in ans.text.lower() and "notes yet" in ans.text.lower()
    assert "won't guess" in ans.text.lower() or "can't answer" in ans.text.lower()


def test_without_a_roadmap_or_for_other_topics_the_generic_refusal_stays(kb):
    assert ask(kb, "How do segment trees handle range queries?", None).text == INSUFFICIENT_MSG
    assert ask(kb, "How do I bake sourdough bread with a wild yeast starter?", load_roadmap(ROADMAP)).text == INSUFFICIENT_MSG
