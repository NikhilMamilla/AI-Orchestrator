"""Mastery-aware personalisation: turns the learner's measured mastery into retrieval and answer decisions.

Everything here is derived from stored Bayesian-Knowledge-Tracing mastery and the real prerequisite graph;
nothing is guessed. A concept the learner has never practiced is reported as *unpracticed*, not as "weak".
"""
from __future__ import annotations

from typing import Any, Dict, List, Mapping, Sequence

from .types import Document

WEAK_BELOW = 0.60          # same threshold the learning policy uses to demand remediation
BEGINNER_BELOW = 0.40
ADVANCED_FROM = 0.75


def level_from_mastery(mastery: float | None) -> str:
    if mastery is None or mastery < BEGINNER_BELOW:
        return "beginner"
    return "advanced" if mastery >= ADVANCED_FROM else "intermediate"


def assess(concepts: Sequence[str], docs: Sequence[Document], mastery: Mapping[str, float]) -> Dict[str, Any]:
    """What the learner's history says about *this* question. Empty dict when no concept was detected."""
    by_id = {d.id: d for d in docs}
    focus = next((c for c in concepts if c in by_id), None)
    if focus is None:
        return {}
    doc = by_id[focus]
    prereqs: List[Dict[str, Any]] = []
    for p in doc.prerequisites:
        if p not in by_id:
            continue
        m = mastery.get(p)
        if m is None or m < WEAK_BELOW:
            prereqs.append({"id": p, "title": by_id[p].title,
                            "mastery": None if m is None else round(m, 3),
                            "status": "unpracticed" if m is None else "weak"})
    seen = mastery.get(focus)
    return {"focus": focus, "focus_title": doc.title,
            "focus_mastery": None if seen is None else round(seen, 3),
            "suggested_level": level_from_mastery(seen),
            "prerequisites_to_revisit": prereqs}
