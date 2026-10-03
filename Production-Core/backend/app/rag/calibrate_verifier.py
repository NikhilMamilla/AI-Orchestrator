"""Offline verifier calibration on REAL generated answers (needs docs/eval/generation.json from `gen_eval`).

    python -m backend.app.rag.calibrate_verifier

`gen_eval` saves each raw model answer, its evidence and an LLM-judge verdict. Here the same answers are re-scored
with different blend weights and thresholds (no further LLM calls), and the trade-off that matters is reported:

  * false flags: how many sentences of answers the judge found fully faithful the verifier would still flag
    (the learner sees "couldn't verify" or, worse, a refusal);
  * refusals: faithful answers that would be replaced by "not enough evidence" (more than half the claims flagged);
  * catches: answers the judge found unfaithful where at least one claim is flagged.

The benchmarks on verbatim sentences (HaluEval, planted errors) do not transfer to LLM-paraphrased answers, which is
exactly why this calibration exists.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, List

import numpy as np

from .embeddings import load_embedder
from .evaluation import ROOT
from .generate import normalize_citations, verify_answer
from .nli import load_nli
from .types import Evidence


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(ROOT / "docs" / "eval" / "generation.json"))
    ap.add_argument("--out", default=str(ROOT / "docs" / "eval" / "verifier_generation.md"))
    args = ap.parse_args()
    rows = [r for r in json.loads(Path(args.src).read_text(encoding="utf-8"))["rows"]
            if r.get("raw") and r.get("raw_text") and r.get("evidence") and r["kind"] != "oos"]
    assert rows, "generation.json has no raw_text/evidence: re-run gen_eval first"
    embedder, nli = load_embedder(prefer_neural=True), load_nli()
    assert nli is not None

    scored = []                                           # per answer: faithful?, claims with lexical/entailment
    for r in rows:
        ev = [Evidence(ref=e["ref"], chunk_id=f"c{e['ref']}", doc_id="d", doc_title="d", heading_path="", text=e["text"], score=1.0)
              for e in r["evidence"]]
        rep = verify_answer(normalize_citations(r["raw_text"]), ev, embedder, nli=nli, nli_weight=0.65)
        scored.append({"faithful": bool(r["raw"]["all_supported"]), "fraction": r["raw"]["faithfulness"], "claims": rep["claims"]})
    Path(args.out).with_suffix(".claims.json").write_text(json.dumps(
        [{"faithful": s["faithful"], "claims": [{"lex": c["lexical"], "nli": c["entailment"], "text": c["text"]} for c in s["claims"]]}
         for s in scored], indent=1), encoding="utf-8")
    faithful = [s for s in scored if s["faithful"]]
    bad = [s for s in scored if not s["faithful"]]
    print(f"{len(scored)} answers: {len(faithful)} judged fully faithful, {len(bad)} with an unsupported claim", flush=True)

    def blend(c: Dict, w: float) -> float:
        return c["lexical"] if w == 0 else (1 - w) * c["lexical"] + w * (c["entailment"] or 0.0)

    lines = ["# Verifier calibration on real generated answers", "",
             f"{len(scored)} answers from `gen_eval` (generator ministral-14b, judge open-mistral-nemo): {len(faithful)} judged fully faithful, "
             f"{len(bad)} judged to contain an unsupported claim. The raw answers are re-scored offline.", "",
             "| NLI weight | threshold | faithful claims flagged | faithful answers refused | unfaithful answers caught |", "|---|---|---|---|---|"]
    best = None
    for w in (0.0, 0.35, 0.5, 0.65, 0.85):
        for t in np.arange(0.10, 0.62, 0.04):
            flagged = [c for s in faithful for c in s["claims"] if blend(c, w) < t]
            n_claims = max(1, sum(len(s["claims"]) for s in faithful))
            refused = sum(1 for s in faithful if s["claims"] and sum(blend(c, w) < t for c in s["claims"]) / len(s["claims"]) > 0.5)
            caught = sum(1 for s in bad if any(blend(c, w) < t for c in s["claims"]))
            ff, rr = len(flagged) / n_claims, refused / max(1, len(faithful))
            lines.append(f"| {w:.2f} | {t:.2f} | {ff:.0%} | {rr:.0%} | {caught}/{len(bad)} |")
    lines += ["", "The operating point is chosen by hand from the claim-score distributions (see `verifier.md`), not by this table: "
                  "with only a handful of unfaithful answers, an automatic search can pick a setting that catches nothing."]
    Path(args.out).write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
