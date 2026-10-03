"""Learning journal: every statement is derived from recorded attempts and can be checked against them."""
from datetime import datetime, timedelta, timezone

from backend.app.learning.journal import build_journal

NOW = datetime(2026, 3, 10, 12, tzinfo=timezone.utc)
TITLES = {"a": "Arrays", "b": "Binary Search", "c": "Graphs"}


def at(days_ago, c="a", ok=True, s=10.0, x=None):
    return {"c": c, "ok": ok, "s": s, "t": (NOW - timedelta(days=days_ago)).isoformat(), "h": None, "x": x}


def test_empty_period_makes_no_claims():
    j = build_journal([], {}, TITLES, now=NOW)
    assert j["answers"] == 0 and j["accuracy"] is None and j["concepts_practiced"] == [] and j["overcame"] == []


def test_only_the_period_counts_and_time_is_measured_seconds():
    att = [at(30, ok=False), at(2, ok=True, s=60), at(1, ok=False, s=30), at(0, ok=True, s=30)]
    j = build_journal(att, {"a": 0.5}, TITLES, days=7, now=NOW)
    assert j["answers"] == 3 and j["correct"] == 2 and j["accuracy"] == round(2 / 3, 3)
    assert j["minutes_answering"] == 2.0 and j["active_days"] == 3 and "reading" in j["time_note"]


def test_overcame_requires_a_wrong_answer_in_the_period_and_current_mastery():
    att = [at(3, "b", ok=False), at(1, "b", ok=True), at(2, "c", ok=True), at(1, "c", ok=True)]
    j = build_journal(att, {"b": 0.9, "c": 0.9}, TITLES, now=NOW)
    assert j["overcame"] == ["Binary Search"]                        # c was never wrong, so nothing was "overcome"
    j2 = build_journal(att, {"b": 0.5, "c": 0.9}, TITLES, now=NOW)
    assert j2["overcame"] == [] and j2["needs_work"][0]["id"] == "b"


def test_recurring_mix_ups_need_two_occurrences_and_mastery_change_uses_history():
    att = [at(2, "b", ok=False, x="a"), at(1, "b", ok=False, x="a"), at(1, "c", ok=False, x="a")]
    j = build_journal(att, {}, TITLES, history=[{"date": "2026-03-04", "mastery": 10.0}, {"date": "2026-03-10", "mastery": 25.5}], now=NOW)
    assert j["recurring_mix_ups"] == [{"concept": "Binary Search", "confused_with": "Arrays", "times": 2}]
    assert j["overall_mastery_change"] == {"from": 10.0, "to": 25.5, "delta": 15.5}


async def test_service_journal_reflects_real_answers(svc):
    q = await svc.create_quiz("u50", "arrays")
    await svc.answer("u50", q["quiz_id"], svc.quizzes.rows[q["quiz_id"]]["answer_index"])
    j = await svc.journal("u50", 7)
    assert j["answers"] == 1 and j["concepts_practiced"][0]["title"] == "Arrays"
