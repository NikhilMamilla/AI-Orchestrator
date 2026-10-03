import random
from datetime import datetime, timedelta, timezone

import pytest

from backend.app.learning.mastery import (BKTParams, ReviewState, bkt_update, next_review, params_for_level,
                                          retention)
from backend.app.learning.policy import ConceptNode, decide, learning_path, next_concepts
from backend.app.learning.quiz import generate_quiz, template_quiz, validate
from backend.app.learning.service import LearningError, LearningService, MemoryQuizRepo
from backend.app.models.student_profile import StudentProfile
from backend.app.rag.llm import LLMResult, LLMUnavailable


# ---------------- BKT & spaced repetition ----------------
def test_bkt_direction_and_bounds():
    p = 0.3
    assert bkt_update(p, True) > p
    assert bkt_update(p, False) < bkt_update(p, True)
    for start in (0.0, 1.0, 0.5):
        for ok in (True, False):
            assert 0.0 <= bkt_update(start, ok) <= 1.0


def test_bkt_three_correct_answers_reach_mastery_for_easy_concept():
    prm, p = params_for_level(1), params_for_level(1).p_init
    for _ in range(3):
        p = bkt_update(p, True, prm)
    assert p >= 0.80


def test_bkt_wrong_answers_lower_mastery_and_hard_concepts_are_slower():
    prm = BKTParams()
    assert bkt_update(0.7, False, prm) < 0.7
    easy, hard = params_for_level(1).p_init, params_for_level(3).p_init
    for _ in range(2):
        easy, hard = bkt_update(easy, True, params_for_level(1)), bkt_update(hard, True, params_for_level(3))
    assert easy > hard


def test_spaced_repetition_grows_then_resets():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    st, due = next_review(ReviewState(), True, 0.9, now)
    assert (due - now).days == 1
    st, due = next_review(st, True, 0.9, now)
    assert (due - now).days == 3
    st, due = next_review(st, True, 0.9, now)
    assert (due - now).days >= 6
    st2, due2 = next_review(st, False, 0.4, now)
    assert (due2 - now).days == 1 and st2.reps == 0 and st2.ease < st.ease


def test_retention_decays_with_time():
    assert retention(0, 3) > retention(3, 3) > retention(10, 3) > 0


# ---------------- policy ----------------
GRAPH = {n.id: n for n in [
    ConceptNode("arrays", "Arrays", 1, []),
    ConceptNode("recursion", "Recursion", 1, []),
    ConceptNode("linked-list", "Linked List", 1, ["arrays"]),
    ConceptNode("tree", "Binary Tree", 2, ["recursion", "linked-list"]),
    ConceptNode("bst", "BST", 2, ["tree"]),
]}


def test_decide_advance_when_mastered_and_next_unlocked():
    d = decide("arrays", True, GRAPH, {"arrays": 0.85})
    assert d.action == "advance" and d.focus in {"linked-list", "recursion"} and "mastered" in d.reasoning


def test_decide_remediates_weak_prerequisite():
    d = decide("tree", False, GRAPH, {"tree": 0.3, "recursion": 0.2, "linked-list": 0.9})
    assert d.action == "remediate" and d.focus == "recursion"


def test_decide_deepen_and_review():
    assert decide("arrays", True, GRAPH, {"arrays": 0.7}).action == "deepen"
    assert decide("arrays", False, GRAPH, {"arrays": 0.3}).action == "review"


def test_next_concepts_respect_prerequisites_and_prefer_started():
    ids = [n.id for n in next_concepts(GRAPH, {"arrays": 0.9, "recursion": 0.1})]
    assert "tree" not in ids and "bst" not in ids and ids[0] == "recursion"      # started first


