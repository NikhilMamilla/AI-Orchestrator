"""Streaks, goals and the activity rhythm count days in the learner's own timezone, not the server's (UTC)."""
import asyncio
import inspect
from datetime import date, datetime, timezone

from backend.app.learning import localtime, rhythm
from backend.app.models.student_profile import StudentProfile

IST, PDT = -330, 420          # JavaScript's getTimezoneOffset(): UTC minus local, in minutes


def at(y, mo, d, h, mi):
    return datetime(y, mo, d, h, mi, tzinfo=timezone.utc)


def streak_after(svc, offset, *times):
    profile = StudentProfile(user_id="tz")
    graph = svc.graph()
    for t in times:
        _, _, profile = svc._apply(profile, graph, "arrays", True, now=t, attempt={"s": 20, "h": None, "tz": offset})
    return profile


def test_two_answers_on_the_same_local_day_are_one_day_of_streak(svc):
    # 23:30 UTC and 00:10 UTC the next day are 05:00 and 05:40 on the same day in India
    p = streak_after(svc, IST, at(2026, 10, 10, 23, 30), at(2026, 10, 11, 0, 10))
    assert p.overall_stats.current_streak == 1


def test_answers_on_consecutive_local_days_continue_the_streak_even_within_one_utc_day(svc):
    # 03:00 UTC and 08:00 UTC the same day are 20:00 and 01:00 on consecutive days on the US west coast
    p = streak_after(svc, PDT, at(2026, 10, 11, 3, 0), at(2026, 10, 11, 8, 0))
    assert p.overall_stats.current_streak == 2


def test_the_offset_is_remembered_and_a_nonsense_one_is_ignored(svc):
    assert streak_after(svc, IST, at(2026, 10, 11, 9, 0)).patterns["tz_offset_min"] == IST
    assert "tz_offset_min" not in streak_after(svc, 99999, at(2026, 10, 11, 9, 0)).patterns
    assert "tz_offset_min" not in streak_after(svc, None, at(2026, 10, 11, 9, 0)).patterns


def test_the_learners_today_comes_from_their_offset():
    now = at(2026, 10, 10, 23, 30)
    assert localtime.local_today({"tz_offset_min": IST}, now) == date(2026, 10, 11)
    assert localtime.local_today({"tz_offset_min": PDT}, now) == date(2026, 10, 10)
    assert localtime.local_today({}, now) == date(2026, 10, 10)                 # no offset known: UTC


def test_goal_planning_uses_the_learners_today(svc):
    assert "local_today(" in inspect.getsource(svc.goal_plan)


def test_the_rhythm_grid_and_streak_use_local_time():
    attempts = [{"t": "2026-10-10T20:30:00+00:00", "ok": True}]               # Saturday 20:30 UTC = Sunday 02:00 in India
    now = at(2026, 10, 11, 1, 0)
    utc = rhythm.rhythm(attempts, now)
    ist = rhythm.rhythm(attempts, now, tz_offset_min=IST)
    assert utc["grid"][5][20] == 1 and ist["grid"][6][2] == 1
    assert ist["peak"] == {"day": rhythm.WEEKDAYS[6], "hour": 2}
