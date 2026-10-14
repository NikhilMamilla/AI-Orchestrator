"""Evidence Lab: the post-test opens STUDY_MIN_GAP_HOURS after the pre-test is completed, so it measures learning, not memory
of the pre-test a minute ago."""
import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from backend.app.config import settings
from backend.app.learning import study
from backend.app.learning.service import LearningError


def _run(coro):
    return asyncio.run(coro)


def finish_pre(svc, uid):
    _run(svc.study_join(uid))
    for q in _run(svc.study_start(uid, "pre"))["items"]:
        _run(svc.study_answer(uid, "pre", q["quiz_id"], 0))


def back_date_pre(svc, uid, hours):
    prof = _run(svc._profile(uid))
    prof.patterns["study"]["pre"]["done_at"] = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    _run(svc.profiles.update_profile(uid, {"patterns": prof.patterns}))


def test_the_default_gap_is_72_hours():
    assert settings.STUDY_MIN_GAP_HOURS == 72


def test_the_post_test_is_closed_right_after_the_pre_test_and_says_when_it_opens(svc, kb):
    finish_pre(svc, "g1")
    view = _run(svc.study_status("g1"))
    assert view["step"] == "post" and view["post_open"] is False
    opens = datetime.fromisoformat(view["post_opens_at"])
    assert timedelta(hours=71) < opens - datetime.now(timezone.utc) <= timedelta(hours=72)
    with pytest.raises(LearningError) as e:
        _run(svc.study_start("g1", "post"))
    assert e.value.status == 409 and "opens" in str(e.value).lower()


def test_the_post_test_opens_once_the_gap_has_passed(svc, kb):
    finish_pre(svc, "g2")
    back_date_pre(svc, "g2", 73)
    view = _run(svc.study_status("g2"))
    assert view["post_open"] is True
    assert len(_run(svc.study_start("g2", "post"))["items"]) == study.PER_CONCEPT * len(study.CONCEPTS)


def test_the_gap_is_a_setting(svc, kb, monkeypatch):
    monkeypatch.setattr(settings, "STUDY_MIN_GAP_HOURS", 0)
    finish_pre(svc, "g3")
    assert _run(svc.study_status("g3"))["post_open"] is True
    assert _run(svc.study_start("g3", "post"))["items"]


def test_a_pre_test_finished_before_the_gap_existed_is_not_locked_out(svc, kb):
    finish_pre(svc, "g4")
    prof = _run(svc._profile("g4"))
    del prof.patterns["study"]["pre"]["done_at"]                                  # a state saved by an older version
    _run(svc.profiles.update_profile("g4", {"patterns": prof.patterns}))
    assert _run(svc.study_status("g4"))["post_open"] is True