def test_learning_path_is_topological_and_goal_scoped():
    order = [n.id for n in learning_path(GRAPH, {})]
    for n in GRAPH.values():
        for p in n.prerequisites:
            assert order.index(p) < order.index(n.id)
    scoped = [n.id for n in learning_path(GRAPH, {}, goal="linked-list")]
    assert scoped == ["arrays", "linked-list"]
    assert "arrays" not in [n.id for n in learning_path(GRAPH, {"arrays": 0.9}, goal="linked-list")]


# ---------------- quiz generation ----------------
PASSAGE = ("Binary search finds a target in a sorted array by repeatedly comparing it with the middle element and "
           "discarding the half that cannot contain the target. Each step halves the search space, so it runs in "
           "O(log n) time. The array must be sorted because the algorithm relies on ordering.")
POOL = ["A hash table maps keys to values using a hash function and buckets for storage.",
        "A queue is a first-in, first-out collection with enqueue at the back and dequeue at the front.",
        "Dijkstra's algorithm requires non-negative edge weights to finalise distances correctly.",
        "Union-find supports merging sets and asking whether two items share a set quickly."]


class FakeLLM:
    available = True

    def __init__(self, text=None, err=None):
        self.text, self.err = text, err

    async def complete(self, messages, **kw):
        if self.err:
            raise self.err
        return LLMResult(text=self.text, model="fake")


GOOD = ('{"question": "Why must the array be sorted for binary search?", "options": ["Because the algorithm relies on '
        'ordering to discard half", "Because sorted arrays use less memory", "Because it makes indexing faster", '
        '"Because duplicates are removed"], "answer_index": 0, "explanation": "The algorithm relies on ordering.", '
        '"misconceptions": ["", "memory is unrelated", "indexing is O(1) anyway", "no removal happens"]}')


def test_validate_rejects_bad_questions():
    assert validate({"question": "Q?" * 10, "options": ["a", "a", "b", "c"], "answer_index": 0}, PASSAGE) is None  # duplicates
    assert validate({"question": "Why is it so?", "options": ["aa", "bb", "cc"], "answer_index": 0}, PASSAGE) is None
    assert validate({"question": "Why is it so?", "options": ["aa", "bb", "cc", "dd"], "answer_index": 7}, PASSAGE) is None
    unsupported = {"question": "Who invented the algorithm?", "options": ["Napoleon conquered Europe in battles", "x1", "x2", "x3"],
                   "answer_index": 0, "explanation": "Napoleon conquered Europe using cannons."}
    assert validate(unsupported, PASSAGE) is None                      # keyed answer not supported by the passage
    assert validate({"question": "Why must it be sorted?", "options": ["relies on ordering to discard half", "w1", "w2", "w3"],
                     "answer_index": 0, "explanation": "relies on ordering"}, PASSAGE)


async def test_generate_quiz_llm_path_validates_and_shuffles():
    seen_positions = set()
    for seed in range(20):
        q = await generate_quiz(FakeLLM(GOOD), title="Binary Search", level="beginner", passage=PASSAGE,
                                doc_id="binary-search", chunk_id="c1", seed=seed)
        assert q.generated_by == "llm" and q.options[q.answer_index].startswith("Because the algorithm relies")
        seen_positions.add(q.answer_index)
    assert len(seen_positions) > 1                                      # answer position is not fixed


@pytest.mark.parametrize("llm", [None, FakeLLM(err=LLMUnavailable("down")), FakeLLM("not json at all"),
                                 FakeLLM('{"question": "x"}')])
async def test_generate_quiz_falls_back_to_template(llm):
    q = await generate_quiz(llm, title="Binary Search", level="beginner", passage=PASSAGE, doc_id="d", chunk_id="c",
                            distractor_pool=POOL, seed=1)
    assert q.generated_by == "template" and len(set(q.options)) == 4
    assert "O(log n)" in q.options[q.answer_index] or "sorted" in q.options[q.answer_index]


def test_template_needs_enough_distractors():
    assert template_quiz("T", PASSAGE, POOL[:2], "d", "c", random.Random(0)) is None


