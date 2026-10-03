"""Goal and deadline planning: honest feasibility, weekly milestones, recomputed from current mastery."""
from datetime import date, timedelta

import pytest

from backend.app.learning.goals import MINUTES_PER_CONCEPT, plan_goal
from backend.app.learning.service import LearningError

TODAY = date(2026, 3, 2)
STEPS = [{"id": f"c{i}", "title": f"Concept {i}"} for i in range(10)]          # 10 concepts = 250 minutes


def test_on_track_when_available_time_covers_the_work():
    p = plan_goal(STEPS, TODAY + timedelta(days=14), 60, TODAY)
    assert p["status"] == "on_track" and p["minutes_needed"] == 10 * MINUTES_PER_CONCEPT
    assert sum(len(w["concepts"]) for w in p["weeks"]) + p["unscheduled_concepts"] == 10


def test_unrealistic_goal_is_flagged_with_a_concrete_fix():
    p = plan_goal(STEPS, TODAY + timedelta(days=3), 15, TODAY)
    assert p["status"] == "unrealistic" and p["recommended_daily_minutes"] > 15
    assert "Extend the deadline" in p["advice"]


def test_tight_band_sits_between_the_two():
    p = plan_goal(STEPS, TODAY + timedelta(days=7), 40, TODAY)       # 5 study days * 40 = 200 of 250 = 80%
    assert p["status"] == "tight"


def test_weeks_follow_roadmap_order_and_never_exceed_weekly_capacity():
    p = plan_goal(STEPS, TODAY + timedelta(days=21), 30, TODAY)      # 150 min/week = 6 concepts per week
    assert [c["id"] for w in p["weeks"] for c in w["concepts"]] == [s["id"] for s in STEPS][: sum(len(w["concepts"]) for w in p["weeks"])]
    assert all(len(w["concepts"]) <= 6 for w in p["weeks"])


def test_past_deadline_and_nothing_left_are_distinct_states():
    assert plan_goal(STEPS, TODAY - timedelta(days=1), 30, TODAY)["status"] == "past_deadline"
    assert plan_goal([], TODAY + timedelta(days=7), 30, TODAY)["status"] == "done"


async def test_service_goal_round_trip_and_recomputes_from_mastery(svc):
    assert (await svc.goal_plan("u40")) == {"goal": None}
    p1 = await svc.set_goal("u40", None, date.today() + timedelta(days=30), 45)
    assert p1["goal"]["daily_minutes"] == 45 and p1["remaining_concepts"] > 0
    q = await svc.create_quiz("u40", "arrays")
    for _ in range(3):
        q = await svc.create_quiz("u40", "arrays")
        await svc.answer("u40", q["quiz_id"], svc.quizzes.rows[q["quiz_id"]]["answer_index"])
    p2 = await svc.goal_plan("u40")
    assert p2["remaining_concepts"] <= p1["remaining_concepts"]
    with pytest.raises(LearningError):
        await svc.set_goal("u40", "nope", date.today() + timedelta(days=5), 30)
