"""End-to-end generation evaluation with an LLM judge.

    python -m backend.app.rag.gen_eval [--limit 40] [--concurrency 2]

For every labelled question the real pipeline runs (hybrid retrieval, rerank, generation, verification).
A *different* model from the generator judges the answer against the evidence it was given:
  * faithfulness  - fraction of the answer's claims that the evidence supports
  * relevance     - does it answer the question (1-5)
Reported, with the verifier's effect isolated by judging the RAW model output as well as what we ship:
  * hallucination rate before vs after the verifier, and the verifier's recall on judged-unfaithful answers
  * citation accuracy (cited passage belongs to the gold document)
  * refusal behaviour on out-of-scope questions, latency and tokens
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import statistics
import time
from pathlib import Path
from typing import Dict, List, Optional

from backend.app.config import settings

from .embeddings import load_embedder
from .evaluation import ROOT, build_system
from .llm import BaseLLM, LLMRouter, LLMUnavailable, MistralClient
from .nli import load_nli
from .pipeline import RAGConfig, RAGPipeline
from .rerank import CrossEncoderReranker

JUDGE_PROMPT = """You are a strict fact-checker. Compare the ANSWER to the EVIDENCE.
Split the ANSWER into its factual claims. For each claim decide whether the EVIDENCE alone supports it
(true) or not (false). Ignore citation markers like [1]. Then rate how well the ANSWER addresses the QUESTION
from 1 (off-topic) to 5 (fully answers). Reply with JSON only:
{"claims": [{"text": "...", "supported": true}], "relevance": 4}

QUESTION: %s

EVIDENCE:
%s

