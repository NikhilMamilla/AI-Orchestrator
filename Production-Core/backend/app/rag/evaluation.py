"""RAG evaluation: retrieval metrics, ablations and evidence-gate calibration.

Run:  python -m backend.app.rag.evaluation [--neural] [--out docs/eval/results.json]

Relevance is judged at passage level: a retrieved passage is relevant if it belongs to a gold
document AND contains the question's gold phrase. Labels are authored independently of
the retriever. Metrics: Recall@K (hit-rate: >=1 relevant passage in top K), Precision@K, MRR and
binary nDCG@K. Out-of-scope / injection items are excluded from retrieval metrics and used to
measure the evidence gate (refusal precision/recall) and the guard.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import statistics
import time
from dataclasses import asdict, replace
from pathlib import Path
from typing import Dict, List, Sequence

from .embeddings import load_embedder
from .guard import QueryRejected, screen_query
from .ingest import Ingestor
from .pipeline import RAGConfig, RAGPipeline
from .rerank import CrossEncoderReranker
from .store import KnowledgeStore

ROOT = Path(__file__).resolve().parents[3]
_ws = re.compile(r"\s+")


def norm(s: str) -> str:
    return _ws.sub(" ", s.lower())


def relevant_ids(store: KnowledgeStore, item: dict) -> set:
    phrase = norm(item["phrase"])
    rel = set()
    for doc_id in item["docs"]:
        rel |= {cid for cid, text in store.passages_for_doc(doc_id) if phrase in norm(text)}
    return rel


def dcg(binary: Sequence[int]) -> float:
    return sum(b / math.log2(i + 2) for i, b in enumerate(binary))


def retrieval_metrics(ranked_ids: List[str], rel: set, ks=(1, 3, 5)) -> Dict[str, float]:
    out: Dict[str, float] = {}
    for k in ks:
        top = ranked_ids[:k]
        hits = [1 if i in rel else 0 for i in top]
        out[f"recall@{k}"] = 1.0 if any(hits) else 0.0
        out[f"precision@{k}"] = sum(hits) / k
        ideal = dcg([1] * min(len(rel), k))
        out[f"ndcg@{k}"] = dcg(hits) / ideal if ideal else 0.0
    rr = 0.0
    for r, i in enumerate(ranked_ids, 1):
        if i in rel:
            rr = 1.0 / r
            break
    out["mrr"] = rr
    return out


def evaluate_config(pipe: RAGPipeline, store: KnowledgeStore, items: List[dict], k: int = 5) -> Dict:
    rows, lat = [], []
    for it in items:
        rel = relevant_ids(store, it)
        t0 = time.perf_counter()
        _, cands, ranked = pipe.retrieve(it["q"], level=3)
        lat.append((time.perf_counter() - t0) * 1000)
        ids = [c.chunk.id for c in (ranked if pipe.cfg.use_rerank else cands)]
        rows.append({"kind": it["kind"], **retrieval_metrics(ids, rel)})
    agg = {m: round(statistics.mean(r[m] for r in rows), 4) for m in rows[0] if m != "kind"}
    by_kind = {}
    for kind in sorted({r["kind"] for r in rows}):
        sub = [r for r in rows if r["kind"] == kind]
        by_kind[kind] = {"n": len(sub), "recall@3": round(statistics.mean(r["recall@3"] for r in sub), 4),
                         "mrr": round(statistics.mean(r["mrr"] for r in sub), 4)}
    lat.sort()
    agg["latency_ms_p50"] = round(lat[len(lat) // 2], 1)
    agg["latency_ms_p95"] = round(lat[min(len(lat) - 1, int(0.95 * len(lat)))], 1)
    return {"n": len(rows), "metrics": agg, "by_kind": by_kind}


def top_scores(pipe: RAGPipeline, items: List[dict]) -> List[float]:
    out = []
    for it in items:
        _, cands, ranked = pipe.retrieve(it["q"], level=3)
        c = ranked[0] if ranked else None
        out.append(0.0 if c is None else (c.rerank_score if c.rerank_score is not None else c.dense_score))
    return out


def calibrate_gate(inscope: List[float], oos: List[float]) -> Dict:
    """Sweep a score threshold; report answer-rate on in-scope and refusal-rate on OOS, and pick
    the threshold maximising balanced accuracy."""
    best, sweep = None, []
    for t in [x / 100 for x in range(0, 100, 2)]:
        ans = sum(s >= t for s in inscope) / len(inscope)
        refuse = sum(s < t for s in oos) / len(oos)
        bal = (ans + refuse) / 2
        sweep.append({"threshold": t, "inscope_answered": round(ans, 3), "oos_refused": round(refuse, 3)})
        if best is None or bal > best["balanced_accuracy"] + 1e-9:
            best = {"threshold": t, "inscope_answered": round(ans, 3), "oos_refused": round(refuse, 3),
                    "balanced_accuracy": round(bal, 3)}
    return {"best": best, "sweep": sweep[::5]}


def build_system(neural: bool, pg: bool = False):
    embedder = load_embedder(prefer_neural=neural)
    if pg:                                   # evaluate the production store (Supabase pgvector + FTS)
        from backend.app.config import settings
        from .pg_store import PostgresKnowledgeStore
        store = PostgresKnowledgeStore(settings.DATABASE_URL)
        Ingestor(store, embedder).ingest_directory(ROOT / "data" / "knowledge")   # no-op when unchanged
    else:
        store = KnowledgeStore(":memory:")
        Ingestor(store, embedder).ingest_directory(ROOT / "data" / "knowledge")
    return store, embedder


def render_markdown(r: Dict) -> str:
    g, ig = r["evidence_gate"]["best"], r["injection_guard"]
    out = [
        "# Retrieval evaluation",
        "",
        f"Store: **{r['store']}** | embedder: `{r['embedder']}` | reranker: `{r['reranker']}` | "
        f"corpus: {r['corpus']['documents']} docs / {r['corpus']['passages']} passages | "
        f"{r['n_scoped']} labelled in-scope questions.",
        "",
        "| Configuration | Recall@1 | Recall@3 | Recall@5 | Precision@3 | MRR | nDCG@5 | p50 latency |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for name, c in r["configs"].items():
        m = c["metrics"]
        out.append(f"| {name} | {m['recall@1']:.3f} | {m['recall@3']:.3f} | {m['recall@5']:.3f} | "
                   f"{m['precision@3']:.3f} | {m['mrr']:.3f} | {m['ndcg@5']:.3f} | {m['latency_ms_p50']} ms |")
    out += [
        "",
        f"**Evidence gate** (refuse out-of-scope questions): best threshold {g['threshold']} answers "
        f"{g['inscope_answered']:.0%} of in-scope questions and refuses {g['oos_refused']:.0%} of out-of-scope ones.",
        "",
        f"**Injection guard:** {ig['rejected']}/{ig['queries']} adversarial queries rejected.",
        "",
    ]
    return chr(10).join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--neural", action="store_true", help="use bge embeddings + cross-encoder")
    ap.add_argument("--pg", action="store_true", help="evaluate against Supabase Postgres (DATABASE_URL)")
    ap.add_argument("--out", default=str(ROOT / "docs" / "eval" / "results.json"))
    args = ap.parse_args()

    store, embedder = build_system(args.neural, args.pg)
    reranker = CrossEncoderReranker(enabled=args.neural)
    data = json.loads((ROOT / "data" / "eval" / "questions.json").read_text(encoding="utf-8"))["items"]
    scoped = [i for i in data if i["kind"] in ("direct", "paraphrase", "multi")]
    oos = [i for i in data if i["kind"] == "oos"]
    inj = [i for i in data if i["kind"] == "injection"]

    base = RAGConfig()
    configs = {
        "bm25_only": replace(base, use_dense=False, multi_query=False, expand_prereqs=False, use_rerank=False),
        "dense_only": replace(base, use_bm25=False, multi_query=False, expand_prereqs=False, use_rerank=False),
        "hybrid_rrf": replace(base, multi_query=False, expand_prereqs=False, use_rerank=False),
        "hybrid+multiquery": replace(base, expand_prereqs=False, use_rerank=False),
        "hybrid+multiquery+rerank": replace(base, expand_prereqs=False),
        "full (+prereq hop)": base,
    }
    results = {"store": "postgres" if args.pg else "sqlite", "embedder": embedder.name, "reranker": reranker.name, "corpus": store.stats(),
               "n_scoped": len(scoped), "configs": {}}
    for name, cfg in configs.items():
        pipe = RAGPipeline(store, embedder, reranker, None, cfg)
        results["configs"][name] = evaluate_config(pipe, store, scoped)
        m = results["configs"][name]["metrics"]
        print(f"{name:28s} R@1={m['recall@1']:.3f} R@3={m['recall@3']:.3f} R@5={m['recall@5']:.3f} "
              f"P@3={m['precision@3']:.3f} MRR={m['mrr']:.3f} nDCG@5={m['ndcg@5']:.3f} p50={m['latency_ms_p50']}ms")

    full = RAGPipeline(store, embedder, reranker, None, base)
    gate = calibrate_gate(top_scores(full, scoped), top_scores(full, oos))
    results["evidence_gate"] = gate
    print("gate calibration:", gate["best"])

    caught = 0
    for it in inj:
        try:
            screen_query(it["q"])
        except QueryRejected:
            caught += 1
    results["injection_guard"] = {"queries": len(inj), "rejected": caught}
    print(f"injection guard: {caught}/{len(inj)} rejected")

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(results, indent=2), encoding="utf-8")
    Path(args.out).with_suffix(".md").write_text(render_markdown(results), encoding="utf-8")
    print("wrote", args.out)


if __name__ == "__main__":
    main()
