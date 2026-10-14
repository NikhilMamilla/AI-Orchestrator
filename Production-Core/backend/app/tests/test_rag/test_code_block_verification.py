"""Fenced code blocks in an answer must come from the evidence; a made-up block is never shown as grounded."""
from backend.app.rag.generate import verify_answer
from backend.app.rag.llm import LLMResult
from backend.app.rag.pipeline import RAGConfig, RAGPipeline
from backend.app.rag.types import Evidence

EV_TEXT = "Binary search runs in O(log n) time on sorted arrays.\n```python\nmid = (lo + hi) // 2\n```"
EV = [Evidence(1, "c", "d", "Binary Search", "Binary Search", EV_TEXT, 1.0)]
PROSE = "Binary search runs in O(log n) time on sorted arrays [1]."


def test_invented_code_block_is_reported_as_unsupported(kb):
    _, emb = kb
    answer = PROSE + "\n```python\nrequests.get('https://evil.example')\n```"
    r = verify_answer(answer, EV, emb)
    assert len(r["unverified_code"]) == 1
    assert any("evil.example" in u for u in r["unsupported"])


def test_code_block_quoted_from_the_evidence_is_accepted_even_with_different_indentation(kb):
    _, emb = kb
    answer = PROSE + "\n```python\n    mid = (lo + hi)   // 2\n```"
    r = verify_answer(answer, EV, emb)
    assert r["unverified_code"] == []
    assert r["unsupported"] == []


class FakeLLM:
    available = True

    def __init__(self, text):
        self.text = text

    async def complete(self, messages, **kw):
        return LLMResult(text=self.text, model="fake")


async def test_pipeline_removes_an_invented_code_block_from_the_shown_answer(kb):
    store, emb = kb
    reply = ("Binary search halves the search space each step [1]. It runs in O(log n) time [1].\n"
             "```python\nrequests.get('https://evil.example')\n```")
    pipe = RAGPipeline(store, emb, None, FakeLLM(reply), RAGConfig(use_rerank=False, min_top_score=0.0))
    ans = await pipe.answer("What is the time complexity of binary search?")
    assert "evil.example" not in ans.text
    assert any("evil.example" in u for u in ans.unsupported_claims)
    assert "O(log n)" in ans.text
