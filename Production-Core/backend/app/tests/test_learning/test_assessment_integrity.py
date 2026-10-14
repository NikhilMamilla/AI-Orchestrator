"""Assessment integrity: hidden challenge tests must not leak through stderr, and Evidence Lab questions must not be
answerable (or hinted) through the ordinary quiz routes, which reveal the key."""
import asyncio

import pytest

from backend.app.learning import challenges
from backend.app.learning.service import LearningError


def test_only_the_sample_test_shows_stderr_and_output():
    results = [{"ok": False, "status": "Wrong Answer", "error": "hidden input: 42", "got": "7"},
               {"ok": False, "status": "Wrong Answer", "error": "hidden input: 99", "got": "8"},
               {"ok": True, "status": "Accepted", "error": None, "got": None}]
    shown = challenges.public_results(results)
    assert shown[0]["error"] == "hidden input: 42" and shown[0]["got"] == "7"
    assert shown[1]["error"] is None and shown[1]["got"] is None             # a print(input(), file=sys.stderr) trick reveals nothing
    assert [r["ok"] for r in shown] == [False, False, True]
    assert all(set(r) == {"ok", "status", "error", "got"} for r in shown)


def _run(coro):
    return asyncio.run(coro)


def test_study_questions_are_closed_to_the_ordinary_answer_and_hint_routes(svc, kb):
    uid = "s-int"
    _run(svc.study_join(uid))
    item = _run(svc.study_start(uid, "pre"))["items"][0]
    with pytest.raises(LearningError) as hint:
        _run(svc.hint(uid, item["quiz_id"]))
    with pytest.raises(LearningError) as answer:
        _run(svc.answer(uid, item["quiz_id"], 0))
    assert hint.value.status == 409 and answer.value.status == 409
    # and the study itself still works: the question was not burned
    assert _run(svc.study_answer(uid, "pre", item["quiz_id"], 0))["recorded"]
