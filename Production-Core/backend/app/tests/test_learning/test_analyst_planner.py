"""Behavioural analyst + session planner: PRD thresholds, evidence-based signals, no claims without data."""
from backend.app.learning.analyst import analyse
from backend.app.learning.planner import plan_session
from backend.app.learning.policy import ConceptNode


def att(c="a", ok=True, s=10.0, h=None, x=None):
    return {"c": c, "ok": ok, "s": s, "t": "2026-01-01T00:00:00+00:00", "h": h, "x": x}


def ids(res):
    return {s["id"] for s in res["signals"]}


def test_no_data_no_claims():
    r = analyse([])
    assert r["signals"] == [] and r["accuracy"] is None and r["note"]
    assert analyse([att(ok=False)] * 2)["signals"] == []              # two misses is not "three in a row"


def test_three_wrong_in_a_row_is_struggle_but_a_correct_answer_resets_it():
    assert "struggle" in ids(analyse([att(ok=True), att(ok=False), att(ok=False), att(ok=False)]))
    assert "struggle" not in ids(analyse([att(ok=False), att(ok=False), att(ok=False), att(ok=True)]))


def test_rapid_wrong_answers_flag_possible_frustration():
    fast = [att(ok=False, s=1.5)] * 4
    r = analyse(fast)
    assert "rapid_wrong" in ids(r) and next(s for s in r["signals"] if s["id"] == "rapid_wrong")["action"] == "break"
    assert "rapid_wrong" not in ids(analyse([att(ok=False, s=20.0)] * 4))     # slow wrong answers are not rushing


def test_slow_needs_a_baseline_and_is_relative():
    base = [att(s=10.0)] * 6
    assert "slow" in ids(analyse(base + [att(s=30.0)] * 3))
    assert "slow" not in ids(analyse([att(s=10.0)] * 2 + [att(s=30.0)] * 3))    # too little history
    assert "slow" not in ids(analyse(base + [att(s=12.0)] * 3))


def test_repeated_confusion_names_both_concepts_and_offers_a_contrast_question():
    wrong = [att("binary-search", ok=False, x="linear-search")] * 3
    r = analyse(wrong, titles={"binary-search": "Binary Search", "linear-search": "Linear Search"})
    sig = next(s for s in r["signals"] if s["id"] == "repeated_confusion")
    assert sig["evidence"]["count"] == 3 and "Linear Search" in sig["ask"] and sig["action"] == "contrast"
    assert "repeated_confusion" not in ids(analyse(wrong[:2]))


def test_plateau_requires_enough_attempts_and_low_mastery():
    stuck = [att(ok=o) for o in [True, False, True, False, True, False, True, False]]
    assert "plateau" in ids(analyse(stuck, mastery={"a": 0.5}))
    assert "plateau" not in ids(analyse(stuck, mastery={"a": 0.9}))
    improving = [att(ok=o) for o in [False, False, False, True, True, True, True, True]]
    assert "plateau" not in ids(analyse(improving, mastery={"a": 0.5}))


def test_best_time_of_day_needs_samples_in_two_buckets():
    morning = [att(ok=True, h=9)] * 6
    evening = [att(ok=False, h=20)] * 6
    best = analyse(morning + evening)["best_time_of_day"]
    assert best["bucket"] == "morning" and best["accuracy"] == 1.0 and best["others"]["evening"]["n"] == 6
    assert analyse(morning)["best_time_of_day"] is None
    assert analyse(morning[:3] + evening[:3])["best_time_of_day"] is None


# ---------------- planner ----------------
G = {"arrays": ConceptNode("arrays", "Arrays", 1), "bs": ConceptNode("bs", "Binary Search", 1, ["arrays"]),
     "ll": ConceptNode("ll", "Linked Lists", 1, ["arrays"]), "bst": ConceptNode("bst", "BST", 2, ["bs"])}


def test_plan_split_is_60_25_15_and_mix_30_50_20():
    p = plan_session(G, {"arrays": 0.9, "bs": 0.5}, due_review=["arrays"], minutes=60)
    assert p["split"] == {"new": 36, "practice": 15, "review": 9}
    assert p["difficulty_mix"]["levels"] == {"comfortable": "beginner", "challenging": "beginner", "stretch": "intermediate"}
    kinds = [b["type"] for b in p["blocks"]]
    assert "review" in kinds and "practice" in kinds and "new" in kinds
    mix = p["difficulty_mix"]
    assert abs(mix["challenging"] / mix["questions"] - 0.5) < 0.2


def test_plan_fixes_prerequisite_gap_first_and_never_unlocks_blocked_content():
    p = plan_session(G, {"arrays": 0.2, "bs": 0.5}, due_review=[])
    assert p["blocks"][0]["type"] == "remediate" and p["blocks"][0]["concept"] == "arrays"
    assert "bst" not in [b["concept"] for b in p["blocks"] if b["type"] == "new"]


def test_plan_shrinks_when_the_analyst_sees_distress_and_explains_why():
    calm = plan_session(G, {"arrays": 0.9}, [], minutes=40)
    tired = plan_session(G, {"arrays": 0.9}, [], {"signals": [{"id": "rapid_wrong"}]}, minutes=40)
    assert tired["minutes"] == 20 < calm["minutes"] and any("shorter" in n for n in tired["notes"])


def test_plan_without_due_reviews_redirects_that_time_and_says_so():
    p = plan_session(G, {"arrays": 0.5}, [], minutes=40)
    assert any("Nothing is due" in n for n in p["notes"])
