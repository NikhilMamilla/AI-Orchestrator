"""External benchmark for the claim verifier on real hallucinations (HaluEval, summarization subset).

HaluEval (Li et al., 2023) pairs each source document with a faithful summary and an LLM-generated
hallucinated one. We treat the document as the retrieved evidence (chunked like our passages) and ask
the verifier to score each summary; a good verifier gives faithful summaries a higher support score.

    python -m backend.app.rag.bench_halu [--n 120] [--refresh]

Reported: ROC-AUC per variant (lexical, NLI, blends) and accuracy/F1 of a threshold chosen on one half of
the data and evaluated on the other (so the reported number is not tuned on its own test set).
"""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
from typing import Dict, List

import httpx
import numpy as np

from .chunking import _pack
from .embeddings import load_embedder
from .generate import verify_answer
from .nli import load_nli
from .types import Evidence

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / "data" / "eval" / "external" / "halueval_summarization.json"
API = "https://datasets-server.huggingface.co/rows"


def fetch(n: int) -> List[dict]:
    rows: List[dict] = []
    per = 100
    offsets = [0, 4000, 8000][: max(1, -(-n // per))]
    for off in offsets:
        r = httpx.get(API, params={"dataset": "pminervini/HaluEval", "config": "summarization", "split": "data",
                                   "offset": off, "length": min(per, n - len(rows))}, timeout=60)
        r.raise_for_status()
        rows += [x["row"] for x in r.json()["rows"]]
    return rows[:n]


def load(n: int, refresh: bool) -> List[dict]:
    if CACHE.exists() and not refresh:
        data = json.loads(CACHE.read_text(encoding="utf-8"))
        if len(data) >= n:
            return data[:n]
    data = fetch(n)
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(data), encoding="utf-8")
    return data


def evidence_from(doc: str) -> List[Evidence]:
    return [Evidence(ref=i + 1, chunk_id=f"d{i}", doc_id="d", doc_title="doc", heading_path="doc", text=p, score=1.0)
            for i, p in enumerate(_pack([("text", doc)]))][:14]


def auroc(pos: np.ndarray, neg: np.ndarray) -> float:
    """P(score of a faithful item > score of a hallucinated one), ties count half (Mann-Whitney U)."""
    both = np.concatenate([pos, neg])
    order = both.argsort(kind="mergesort")
    ranks = np.empty(len(both))
    ranks[order] = np.arange(1, len(both) + 1)
    for v in np.unique(both):                                  # average ranks over ties
        m = both == v
        ranks[m] = ranks[m].mean()
    u = ranks[: len(pos)].sum() - len(pos) * (len(pos) + 1) / 2
    return float(u / (len(pos) * len(neg)))


def best_threshold(scores: np.ndarray, labels: np.ndarray) -> float:
    cands = np.unique(scores)
    accs = [((scores >= t) == labels).mean() for t in cands]
    return float(cands[int(np.argmax(accs))])


def prf(scores: np.ndarray, labels: np.ndarray, t: float) -> Dict[str, float]:
    pred = scores >= t                     # predicted faithful
    tp, fp, fn = ((pred & labels).sum(), (pred & ~labels).sum(), (~pred & labels).sum())
    # report on the hallucination class: that is what the verifier exists to catch
    tp_h, fp_h, fn_h = ((~pred & ~labels).sum(), (~pred & labels).sum(), (pred & ~labels).sum())
    prec = tp_h / max(1, tp_h + fp_h)
    rec = tp_h / max(1, tp_h + fn_h)
    return {"accuracy": float((pred == labels).mean()), "halluc_precision": float(prec), "halluc_recall": float(rec),
            "halluc_f1": float(2 * prec * rec / max(1e-9, prec + rec))}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=120)
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--out", default=str(ROOT / "docs" / "eval" / "verifier_halueval.json"))
    args = ap.parse_args()

    rows = load(args.n, args.refresh)
    embedder = load_embedder(prefer_neural=True)
    nli = load_nli()
    assert nli is not None, "NLI model could not be loaded"
    print(f"{len(rows)} documents -> {2 * len(rows)} summaries; embedder={embedder.name} nli={nli.name}", flush=True)

    recs = []                                              # (is_faithful, [claim dicts])
    for i, r in enumerate(rows):
        ev = evidence_from(r["document"])
        for text, ok in ((r["right_summary"], True), (r["hallucinated_summary"], False)):
            rep = verify_answer(text, ev, embedder, nli=nli, nli_weight=0.65)
            if rep["claims"]:
                recs.append((ok, rep["claims"]))
        if (i + 1) % 20 == 0:
            print(f"  scored {i + 1}/{len(rows)}", flush=True)

    labels = np.array([ok for ok, _ in recs])
    variants = {
        "lexical+embedding (v1)": lambda c: c["lexical"],
        "NLI entailment": lambda c: c["entailment"],
        "blend 0.35 lex + 0.65 NLI": lambda c: 0.35 * c["lexical"] + 0.65 * c["entailment"],
        "blend 0.15 lex + 0.85 NLI": lambda c: 0.15 * c["lexical"] + 0.85 * c["entailment"],
    }
    rng = random.Random(7)
    idx = list(range(len(recs)))
    rng.shuffle(idx)
    half = len(idx) // 2
    tune, test = np.array(idx[:half]), np.array(idx[half:])

    results = {"dataset": "HaluEval summarization", "documents": len(rows), "summaries": len(recs),
               "faithful": int(labels.sum()), "hallucinated": int((~labels).sum()), "nli": nli.name, "variants": {}}
    print(f"\n{'variant':30s} {'agg':5s} {'AUROC':>6s}  {'acc':>5s} {'P(h)':>5s} {'R(h)':>5s} {'F1(h)':>5s}  (threshold tuned on half A, scored on half B)")
    for name, f in variants.items():
        for agg_name, agg in (("mean", np.mean), ("min", np.min)):
            scores = np.array([agg([f(c) for c in claims]) for _, claims in recs])
            au = auroc(scores[labels], scores[~labels])
            t = best_threshold(scores[tune], labels[tune])
            m = prf(scores[test], labels[test], t)
            results["variants"][f"{name} / {agg_name}"] = {"auroc": round(au, 4), "threshold": round(t, 3),
                                                           **{k: round(v, 4) for k, v in m.items()}}
            print(f"{name:30s} {agg_name:5s} {au:6.3f}  {m['accuracy']:5.3f} {m['halluc_precision']:5.3f} "
                  f"{m['halluc_recall']:5.3f} {m['halluc_f1']:5.3f}  t={t:.3f}")
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(results, indent=2), encoding="utf-8")
    print("wrote", args.out)


if __name__ == "__main__":
    main()
