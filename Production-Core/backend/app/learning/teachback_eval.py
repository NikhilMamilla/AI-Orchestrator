"""Does teach-back grading separate good, thin and wrong explanations?

    python -m backend.app.learning.teachback_eval [--docs 14]

Synthetic learners: an LLM writes, for each concept, one accurate own-words explanation, one accurate-but-thin one and
one confident explanation containing deliberate factual errors. The grader (real embedder + NLI, no LLM) scores them
blind to the label. These are LLM-simulated learners, not real students; the report says so.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import statistics
from pathlib import Path

from backend.app.config import settings

from ..rag.embeddings import load_embedder
from ..rag.evaluation import ROOT, build_system
from ..rag.llm import LLMRouter, MistralClient
from ..rag.nli import load_nli
from . import teachback

PROMPT = """You are simulating a student who was just taught "%s". Using this reference material:

%s

Write three explanations of the concept IN YOUR OWN WORDS (do not copy sentences). Reply with JSON only:
{"good": "4-5 sentences, accurate, covers the main ideas",
 "thin": "2 sentences, accurate but vague, covers only one idea",
 "wrong": "4-5 sentences in a confident tone that contain TWO plausible factual errors (for example a wrong complexity, a wrong property or a swapped behaviour)"}"""


def auc(pos, neg):
    wins = sum((p > n) + 0.5 * (p == n) for p in pos for n in neg)
    return wins / (len(pos) * len(neg)) if pos and neg else float("nan")


async def main(n_docs: int, rescore: bool = False) -> None:
    store, _ = build_system(neural=True)
    emb, nli = load_embedder(prefer_neural=True), load_nli()
    llm = LLMRouter([MistralClient(settings.mistral_keys_list)])
    docs = [d for d in store.list_documents()][:n_docs]
    rows = []
    texts: dict = {}
    saved = json.loads((ROOT / "docs" / "eval" / "teachback_texts.json").read_text(encoding="utf-8")) if rescore else {}
    for d in docs:
        if rescore and d.id not in saved:
            continue
        passages = [t for _, t in store.passages_for_doc(d.id) if len(t) >= 80][:12]
        ref = "\n".join(passages)[:2500]
        try:
            if rescore:
                kinds = saved[d.id]
                raise StopIteration
            res = await llm.complete([{"role": "user", "content": PROMPT % (d.title, ref)}], temperature=0.7, max_tokens=900, use_cache=False)
            m = re.search(r"\{.*\}", res.text, re.S)
            kinds = json.loads(m.group(0), strict=False) if m else {}
        except StopIteration:
            pass
        except Exception as e:                                     # a failed simulation is skipped, never invented
            print("skip", d.id, str(e)[:80])
            continue
        for kind in ("good", "thin", "wrong"):
            text = kinds.get(kind)
            if not isinstance(text, str):
                continue
            g = teachback.grade(text, passages, emb, nli)
            texts.setdefault(d.id, {})[kind] = text
            rows.append({"doc": d.id, "kind": kind, "graded": g["graded"], "score": g["score"], "accuracy": g["accuracy"],
                         "coverage": g["coverage"], "passed": g["passed"]})
            print(d.id, kind, g["score"], g["accuracy"], g["coverage"], g["passed"], flush=True)

    def vals(kind, key="score"):
        return [r[key] for r in rows if r["kind"] == kind and r["graded"]]
    summary = {}
    for k in ("good", "thin", "wrong"):
        sc = vals(k)
        summary[k] = {"n": len([r for r in rows if r["kind"] == k]), "graded": len(sc),
                      "mean_score": round(statistics.mean(sc), 3) if sc else None,
                      "mean_accuracy": round(statistics.mean(vals(k, "accuracy")), 3) if sc else None,
                      "mean_coverage": round(statistics.mean(vals(k, "coverage")), 3) if sc else None,
                      "pass_rate": round(sum(1 for r in rows if r["kind"] == k and r["passed"]) / max(1, len([r for r in rows if r["kind"] == k])), 3)}
    result = {"docs": len(docs), "summary": summary, "auc_good_vs_wrong": round(auc(vals("good"), vals("wrong")), 3),
              "auc_good_vs_thin": round(auc(vals("good"), vals("thin")), 3),
              "auc_thin_vs_wrong_accuracy": round(auc(vals("thin", "accuracy"), vals("wrong", "accuracy")), 3), "rows": rows}
    out = ROOT / "docs" / "eval"
    (out / "teachback.json").write_text(json.dumps(result, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "rows"}, indent=1))
    if not rescore:
        (out / "teachback_texts.json").write_text(json.dumps(texts, indent=1), encoding="utf-8")
    await llm.aclose()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--docs", type=int, default=14)
    ap.add_argument("--rescore", action="store_true", help="re-grade the saved explanations without calling the LLM")
    a = ap.parse_args()
    asyncio.run(main(a.docs, a.rescore))
