"""Evidence Lab: an opt-in pre/post study built into the product, so claims about learning can be measured on real learners.

Design (deliberately simple, so it can be defended):
  * fixed concept set, 2 freshly generated questions per concept in each phase (parallel forms, so the post-test is
    not the pre-test repeated); no hints, and no feedback, so the instrument does not teach;
  * only learners who completed both phases enter the analysis;
  * results are a paired comparison: mean gain, paired t-test, Cohen's dz, a bootstrap 95% CI and Hake's normalised
    gain. With few participants the verdict says so and refuses to claim an effect.
There is no control group: a gain here is evidence of learning during use, not proof the tutor caused it.
"""
from __future__ import annotations

import hashlib
from typing import Any, Dict, List, Mapping, Optional, Sequence

import numpy as np
from scipy import stats

CONCEPTS = ["arrays", "big-o-complexity", "binary-search", "hash-table"]
PER_CONCEPT = 2
MIN_FOR_INFERENCE = 10


def new_state(now_iso: str) -> Dict[str, Any]:
    return {"joined": now_iso, "concepts": CONCEPTS, "pre": {"quizzes": [], "answers": {}, "score": None},
            "post": {"quizzes": [], "answers": {}, "score": None}}


def phase_score(phase: Mapping[str, Any]) -> Optional[float]:
    qs = phase.get("quizzes") or []
    if not qs or len(phase.get("answers", {})) < len(qs):
        return None
    return sum(1 for q in qs if phase["answers"].get(q)) / len(qs)


def next_step(state: Optional[Mapping[str, Any]]) -> str:
    if not state:
        return "join"
    if state["pre"]["score"] is None:
        return "pre"
    return "done" if state["post"]["score"] is not None else "post"


def pseudonym(uid: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}:{uid}".encode()).hexdigest()[:8]


def analyse(pairs: Sequence[Mapping[str, float]], seed: int = 7, boots: int = 4000) -> Dict[str, Any]:
    """pairs: [{'pre': 0..1, 'post': 0..1}, ...] for learners who completed both phases."""
    n = len(pairs)
    if n == 0:
        return {"n": 0, "verdict": "No learner has completed both tests yet."}
    pre = np.array([p["pre"] for p in pairs], dtype=float)
    post = np.array([p["post"] for p in pairs], dtype=float)
    gain = post - pre
    out: Dict[str, Any] = {"n": n, "mean_pre": round(float(pre.mean()), 3), "mean_post": round(float(post.mean()), 3),
                           "mean_gain": round(float(gain.mean()), 3)}
    room = pre < 1.0                                                   # Hake's normalised gain is undefined at a perfect pre-score
    out["normalised_gain"] = round(float(np.mean((post[room] - pre[room]) / (1 - pre[room]))), 3) if room.any() else None
    if n < 2:
        out["verdict"] = "One learner: descriptive only, no inference possible."
        return out
    sd = float(gain.std(ddof=1))
    out["cohens_dz"] = round(float(gain.mean() / sd), 3) if sd > 0 else None
    rng = np.random.default_rng(seed)
    means = rng.choice(gain, size=(boots, n), replace=True).mean(axis=1)
    out["ci95"] = [round(float(np.percentile(means, 2.5)), 3), round(float(np.percentile(means, 97.5)), 3)]
    p = float(stats.ttest_rel(post, pre).pvalue) if sd > 0 else None
    out["p_value"] = None if p is None or np.isnan(p) else round(p, 4)
    if n < MIN_FOR_INFERENCE:
        out["verdict"] = (f"Only {n} completed: descriptive. The interval is wide and a p-value from fewer than "
                          f"{MIN_FOR_INFERENCE} learners should not be relied on.")
    elif out["ci95"][0] > 0:
        out["verdict"] = ("Scores rose between pre and post and the 95% interval excludes zero. No control group, "
                          "so this shows learning during use, not that the tutor caused it.")
    else:
        out["verdict"] = "The 95% interval includes zero: no reliable gain detected in this sample."
    return out


def per_concept_gain(rows: Sequence[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    """rows: per learner {'pre': {concept: 0..1}, 'post': {concept: 0..1}} -> mean gain per concept."""
    out = []
    for c in CONCEPTS:
        g = [r["post"][c] - r["pre"][c] for r in rows if c in r["pre"] and c in r["post"]]
        if g:
            out.append({"concept": c, "n": len(g), "mean_gain": round(float(np.mean(g)), 3)})
    return out
