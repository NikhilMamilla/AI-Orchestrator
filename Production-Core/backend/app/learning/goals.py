"""Goal and deadline planning (PRD Feature 6 and the long-term "month / week" plans).

Takes the learner's remaining roadmap (already prerequisite-ordered), a deadline and the minutes they can study
per day, and answers: is it realistic, what should each week contain, and how much daily time would make it
work? The per-concept time is an explicit, stated assumption (MINUTES_PER_CONCEPT), not a hidden constant, and
the plan is recomputed from current mastery every time, so it shifts when the learner is ahead or behind.
"""
from __future__ import annotations

import math
from datetime import date
from typing import Any, Dict, List, Sequence

MINUTES_PER_CONCEPT = 25          # assumption: ~3 check questions plus reading per concept; shown to the learner
DAYS_PER_WEEK_STUDIED = 5         # a plan that needs 7 days a week is not a plan


def plan_goal(steps: Sequence[Dict[str, Any]], deadline: date, daily_minutes: int, today: date | None = None) -> Dict[str, Any]:
    today = today or date.today()
    days_left = (deadline - today).days
    remaining = len(steps)
    needed = remaining * MINUTES_PER_CONCEPT
    if days_left <= 0:
        return {"status": "past_deadline", "days_left": days_left, "remaining_concepts": remaining, "minutes_needed": needed,
                "weeks": [], "advice": "That date has passed. Pick a new deadline."}
    study_days = max(1, math.ceil(days_left * DAYS_PER_WEEK_STUDIED / 7))
    available = study_days * daily_minutes
    need_per_day = math.ceil(needed / study_days) if needed else 0
    if needed == 0:
        status, advice = "done", "Everything on this goal is already mastered."
    elif available >= needed:
        status = "on_track"
        advice = f"On track: {needed} minutes of work fits in your {available} available minutes."
    elif available >= 0.7 * needed:
        status = "tight"
        advice = f"Tight: you need about {need_per_day} min per study day instead of {daily_minutes}."
    else:
        status = "unrealistic"
        advice = (f"Not realistic at {daily_minutes} min/day: this needs about {need_per_day} min per study day. "
                  "Extend the deadline, raise the daily time, or narrow the goal.")

    per_week = max(1, (daily_minutes * DAYS_PER_WEEK_STUDIED) // MINUTES_PER_CONCEPT)     # concepts the learner can cover weekly
    n_weeks = max(1, math.ceil(days_left / 7))
    weeks: List[Dict[str, Any]] = []
    for w in range(n_weeks):
        chunk = list(steps[w * per_week:(w + 1) * per_week])
        if chunk:
            weeks.append({"week": w + 1, "concepts": [{"id": s["id"], "title": s["title"]} for s in chunk],
                          "minutes": len(chunk) * MINUTES_PER_CONCEPT})
    overflow = max(0, remaining - n_weeks * per_week)
    return {"status": status, "days_left": days_left, "remaining_concepts": remaining, "minutes_needed": needed,
            "minutes_available": available, "recommended_daily_minutes": need_per_day, "weeks": weeks,
            "unscheduled_concepts": overflow, "advice": advice,
            "assumption": f"About {MINUTES_PER_CONCEPT} minutes per concept and {DAYS_PER_WEEK_STUDIED} study days per week."}
