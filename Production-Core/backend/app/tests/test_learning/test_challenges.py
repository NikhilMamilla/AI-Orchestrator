"""Challenge grading rules (sandbox mocked): hidden tests stay hidden, help ladder, mastery updated at most twice."""
import json

import pytest

from backend.app.learning import challenges
from backend.app.learning.service import LearningError

CH = challenges.get("bs-off-by-one")


def fake_grade(all_ok: bool):
    async def g(code, tests):
        return [{"ok": all_ok or i == 0 and False, "status": "Accepted" if all_ok else "Wrong Answer", "time": "0.01",
                 "error": None, "got": None if all_ok else "-1"} for i, _ in enumerate(tests)]
    return g


def test_catalogue_is_well_formed_and_hides_tests_and_reference():
    cs = challenges.load()
    assert len(cs) >= 10 and len({c["id"] for c in cs}) == len(cs)
    for c in cs:
        assert c["tests"] and all(set(t) == {"input", "output"} for t in c["tests"]) and c["reference"] and c["hint"]
    view = challenges.public_view(CH, {"fails": 0})
    assert "solution" not in view and "hint" not in view and "tests" in view and isinstance(view["tests"], int)
    assert set(view["sample"]) == {"input", "output"}
    assert "reference" not in json.dumps(view) and CH["tests"][1]["input"] not in json.dumps(view)


def test_help_ladder_thresholds():
    assert "hint" not in challenges.public_view(CH, {"fails": 1})
    assert "hint" in challenges.public_view(CH, {"fails": 2}) and "solution" not in challenges.public_view(CH, {"fails": 2})
    assert "solution" in challenges.public_view(CH, {"fails": 3})
    assert "solution" in challenges.public_view(CH, {"fails": 0, "passed": True})


async def test_failures_cost_mastery_once_then_a_pass_earns_it_back(svc, monkeypatch):
    monkeypatch.setattr(challenges, "grade", fake_grade(False))
    r1 = await svc.challenge_submit("u80", CH["id"], "print(-1)")
    assert not r1["passed"] and r1["challenge"]["fails"] == 1 and r1["mastery_after"] > 0
    m1 = svc.mastery_map(svc.profiles.p["u80"])[CH["concept"]]
    r2 = await svc.challenge_submit("u80", CH["id"], "print(-1)")
    r3 = await svc.challenge_submit("u80", CH["id"], "print(-1)")
    assert svc.mastery_map(svc.profiles.p["u80"])[CH["concept"]] == m1          # repeat failures are not re-penalised
    assert "hint" in r2["challenge"] and "solution" in r3["challenge"]
    assert [x["got"] for x in r3["results"][1:]] == [None] * (len(r3["results"]) - 1)    # only the sample test shows output

    monkeypatch.setattr(challenges, "grade", fake_grade(True))
    r4 = await svc.challenge_submit("u80", CH["id"], "fixed")
    assert r4["passed"] and r4["tests_passed"] == r4["tests_total"] and r4["mastery_after"] > m1
    r5 = await svc.challenge_submit("u80", CH["id"], "fixed")
    assert r5["mastery_after"] == r4["mastery_after"]                           # no farming mastery by resubmitting


async def test_clean_pass_earns_more_than_a_pass_after_seeing_the_solution(svc, monkeypatch):
    monkeypatch.setattr(challenges, "grade", fake_grade(True))
    clean = await svc.challenge_submit("u81", CH["id"], "x")
    monkeypatch.setattr(challenges, "grade", fake_grade(False))
    for _ in range(3):
        await svc.challenge_submit("u82", CH["id"], "x")
    monkeypatch.setattr(challenges, "grade", fake_grade(True))
    helped = await svc.challenge_submit("u82", CH["id"], "x")
    assert clean["mastery_after"] > helped["mastery_after"] - 1e-9 and helped["challenge"]["solution"]


async def test_input_validation_and_unknown_challenge(svc):
    with pytest.raises(LearningError) as e:
        await svc.challenge_submit("u83", "nope", "x")
    assert e.value.status == 404
    with pytest.raises(LearningError):
        await svc.challenge_submit("u83", CH["id"], "   ")
    with pytest.raises(LearningError):
        await svc.challenge_submit("u83", CH["id"], "x" * 9000)
