"""Teach-back (the protégé effect): the learner explains a concept in their own words and it is graded against the
course material, with no LLM in the loop, so there is nothing to hallucinate.

Two independent measurements:
  * accuracy: every sentence of the explanation goes through the same claim verifier that checks the tutor's own
    answers (lexical + embedding + NLI), so a wrong statement is flagged exactly like a wrong tutor sentence;
  * coverage: the passage's key points (its most central, non-redundant sentences) are each tested for being
    entailed by the explanation, so a correct-but-thin explanation shows what it left out.
Explanations too short to contain two factual sentences are not graded (a partial score would be noise).
"""
from __future__ import annotations

from typing import Any, Dict, List, Sequence

import numpy as np

from ..rag.generate import _content_words, _sentences, verify_answer
from ..rag.types import Evidence

MIN_CLAIMS = 2
MIN_WORDS = 25
KEY_POINTS = 4
COVER_POINT = 0.25              # a point counts as included when one learner sentence entails it this much (NLI)
COVER_SCALE = 0.30              # mean best-entailment at which coverage credit saturates; tuned on LLM-simulated learners
PASS_SCORE = 0.50
PASS_ACCURACY = 0.60


def key_points(passages: Sequence[str], embedder, n: int = KEY_POINTS) -> List[str]:
    """The n most central, mutually distinct sentences of the material (centrality = cosine to the mean vector, MMR)."""
    sents: List[str] = []
    for p in passages:
        for s in _sentences(p):
            if 40 <= len(s) <= 260 and len(_content_words(s)) >= 5 and s not in sents:
                sents.append(s)
    if not sents:
        return []
    vecs = np.asarray(embedder.encode_documents(sents), dtype=float)
    centroid = vecs.mean(axis=0)
    cent = vecs @ centroid / (np.linalg.norm(centroid) + 1e-9)
    chosen: List[int] = []
    while len(chosen) < min(n, len(sents)):
        best, best_val = None, -9.0
        for i in range(len(sents)):
            if i in chosen:
                continue
            redundancy = max((float(vecs[i] @ vecs[j]) for j in chosen), default=0.0)
            val = 0.7 * float(cent[i]) - 0.3 * redundancy
            if val > best_val:
                best, best_val = i, val
        chosen.append(best)                         # type: ignore[arg-type]
    return [sents[i] for i in sorted(chosen)]


def _coverage(explanation: str, points: Sequence[str], nli) -> List[Dict[str, Any]]:
    """Each key point is scored by the single learner sentence that entails it best (NLI), or by best word recall
    without NLI. Whole-explanation premises were tried first and failed (AUC 0.46, docs/eval/teachback.md)."""
    sents = _sentences(explanation)
    out = []
    if nli is not None and points and sents:
        ent = np.asarray(nli.entailment([(s, p) for p in points for s in sents]), dtype=float).reshape(len(points), len(sents))
        best = ent.max(axis=1)
        point_floor, scale = COVER_POINT, COVER_SCALE
    else:
        best = np.array([max((len(_content_words(p) & _content_words(s)) / max(1, len(_content_words(p))) for s in sents), default=0.0) for p in points])
        point_floor, scale = 0.5, 1.0
    for p, b in zip(points, best):
        out.append({"point": p, "score": round(float(b), 3), "covered": bool(b >= point_floor), "credit": float(min(1.0, b / scale))})
    return out


def grade(explanation: str, passages: Sequence[str], embedder, nli=None, threshold: float = 0.34, floor: float = 0.22,
          nli_weight: float = 0.35) -> Dict[str, Any]:
    explanation = " ".join(explanation.split())
    evidence = [Evidence(ref=i + 1, chunk_id=f"p{i}", doc_id="", doc_title="", heading_path="", text=t, score=1.0)
                for i, t in enumerate(passages)]
    words = explanation.split()
    report = verify_answer(explanation, evidence, embedder, threshold, nli, nli_weight, floor if nli is not None else None)
    claims = report["claims"]
    if len(words) < MIN_WORDS or len(claims) < MIN_CLAIMS:
        return {"graded": False, "reason": f"Write at least {MIN_CLAIMS} full sentences (about {MIN_WORDS} words) so there is something to check.",
                "score": None, "passed": False, "accuracy": None, "coverage": None, "claims": [], "points": []}
    value = {"supported": 1.0, "weak": 0.5, "unsupported": 0.0}
    accuracy = sum(value[c["status"]] for c in claims) / len(claims)
    points = _coverage(explanation, key_points(passages, embedder), nli)
    coverage = sum(p["credit"] for p in points) / len(points) if points else 0.0
    score = 0.5 * accuracy + 0.5 * coverage if points else accuracy
    return {"graded": True, "reason": None, "score": round(score, 3), "accuracy": round(accuracy, 3), "coverage": round(coverage, 3),
            "passed": score >= PASS_SCORE and accuracy >= PASS_ACCURACY,
            "claims": [{"text": c["text"], "status": c["status"], "support": c["support"]} for c in claims], "points": [{k: v for k, v in p.items() if k != "credit"} for p in points],
            "verifier": report["verifier"]}
