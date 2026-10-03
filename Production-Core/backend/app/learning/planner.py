"""Orchestrator session planner (PRD 7.5 "Short-term planning" and "Decision 4: how to balance learning").

Splits a session into 60% new content, 25% practice on current topics and 15% spaced review, and aims for the
PRD's 30/50/20 comfortable / challenging / stretch question mix. The PRD's priority hierarchy is applied in
order: well-being first (shrink the session when the Analyst sees distress), then prerequisite gaps, then
engagement and mastery. Pure function: same inputs, same plan, and every block carries its reason.
"""
from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional, Sequence

from .mastery import MASTERED
from .policy import ConceptNode, next_concepts, weakest_prerequisite

SPLIT = (("new", 0.60), ("practice", 0.25), ("review", 0.15))
MIX = (("comfortable", 0.30), ("challenging", 0.50), ("stretch", 0.20))
MINUTES_PER_QUESTION = 3
LEVELS = ["beginner", "intermediate", "advanced"]


def _level(base: str, delta: int) -> str:
    return LEVELS[max(0, min(2, LEVELS.index(base) + delta))]


def plan_session(graph: Mapping[str, ConceptNode], mastery: Mapping[str, float], due_review: Sequence[str],
                 analysis: Optional[Mapping[str, Any]] = None, minutes: int = 40, level: str = "beginner"
                 ) -> Dict[str, Any]:
    minutes = max(10, min(120, int(minutes)))
    notes: List[str] = []
    signals = {s["id"] for s in (analysis or {}).get("signals", [])}

    # 1) well-being first
    shrink = 1.0
    if "rapid_wrong" in signals or "struggle" in signals:
        shrink = 0.5
        minutes = max(10, round(minutes * shrink))
        notes.append("Short session: your recent answers suggest you're tired or frustrated, so this plan is "
                     "shorter and lighter. Take a break first if you need one.")

    budget = {k: round(minutes * w) for k, w in SPLIT}
    in_progress = sorted((c for c in graph if 0 < mastery.get(c, 0.0) < MASTERED), key=lambda c: mastery.get(c, 0.0))
    blocks: List[Dict[str, Any]] = []

    # 2) prerequisite gaps are fixed before anything new is built on them
    for c in in_progress[:2]:
        weak = weakest_prerequisite(graph[c], graph, dict(mastery))
        if weak and not any(b["concept"] == weak.id for b in blocks):
            blocks.append({"type": "remediate", "concept": weak.id, "title": weak.title, "minutes": min(budget["practice"], 8),
                           "level": _level(level, -1),
                           "why": f"{weak.title} is shaky ({mastery.get(weak.id, 0.0):.0%}) and {graph[c].title} depends on it."})

    # 3) spaced review (due first)
    review_minutes = budget["review"]
    for cid in list(due_review)[: max(1, review_minutes // MINUTES_PER_QUESTION)]:
        if cid in graph:
            blocks.append({"type": "review", "concept": cid, "title": graph[cid].title, "minutes": MINUTES_PER_QUESTION,
                           "level": _level(level, -1), "why": "Due for review: practicing now locks it into long-term memory."})
    if not due_review:
        budget["practice"] += review_minutes
        notes.append("Nothing is due for review yet, so that time goes to practice.")

    # 4) practice on topics already started, then 5) new content
    spent = 0
    for c in in_progress:
        if spent >= budget["practice"]:
            break
        blocks.append({"type": "practice", "concept": c, "title": graph[c].title, "minutes": MINUTES_PER_QUESTION * 2,
                       "level": level, "why": f"{mastery.get(c, 0.0):.0%} mastery; the target is {MASTERED:.0%}."})
        spent += MINUTES_PER_QUESTION * 2
    fresh = [n for n in next_concepts(dict(graph), dict(mastery), 6) if mastery.get(n.id, 0.0) == 0.0]
    spent = 0
    for n in fresh:
        if spent >= budget["new"]:
            break
        blocks.append({"type": "new", "concept": n.id, "title": n.title, "minutes": MINUTES_PER_QUESTION * 4,
                       "level": level, "why": "All prerequisites are met."})
        spent += MINUTES_PER_QUESTION * 4
    if not blocks:
        notes.append("Everything unlocked is mastered. Ask any question to explore further.")

    # difficulty mix over the session's questions
    n_questions = max(1, sum(b["minutes"] for b in blocks) // MINUTES_PER_QUESTION)
    counts = {k: round(n_questions * w) for k, w in MIX}
    return {"minutes": minutes, "split": {k: budget[k] for k, _ in SPLIT}, "blocks": blocks, "notes": notes,
            "difficulty_mix": {"questions": n_questions, **counts,
                               "levels": {"comfortable": _level(level, -1), "challenging": level, "stretch": _level(level, 1)}},
            "signals_considered": sorted(signals)}
