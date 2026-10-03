"""Planted-error benchmark on our own corpus: can the verifier tell a true technical claim from a corrupted one?

    python -m backend.app.rag.bench_perturb

Each *true* claim is a sentence of the course material that states a complexity or a rule. Its *corrupted*
twin changes exactly the fact (a Big-O class swapped for another, or a requirement negated). The evidence is
the full source document, so the corrupted claim still shares nearly all of its words with the evidence: the
hard case for lexical overlap, and the case an entailment model should win. Perturbations are synthetic (and
this is stated in the output); the corpus sentences are real.
"""
from __future__ import annotations

import argparse
import json
import random
import re
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np

from .bench_halu import auroc, best_threshold, prf
from .chunking import _pack
from .embeddings import load_embedder
from .evaluation import ROOT
from .generate import verify_answer
from .nli import load_nli
from .types import Evidence

BIGO = re.compile(r"O\((?:1|log n|n log n|n\^2|n²|n|2\^n|n!|V \+ E|E log V)\)")
CLASSES = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n^2)", "O(2^n)"]
NEGATIONS = [(r"\bmust\b", "does not need to"), (r"\brequires\b", "does not require"), (r"\balways\b", "never"),
             (r"\bis sorted\b", "is unsorted"), (r"\bcannot\b", "can"), (r"\bonly\b", "never")]
_SENT = re.compile(r"(?<=[.!?])\s+")


def corrupt(sentence: str, rng: random.Random) -> Optional[str]:
    m = BIGO.search(sentence)
    if m:
        others = [c for c in CLASSES if c.replace("^2", "²") != m.group(0) and c != m.group(0)]
        return sentence[: m.start()] + rng.choice(others) + sentence[m.end():]
    for pat, repl in NEGATIONS:
        if re.search(pat, sentence):
            return re.sub(pat, repl, sentence, count=1)
    return None


def load_items(seed: int) -> List[Tuple[str, str, str]]:
    rng = random.Random(seed)
    items = []
    for f in sorted((ROOT / "data" / "knowledge").glob("*.md")):
        text = f.read_text(encoding="utf-8")
        body = re.sub(r"\A---.*?---", "", text, flags=re.S)
        prose = re.sub(r"```.*?```", " ", body, flags=re.S)
        for s in _SENT.split(re.sub(r"[#*`>|]", " ", prose)):
            s = re.sub(r"\s+", " ", s).strip()
            if 40 <= len(s) <= 220:
                bad = corrupt(s, rng)
                if bad and bad != s:
                    items.append((body, s, bad))
    rng.shuffle(items)
    return items


def evidence_of(body: str) -> List[Evidence]:
    return [Evidence(ref=i + 1, chunk_id=f"d{i}", doc_id="d", doc_title="doc", heading_path="doc", text=p, score=1.0)
            for i, p in enumerate(_pack([("text", body)]))][:14]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=150)
    ap.add_argument("--out", default=str(ROOT / "docs" / "eval" / "verifier_perturb.json"))
    args = ap.parse_args()

    items = load_items(11)[: args.max]
    embedder = load_embedder(prefer_neural=True)
    nli = load_nli()
    assert nli is not None, "NLI model could not be loaded"
    print(f"{len(items)} true/corrupted claim pairs; embedder={embedder.name} nli={nli.name}", flush=True)

    recs = []                                                  # (is_true, lexical, entailment)
    for i, (body, true, bad) in enumerate(items):
        ev = evidence_of(body)
        for text, ok in ((true, True), (bad, False)):
            c = verify_answer(text, ev, embedder, nli=nli, nli_weight=0.65)["claims"]
            if c:
                recs.append((ok, c[0]["lexical"], c[0]["entailment"]))
        if (i + 1) % 25 == 0:
            print(f"  scored {i + 1}/{len(items)}", flush=True)

    labels = np.array([r[0] for r in recs])
    lex, ent = np.array([r[1] for r in recs]), np.array([r[2] for r in recs])
    variants = {"lexical+embedding": lex, "NLI entailment": ent, "blend 0.35 lex + 0.65 NLI": 0.35 * lex + 0.65 * ent,
                "blend 0.15 lex + 0.85 NLI": 0.15 * lex + 0.85 * ent}
    rng = random.Random(7)
    idx = list(range(len(recs)))
    rng.shuffle(idx)
    half = len(idx) // 2
    tune, test = np.array(idx[:half]), np.array(idx[half:])
    out = {"dataset": "planted errors on data/knowledge (synthetic perturbations of real sentences)",
           "pairs": len(items), "claims": len(recs), "nli": nli.name, "variants": {}}
    print(f"\n{'variant':30s} {'AUROC':>6s} {'acc':>5s} {'P(h)':>5s} {'R(h)':>5s} {'F1(h)':>5s}  (threshold tuned on half A, scored on half B)")
    for name, sc in variants.items():
        au = auroc(sc[labels], sc[~labels])
        t = best_threshold(sc[tune], labels[tune])
        m = prf(sc[test], labels[test], t)
        out["variants"][name] = {"auroc": round(au, 3), "threshold": round(t, 3), **{k: round(v, 3) for k, v in m.items()}}
        print(f"{name:30s} {au:6.3f} {m['accuracy']:5.3f} {m['halluc_precision']:5.3f} {m['halluc_recall']:5.3f} {m['halluc_f1']:5.3f}  t={t:.3f}")
    Path(args.out).write_text(json.dumps(out, indent=2), encoding="utf-8")
    print("wrote", args.out)


if __name__ == "__main__":
    main()
