"""Meta-learning over teaching styles (PRD 7.5 "A/B tests different approaches, learns which strategies work best").

A per-learner multi-armed bandit. Arms are the teaching styles; the reward is whether the learner answers the
next check question correctly after an explanation in that style. Each arm keeps a Beta(1 + wins, 1 + losses)
posterior and Thompson sampling picks the style, so the system exploits what works for this learner while
still trying the others until the evidence is clear. Everything shown to the learner (n, win rate) is counted,
and a style is never called "best" before it has enough trials.
"""
from __future__ import annotations

import random
from typing import Any, Dict, MutableMapping, Optional

STYLES = ("socratic", "worked_example", "analogy", "default")
MIN_TRIALS_TO_CLAIM = 3          # fewer trials than this on a style: report "still learning", not a winner


def stats_of(patterns: Any) -> Dict[str, Dict[str, int]]:
    raw = patterns.get("strategy_stats", {}) if patterns else {}
    return {s: {"n": int(raw.get(s, {}).get("n", 0)), "wins": int(raw.get(s, {}).get("wins", 0))} for s in STYLES}


def choose(stats: Dict[str, Dict[str, int]], rng: Optional[random.Random] = None) -> str:
    """Thompson sampling: draw from each style's Beta posterior, play the highest draw."""
    rng = rng or random.Random()
    draws = {s: rng.betavariate(1 + v["wins"], 1 + v["n"] - v["wins"]) for s, v in stats.items()}
    return max(draws, key=draws.get)


def summary(stats: Dict[str, Dict[str, int]]) -> Dict[str, Any]:
    """Transparent view: observed win rate and trials per style, plus a winner only when the data supports one."""
    rows = {s: {"n": v["n"], "wins": v["wins"], "rate": round(v["wins"] / v["n"], 3) if v["n"] else None,
                "posterior_mean": round((1 + v["wins"]) / (2 + v["n"]), 3)} for s, v in stats.items()}
    tried = {s: r for s, r in rows.items() if r["n"] >= MIN_TRIALS_TO_CLAIM}
    best = max(tried, key=lambda s: tried[s]["posterior_mean"]) if len(tried) >= 2 else None
    return {"styles": rows, "best": best, "total_trials": sum(v["n"] for v in stats.values())}


def note_explanation(patterns: MutableMapping[str, Any], concept: str, style: str) -> None:
    """Remember which style the learner was just taught `concept` with; the next quiz on it settles the trial."""
    if style in STYLES:
        patterns.setdefault("strategy_pending", {})[concept] = style


def credit(patterns: MutableMapping[str, Any], concept: str, correct: bool) -> Optional[str]:
    """Settle a pending trial for `concept`. Returns the style credited, if any."""
    style = patterns.get("strategy_pending", {}).pop(concept, None)
    if style not in STYLES:
        return None
    s = patterns.setdefault("strategy_stats", {}).setdefault(style, {"n": 0, "wins": 0})
    s["n"] += 1
    s["wins"] += 1 if correct else 0
    return style

