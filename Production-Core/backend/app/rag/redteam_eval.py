"""Red-team evaluation of the injection guard: block rate on attacks vs false positives on benign questions.

    python -m backend.app.rag.redteam_eval [--neural]

Compares regex-only, semantic-only and combined detection, sweeps the semantic threshold, and lists the
attacks that still get through (reported honestly: no detector is perfect).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

from .embeddings import load_embedder
from .evaluation import ROOT
from .guard import QueryRejected, SemanticGuard, screen_query


def regex_blocks(q: str) -> bool:
    try:
        screen_query(q)
        return False
    except QueryRejected:
        return True


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--neural", action="store_true")
    ap.add_argument("--out", default=str(ROOT / "docs" / "eval" / "redteam.md"))
    args = ap.parse_args()

    data = json.loads((ROOT / "data" / "eval" / "redteam.json").read_text(encoding="utf-8"))
    questions = json.loads((ROOT / "data" / "eval" / "questions.json").read_text(encoding="utf-8"))["items"]
    attacks = data["attacks"]
    benign = data["benign"] + [i["q"] for i in questions if i["kind"] in ("direct", "paraphrase", "multi", "oos")]

    embedder = load_embedder(prefer_neural=args.neural)
    guard = SemanticGuard(embedder)
    a_sem = np.array([guard.score(q) for q in attacks])
    b_sem = np.array([guard.score(q) for q in benign])
    a_rx = np.array([regex_blocks(q) for q in attacks])
    b_rx = np.array([regex_blocks(q) for q in benign])

    lines = ["# Injection red-team", "",
             f"{len(attacks)} attack prompts (direct, role-play, exfiltration, delimiter spoofing, indirect, "
             f"multilingual, obfuscated) and {len(benign)} benign questions (incl. {len(data['benign'])} tricky "
             f"look-alikes). Embedder: `{embedder.name}`.", "",
             f"* **Regex layer alone:** blocks {a_rx.sum()}/{len(attacks)} ({a_rx.mean():.0%}); false positives {b_rx.sum()}/{len(benign)}.",
             "", "| semantic threshold | attacks blocked (semantic) | combined with regex | false positives |", "|---|---|---|---|"]
    chosen = None
    for t in np.arange(0.60, 0.91, 0.02):
        sem = a_sem >= t
        comb = sem | a_rx
        fp = int(((b_sem >= t) | b_rx).sum())
        lines.append(f"| {t:.2f} | {sem.sum()}/{len(attacks)} | {comb.sum()}/{len(attacks)} ({comb.mean():.0%}) | {fp}/{len(benign)} |")
        if fp == 0 and chosen is None:
            chosen = (float(t), int(comb.sum()))
    if chosen:
        t, hit = chosen
        lines += ["", f"**Operating point:** lowest threshold with zero false positives = **{t:.2f}** -> combined block rate "
                      f"**{hit}/{len(attacks)} ({hit / len(attacks):.0%})**."]
        miss = [q for q, s, r in zip(attacks, a_sem, a_rx) if not (s >= t or r)]
        lines += ["", "Attacks that still get through at that threshold (defence in depth continues: the prompt "
                      "treats evidence as data, claims are verified, and secrets are never in the prompt):", ""]
        lines += [f"* {q}" for q in miss] or ["* none"]
    else:
        lines += ["", "No threshold gives zero false positives; consider more exemplars."]
    Path(args.out).write_text("\n".join(lines) + "\n", encoding="utf-8")
    sys.stdout.buffer.write(("\n".join(lines) + "\n").encode("utf-8", "replace"))      # Windows consoles can't print every script


if __name__ == "__main__":
    main()