# ---------------- service flow ----------------
async def _answer_correctly(svc, uid, doc="binary-search"):
    q = await svc.create_quiz(uid, doc)
    key = svc.quizzes.rows[q["quiz_id"]]["answer_index"]
    return q, await svc.answer(uid, q["quiz_id"], key)


async def test_quiz_never_leaks_the_answer_key(svc):
    q = await svc.create_quiz("u1", "binary-search")
    assert set(q) == {"quiz_id", "doc_id", "title", "question", "options", "generated_by"}
    assert len(q["options"]) == 4


async def test_correct_answers_raise_mastery_and_log_decisions(svc):
    prev = 0.0
    for _ in range(3):
        _, res = await _answer_correctly(svc, "u1")
        assert res["correct"] and res["mastery_after"] > prev
        prev = res["mastery_after"]
    assert res["mastered"] and res["decision"]["action"] in {"advance", "complete"}
    assert len(svc.events) == 3 and svc.events[-1][1] == "orchestrator" and "mastered" in svc.events[-1][2]
    prof = await svc.profiles.get_profile_by_user_id("u1")
    assert prof.overall_stats.concepts_mastered == 1 and prof.overall_stats.current_streak == 1
    assert prof.patterns["progress_history"][-1]["mastery"] > 0
    assert prof.concept_mastery[0].next_review_due is not None


async def test_wrong_answer_lowers_mastery_and_explains(svc):
    q = await svc.create_quiz("u2", "binary-search")
    key = svc.quizzes.rows[q["quiz_id"]]["answer_index"]
    res = await svc.answer("u2", q["quiz_id"], (key + 1) % 4)
    assert not res["correct"] and res["correct_index"] == key and res["explanation"]
    assert res["mastery_after"] < res["mastery_before"] or res["mastery_before"] == 0.0 and res["mastery_after"] < 0.25


async def test_cannot_answer_twice_or_someone_elses_quiz(svc):
    q, _ = await _answer_correctly(svc, "u3")
    with pytest.raises(LearningError) as e:
        await svc.answer("u3", q["quiz_id"], 0)
    assert e.value.status == 409
    with pytest.raises(LearningError) as e2:
        await svc.answer("intruder", q["quiz_id"], 0)
    assert e2.value.status == 404
    with pytest.raises(LearningError):
        await svc.answer("u3", "missing", 0)
    with pytest.raises(LearningError):
        await svc.answer("u3", q["quiz_id"], 9)


async def test_unknown_concept_is_404(svc):
    with pytest.raises(LearningError) as e:
        await svc.create_quiz("u1", "no-such-concept")
    assert e.value.status == 404


async def test_streak_logic_across_days(svc):
    graph = svc.graph()
    prof = StudentProfile(user_id="u")
    day = datetime(2026, 3, 10, 12, tzinfo=timezone.utc)
    svc._apply(prof, graph, "arrays", True, day)
    svc._apply(prof, graph, "arrays", True, day + timedelta(hours=3))            # same day: no change
    assert prof.overall_stats.current_streak == 1
    svc._apply(prof, graph, "arrays", True, day + timedelta(days=1))
    assert prof.overall_stats.current_streak == 2
    svc._apply(prof, graph, "arrays", True, day + timedelta(days=4))             # gap resets
    assert prof.overall_stats.current_streak == 1 and prof.overall_stats.longest_streak == 2


async def test_path_and_review_queue(svc):
    for _ in range(2):
        await _answer_correctly(svc, "u4", "arrays")
    path = await svc.path("u4")
    ids = [s["id"] for s in path["steps"]]
    assert "linked-list" in ids and all(s["why"] for s in path["steps"])
    for s in path["steps"]:                                                  # roadmap respects prerequisites
        for p in svc.graph()[s["id"]].prerequisites:
            if p in ids:
                assert ids.index(p) < ids.index(s["id"])
    review = await svc.review_queue("u4")
    assert review and review[0]["id"] == "arrays" and 0 < review[0]["retention"] <= 1


