"""Regression floor on retrieval quality, using the offline embedder so CI needs no model download.
The neural numbers (higher) are produced by `python -m backend.app.rag.evaluation --neural`."""
import json
from pathlib import Path

from backend.app.rag.evaluation import relevant_ids, retrieval_metrics
from backend.app.rag.pipeline import RAGConfig, RAGPipeline

QS = json.loads((Path(__file__).resolve().parents[4] / "data" / "eval" / "questions.json")
                .read_text(encoding="utf-8"))["items"]


def test_every_gold_label_resolves_to_a_real_passage(kb):
    store, _ = kb
    for it in QS:
        if it["kind"] in ("direct", "paraphrase", "multi"):
            assert relevant_ids(store, it), f"gold phrase not found: {it['q']}"


def test_hybrid_meets_floor_and_fusion_helps(kb):
    store, emb = kb
    scoped = [i for i in QS if i["kind"] in ("direct", "paraphrase", "multi")]

    def recall3(cfg):
        pipe = RAGPipeline(store, emb, None, None, cfg)
        total = 0.0
        for it in scoped:
            _, cands, _ = pipe.retrieve(it["q"], level=3)
            total += retrieval_metrics([c.chunk.id for c in cands], relevant_ids(store, it))["recall@3"]
        return total / len(scoped)

    base = RAGConfig(use_rerank=False, multi_query=False, expand_prereqs=False)
    hybrid = recall3(base)
    from dataclasses import replace
    assert hybrid >= 0.75      # offline lexical embedder; neural numbers come from the eval script
    assert recall3(replace(base, use_rerank=True)) >= hybrid - 1e-9   # reranking never hurts recall@3
    assert hybrid >= recall3(replace(base, use_bm25=False)) - 1e-9   # fusion beats the (weak, offline) dense side