ANSWER:
%s"""


class Capture(BaseLLM):
    """Wraps the generator so the raw model text (before verification/repair) can be judged too."""
    name = "capture"

    def __init__(self, inner: BaseLLM):
        super().__init__()
        self.inner, self.last = inner, ""

    @property
    def available(self):
        return self.inner.available

    async def complete(self, messages, **kw):
        res = await self.inner.complete(messages, **kw)
        self.last = res.text
        return res


def parse_json(raw: str) -> Optional[dict]:
    m = re.search(r"\{.*\}", raw, re.S)
    try:
        return json.loads(m.group(0)) if m else None
    except ValueError:
        return None


async def judge(llm: BaseLLM, question: str, evidence: str, answer: str) -> Optional[dict]:
    try:
        res = await llm.complete([{"role": "user", "content": JUDGE_PROMPT % (question, evidence, answer)}],
                                 temperature=0.0, max_tokens=600, use_cache=False)
    except LLMUnavailable:
        return None
    d = parse_json(res.text)
    if not d or not isinstance(d.get("claims"), list) or not d["claims"]:
        return None
    sup = [bool(c.get("supported")) for c in d["claims"] if isinstance(c, dict)]
    if not sup:
        return None
    return {"faithfulness": sum(sup) / len(sup), "all_supported": all(sup), "relevance": float(d.get("relevance", 0) or 0),
            "claims": len(sup)}


async def run(limit: int, concurrency: int, out: Path) -> Dict:
    store, embedder = build_system(neural=True)
    reranker = CrossEncoderReranker(enabled=True)
    nli = load_nli()
    keys = settings.mistral_keys_list
    gen = Capture(LLMRouter([MistralClient(keys)]))
    judge_llm = LLMRouter([MistralClient(keys, models=("open-mistral-nemo", "ministral-8b-latest"))])
    pipe = RAGPipeline(store, embedder, reranker, gen, RAGConfig(), nli)
    items = json.loads((ROOT / "data" / "eval" / "questions.json").read_text(encoding="utf-8"))["items"]
    scoped = [i for i in items if i["kind"] in ("direct", "paraphrase", "multi")][:limit]
    oos = [i for i in items if i["kind"] == "oos"]
    sem = asyncio.Semaphore(concurrency)
    rows: List[dict] = []

    async def one(it: dict):
        async with sem:
            local = Capture(gen.inner)                       # isolate `.last` per concurrent request
            p = RAGPipeline(store, embedder, reranker, local, pipe.cfg, nli)
            t = time.perf_counter()
            ans = await p.answer(it["q"], "beginner")
            row = {"q": it["q"], "kind": it["kind"], "status": ans.status, "ms": (time.perf_counter() - t) * 1000,
                   "tokens": ans.trace.get("tokens_total", 0), "confidence": ans.confidence,
                   "flagged": len(ans.unsupported_claims), "verifier": next((s.get("verifier") for s in ans.trace["stages"] if s["name"] == "verify"), None)}
            gold = set(it.get("docs", []))
            row["citation_acc"] = (sum(c["doc_id"] in gold for c in ans.citations) / len(ans.citations)) if ans.citations and gold else None
            row["raw_text"] = local.last                    # kept so the verifier can be re-calibrated offline without new LLM calls
            row["evidence"] = [{"ref": e.ref, "text": e.text} for e in ans.evidence]
            if ans.evidence and local.last:                  # judge the RAW generation, and what we ship
                ev_text = "\n".join(f"[{e.ref}] {e.text}" for e in ans.evidence)
                row["raw"] = await judge(judge_llm, it["q"], ev_text, local.last)
                row["shipped"] = await judge(judge_llm, it["q"], ev_text, ans.text) if ans.status == "grounded" else None
            rows.append(row)

    await asyncio.gather(*[one(i) for i in scoped + oos])
    return summarise(rows, out)


def mean(xs):
    xs = [x for x in xs if x is not None]
    return round(statistics.mean(xs), 4) if xs else None


def summarise(rows: List[dict], out: Path) -> Dict:
    sc = [r for r in rows if r["kind"] != "oos"]
    oo = [r for r in rows if r["kind"] == "oos"]
    raw = [r["raw"] for r in sc if r.get("raw")]
    shipped = [r["shipped"] for r in sc if r.get("shipped")]
    raw_bad = [r for r in sc if r.get("raw") and not r["raw"]["all_supported"]]
    caught = [r for r in raw_bad if r["status"] != "grounded" or r["flagged"] > 0]
    res = {
        "n_scoped": len(sc), "n_oos": len(oo), "judged_raw": len(raw), "judged_shipped": len(shipped),
        "answer_rate": round(sum(r["status"] == "grounded" for r in sc) / max(1, len(sc)), 4),
        "oos_refusal_rate": round(sum(r["status"] in ("insufficient_evidence", "rejected") for r in oo) / max(1, len(oo)), 4),
        "faithfulness_raw": mean(r["faithfulness"] for r in raw),
        "faithfulness_shipped": mean(r["faithfulness"] for r in shipped),
        "unfaithful_answer_rate_raw": round(len(raw_bad) / max(1, len(raw)), 4),
        "unfaithful_answer_rate_shipped": round(sum(not s["all_supported"] for s in shipped) / max(1, len(shipped)), 4),
        "verifier_recall_on_unfaithful": round(len(caught) / max(1, len(raw_bad)), 4) if raw_bad else None,
        "relevance_mean_1to5": mean(r["relevance"] for r in raw),
        "citation_accuracy": mean(r["citation_acc"] for r in sc),
        "latency_ms_p50": round(statistics.median(r["ms"] for r in rows), 0),
        "tokens_mean": round(statistics.mean(r["tokens"] for r in sc if r["tokens"]), 0) if any(r["tokens"] for r in sc) else None,
        "verifier": rows[0].get("verifier") if rows else None,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"summary": res, "rows": rows}, indent=2), encoding="utf-8")
    md = ["# Generation evaluation (LLM judge)", "",
          f"{res['n_scoped']} in-scope + {res['n_oos']} out-of-scope questions. Generator: Mistral (ministral-14b); judge: "
          "open-mistral-nemo (a different model). Verifier: " + str(res["verifier"]) + ".", "", "| Metric | Value |", "|---|---|"]
    md += [f"| {k} | {v} |" for k, v in res.items() if k not in ("n_scoped", "n_oos", "verifier")]
    out.with_suffix(".md").write_text("\n".join(md) + "\n", encoding="utf-8")
    return res


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=40)
    ap.add_argument("--concurrency", type=int, default=2)
    ap.add_argument("--out", default=str(ROOT / "docs" / "eval" / "generation.json"))
    a = ap.parse_args()
    res = asyncio.run(run(a.limit, a.concurrency, Path(a.out)))
    print(json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
