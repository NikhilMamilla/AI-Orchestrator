"""Evidence Lab: instrument integrity (no leakage, no mastery change) and honest statistics."""
import asyncio

import pytest

from backend.app.learning import study
from backend.app.learning.service import LearningError


def test_no_participants_makes_no_claim():
    assert study.analyse([])["n"] == 0


def test_small_sample_is_descriptive_not_inferential():
    r = study.analyse([{"pre": 0.25, "post": 0.75}, {"pre": 0.5, "post": 0.75}, {"pre": 0.25, "post": 0.5}])
    assert r["n"] == 3 and r["mean_gain"] == pytest.approx(0.333, abs=1e-3)
    assert "descriptive" in r["verdict"].lower()


def test_clear_gain_in_a_large_sample_excludes_zero():
    pairs = [{"pre": 0.25 + 0.05 * (i % 3), "post": 0.7 + 0.05 * (i % 4)} for i in range(20)]
    r = study.analyse(pairs)
    assert r["ci95"][0] > 0 and r["p_value"] < 0.001 and r["cohens_dz"] > 1
    assert "no control group" in r["verdict"].lower()


def test_no_change_is_not_reported_as_a_gain():
    pairs = [{"pre": 0.5, "post": 0.5 + d} for d in (-0.25, 0.25, 0.0, 0.25, -0.25, 0.0, 0.25, -0.25, 0.0, 0.0)]
    r = study.analyse(pairs)
    assert r["ci95"][0] <= 0 and "no reliable gain" in r["verdict"]


def test_normalised_gain_skips_perfect_pre_scores():
    r = study.analyse([{"pre": 1.0, "post": 1.0}, {"pre": 0.5, "post": 0.75}])
    assert r["normalised_gain"] == 0.5


def test_pseudonym_is_stable_and_not_the_id():
    a, b = study.pseudonym("user-1", "s"), study.pseudonym("user-2", "s")
    assert a == study.pseudonym("user-1", "s") and a != b and "user" not in a


def _run(coro):
    return asyncio.run(coro)


def test_full_flow_gives_no_feedback_and_leaves_mastery_alone(svc, kb):
    uid = "s1"
    assert _run(svc.study_status(uid))["step"] == "join"
    with pytest.raises(LearningError):
        _run(svc.study_start(uid, "pre"))                                   # must join first
    assert _run(svc.study_join(uid))["step"] == "pre"
    with pytest.raises(LearningError):
        _run(svc.study_start(uid, "post"))                                  # phases are ordered

    pre = _run(svc.study_start(uid, "pre"))["items"]
    assert len(pre) == study.PER_CONCEPT * len(study.CONCEPTS)
    assert all("answer_index" not in q and "explanation" not in q for q in pre)
    assert [q["quiz_id"] for q in _run(svc.study_start(uid, "pre"))["items"]] == [q["quiz_id"] for q in pre]   # idempotent

    for q in pre:
        r = _run(svc.study_answer(uid, "pre", q["quiz_id"], 0))
        assert r["recorded"] and "correct" not in r and "explanation" not in r
        with pytest.raises(LearningError):
            _run(svc.study_answer(uid, "pre", q["quiz_id"], 0))             # one answer per question
    prof = _run(svc._profile(uid))
    assert not prof.concept_mastery and not prof.patterns.get("attempts")  # instrument never touches the learner model
    assert study.next_step(prof.patterns["study"]) == "post"

    post = _run(svc.study_start(uid, "post"))["items"]
    assert {q["quiz_id"] for q in post}.isdisjoint({q["quiz_id"] for q in pre})   # fresh parallel forms
    with pytest.raises(LearningError):
        _run(svc.study_result(uid))
    for q in post:
        _run(svc.study_answer(uid, "post", q["quiz_id"], 0))
    res = _run(svc.study_result(uid))
    assert res["gain"] == pytest.approx(res["post"] - res["pre"]) and res["items_per_test"] == len(pre)


def test_answering_someone_elses_or_unlisted_question_is_refused(svc, kb):
    _run(svc.study_join("a"))
    _run(svc.study_start("a", "pre"))
    with pytest.raises(LearningError):
        _run(svc.study_answer("a", "pre", "not-a-listed-quiz", 0))
