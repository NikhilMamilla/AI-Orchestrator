"""Preferences and the opt-in leaderboard."""
import pytest

from backend.app.learning import prefs
from backend.app.rag.generate import build_messages


def test_defaults_and_validation():
    assert prefs.clean_prefs({}) == prefs.DEFAULTS
    assert prefs.clean_prefs({"tone": "challenging", "session_minutes": 25})["tone"] == "challenging"
    for bad in ({"tone": "rude"}, {"style": "x"}, {"session_minutes": 5}, {"session_minutes": 500}, {"session_minutes": True}, {"session_minutes": "40"}):
        with pytest.raises(prefs.PrefsError):
            prefs.clean_prefs(bad)


def test_corrupted_stored_prefs_fall_back_to_defaults():
    assert prefs.merged({"tone": "???"}) == prefs.DEFAULTS and prefs.merged(None) == prefs.DEFAULTS


def test_nickname_rules():
    assert prefs.clean_nickname("  Ada   L  ") == "Ada L"
    for bad in ("ab", "x" * 21, "<script>", "a@b.com", "  "):
        with pytest.raises(prefs.PrefsError):
            prefs.clean_nickname(bad)


def test_board_ranks_by_measured_mastery_and_marks_the_caller():
    rows = [{"uid": "a", "nick": "Ada", "cm": [{"mastery_level": 0.9}, {"mastery_level": 0.8}]},
            {"uid": "b", "nick": "Bob", "cm": [{"mastery_level": 0.5}]},
            {"uid": "c", "nick": "Cy", "cm": []}]
    b = prefs.board(rows, "b", top=2)
    assert [r["nickname"] for r in b["top"]] == ["Ada", "Bob"] and b["you"]["rank"] == 2 and b["participants"] == 3
    assert prefs.board(rows, "zzz")["you"] is None                                   # not opted in: no rank, nothing leaked


def test_tone_reaches_the_tutor_prompt():
    from backend.app.rag.types import Evidence
    ev = [Evidence(ref=1, chunk_id="c", doc_id="d", doc_title="T", heading_path="h", text="x " * 30, score=1.0)]
    system = lambda tone: build_messages("q", ev, "beginner", "default", (), tone)[0]["content"]      # noqa: E731
    assert "encouraging" in system("encouraging").lower() and "direct" in system("challenging").lower()
    assert system("neutral") != system("encouraging")


def test_rhythm_counts_hours_weeks_and_streak():
    from datetime import datetime, timedelta, timezone
    from backend.app.learning.rhythm import rhythm
    now = datetime(2026, 10, 2, 12, tzinfo=timezone.utc)
    att = [{"c": "stack", "ok": True, "t": (now - timedelta(days=d)).isoformat(), "h": 20} for d in (0, 1, 2, 9)]
    att.append({"c": "stack", "ok": False, "t": now.isoformat(), "h": 20})
    r = rhythm(att, now)
    assert r["answers"] == 5 and r["streak"] == 3 and r["active_days"] == 4
    assert r["grid"][now.weekday()][20] == 2 and r["peak"]["hour"] == 20
    assert r["weekly"][-1] == {"weeks_ago": 0, "answers": 4, "accuracy": 0.75}
    assert rhythm([], now)["peak"] is None
