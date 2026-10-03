"""Concepts derived from the corpus + the Knowledge Agent on the real hybrid pipeline (offline embedder)."""
import pytest

from backend.app.agents.knowledge.agent import KnowledgeAgent
from backend.app.agents.knowledge.rag_pipeline import RAGPipeline as KnowledgeRetriever
from backend.app.api.v1.concepts import layout
from backend.app.rag.pipeline import RAGConfig, RAGPipeline
from backend.app.services.concept_service import ConceptService


@pytest.fixture
def agent(kb):
    store, emb = kb
    concepts = ConceptService(store)
    hybrid = RAGPipeline(store, emb, None, None, RAGConfig(use_rerank=False))
    return KnowledgeAgent(KnowledgeRetriever(hybrid, concepts), concepts), concepts


async def test_concept_is_derived_from_corpus(agent):
    _, concepts = agent
    c = await concepts.get_concept_by_id("binary-search")
    assert c.title == "Binary Search" and c.domain == "algorithms" and c.difficulty_level == 1
    assert c.prerequisites == ["arrays", "big-o-complexity"]
    assert "binary-search-tree" in c.leads_to
    assert c.content.code_examples and "def binary_search" in c.content.code_examples[0].code
    assert any("overflow" in m for m in c.content.common_mistakes)
    assert await concepts.get_concept_by_id("nope") is None


async def test_every_concept_builds_and_prerequisites_exist(agent):
    _, concepts = agent
    all_c = await concepts.list_concepts()
    ids = {c.id for c in all_c}
    assert len(all_c) == 26
    for c in all_c:
        assert set(c.prerequisites) <= ids, f"{c.id} has a dangling prerequisite"
        assert c.content.definition and c.content.explanation_beginner


async def test_knowledge_agent_returns_named_concept_first(agent):
    ka, _ = agent
    pkg = await ka.retrieve_content("explain dijkstra shortest path", student_level="advanced")
    assert pkg["slug"] == "dijkstra"
    assert set(pkg["prerequisites"]) >= {"graph-basics", "heap-priority-queue"}
    assert pkg["content"]["definition"]


async def test_knowledge_agent_adapts_examples_to_level(agent):
    ka, _ = agent
    beginner = await ka.retrieve_content("binary search", student_level="beginner")
    assert len(beginner["content"]["code_examples"]) <= 1


async def test_knowledge_agent_prerequisite_content(agent):
    ka, _ = agent
    prereqs = await ka.get_prerequisites_content("linked-list")
    assert [p["slug"] for p in prereqs] == ["arrays"]


async def test_concept_map_layout_is_a_layered_dag(agent):
    _, concepts = agent
    all_c = await concepts.list_concepts()
    pos = layout(all_c)
    assert set(pos) == {c.id for c in all_c}
    for c in all_c:                                   # a prerequisite is always strictly to the left
        for p in c.prerequisites:
            assert pos[p]["x"] < pos[c.id]["x"]