async def test_failed_profile_save_does_not_burn_the_question(svc):
    q = await svc.create_quiz("u9", "binary-search")
    key = svc.quizzes.rows[q["quiz_id"]]["answer_index"]

    async def broken(uid, updates):
        return False
    original, svc.profiles.update_profile = svc.profiles.update_profile, broken
    with pytest.raises(RuntimeError):
        await svc.answer("u9", q["quiz_id"], key)
    svc.profiles.update_profile = original
    assert (await svc.answer("u9", q["quiz_id"], key))["correct"]          # can be answered again


async def test_answer_records_timing_and_the_concept_a_wrong_option_came_from(svc):
    q = await svc.create_quiz("u10", "binary-search")
    row = svc.quizzes.rows[q["quiz_id"]]
    wrong = next(i for i in range(4) if i != row["answer_index"])
    src = row["option_sources"][wrong]
    assert src and src != "binary-search"                                    # a distractor from another concept
    await svc.answer("u10", q["quiz_id"], wrong, tz_offset_min=0)
    a = svc.profiles.p["u10"].patterns["attempts"][-1]
    assert a["ok"] is False and a["x"] == src and a["s"] is not None and a["h"] is not None
    ins = await svc.insights("u10")
    assert ins["attempts"] == 1 and ins["accuracy"] == 0.0
    plan = await svc.session_plan("u10", 30)
    assert plan["blocks"]


from backend.app.learning.mastery import BKTParams, assisted, bkt_update   # noqa: E402


def test_hints_and_declared_guesses_reduce_credit_only_for_correct_answers():
    base = BKTParams()
    full = bkt_update(0.3, True, base)
    one = bkt_update(0.3, True, assisted(base, 1))
    two = bkt_update(0.3, True, assisted(base, 2))
    guess = bkt_update(0.3, True, assisted(base, 0, "guess"))
    assert full > one > two and full > guess
    assert assisted(base, 0, "sure") == base and assisted(base, 0, None) == base
    assert assisted(BKTParams(p_guess=0.55), 5).p_guess == 0.60            # capped: luck is never certain


async def test_hint_ladder_eliminates_then_shows_source_and_lowers_credit(svc):
    q = await svc.create_quiz("u60", "binary-search")
    key = svc.quizzes.rows[q["quiz_id"]]["answer_index"]
    h1 = await svc.hint("u60", q["quiz_id"])
    assert h1["level"] == 1 and h1["eliminate"] != key and 0 <= h1["eliminate"] < 4
    h2 = await svc.hint("u60", q["quiz_id"])
    assert h2["level"] == 2 and h2["source"]
    assert (await svc.hint("u60", q["quiz_id"]))["level"] == 2             # ladder tops out
    helped = await svc.answer("u60", q["quiz_id"], key, confidence="unsure")
    q2 = await svc.create_quiz("u61", "binary-search")
    unhelped = await svc.answer("u61", q2["quiz_id"], svc.quizzes.rows[q2["quiz_id"]]["answer_index"])
    assert helped["hints_used"] == 2 and unhelped["hints_used"] == 0
    assert helped["mastery_after"] < unhelped["mastery_after"]
    with pytest.raises(LearningError) as e:
        await svc.hint("u60", q["quiz_id"])                                  # no hints after answering
    assert e.value.status == 409


async def test_confident_mistakes_are_flagged_as_misconceptions(svc):
    for _ in range(4):
        q = await svc.create_quiz("u62", "arrays")
        row = svc.quizzes.rows[q["quiz_id"]]
        await svc.answer("u62", q["quiz_id"], next(i for i in range(4) if i != row["answer_index"]), confidence="sure")
    ins = await svc.insights("u62")
    assert "overconfident" in {s["id"] for s in ins["signals"]}
    assert ins["calibration"]["sure"] == {"n": 4, "accuracy": 0.0}
