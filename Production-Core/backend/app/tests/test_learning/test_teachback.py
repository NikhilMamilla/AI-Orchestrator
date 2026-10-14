"""Teach-back: a learner's own explanation is graded against the course material, with no LLM."""
import asyncio

from backend.app.learning import teachback
from backend.app.learning.service import LearningError


def _passages(kb, doc_id):
    store, _ = kb
    return [t for _, t in store.passages_for_doc(doc_id) if len(t) >= 80][:12]


OWN_WORDS = ("A sorted array lets binary search find a target quickly: it checks the middle element and discards the half that "
             "cannot contain the target. Every step halves the search space, giving O(log n) time instead of O(n) like linear search. "
             "The method relies on ordering, since a middle element smaller than the target means the left half can be eliminated "
             "safely. If the array is not sorted, that conclusion is invalid and the algorithm can miss the target.")
COPIED_MESSAGE = "Explain it in your own words: most of this is copied from the course material."


def test_too_short_is_not_graded(kb):
    _, emb = kb
    r = teachback.grade("Binary search is fast.", _passages(kb, "binary-search"), emb)
    assert r["graded"] is False and r["score"] is None and "sentences" in r["reason"]


def test_faithful_explanation_beats_off_topic_one(kb):
    _, emb = kb
    passages = _passages(kb, "binary-search")
    own = OWN_WORDS
    off = ("Dijkstra finds shortest paths using a priority queue of vertices keyed by tentative distance. "
           "Hash tables store keys in buckets chosen by a hash function and resolve collisions by chaining.")
    good, bad = teachback.grade(own, passages, emb), teachback.grade(off, passages, emb)
    assert good["graded"] and bad["graded"]
    assert good["score"] > bad["score"] and good["coverage"] > bad["coverage"]
    assert good["passed"] and not bad["passed"]


def test_key_points_are_distinct_sentences_from_the_material(kb):
    _, emb = kb
    passages = _passages(kb, "binary-search")
    pts = teachback.key_points(passages, emb, 4)
    assert 1 <= len(pts) <= 4 and len(set(pts)) == len(pts)
    assert all(any(p in t for t in passages) for p in pts)


def test_service_updates_mastery_only_when_graded(svc, kb):
    svc.embedder = kb[1]
    short = asyncio.run(svc.teachback("u1", "binary-search", "It is quick."))
    assert short["graded"] is False
    prof = asyncio.run(svc._profile("u1"))
    assert not prof.concept_mastery

    r = asyncio.run(svc.teachback("u1", "binary-search", OWN_WORDS))
    assert r["graded"] and r["passed"] and r["mastery_after"] > r["mastery_before"]
    prof = asyncio.run(svc._profile("u1"))
    assert prof.patterns["attempts"][-1]["m"] == "teachback"


def test_unknown_concept_is_404(svc, kb):
    svc.embedder = kb[1]
    try:
        asyncio.run(svc.teachback("u1", "nope", "x " * 40))
    except LearningError as e:
        assert e.status == 404
    else:
        raise AssertionError("expected LearningError")


def test_repeat_teachback_the_same_day_gives_feedback_but_not_more_mastery(svc, kb):
    svc.embedder = kb[1]
    first = asyncio.run(svc.teachback("u2", "binary-search", OWN_WORDS))
    again = asyncio.run(svc.teachback("u2", "binary-search", OWN_WORDS))
    assert first["mastery_updated"] and not again["mastery_updated"] and again["graded"]
    assert again["mastery_after"] == first["mastery_after"]
    assert len([a for a in asyncio.run(svc._profile("u2")).patterns["attempts"] if a.get("m") == "teachback"]) == 1


# ---------------- copied explanations are not graded ----------------
def test_pasting_the_course_material_is_not_graded(kb):
    _, emb = kb
    passages = _passages(kb, "binary-search")
    for pasted in (" ".join(teachback.key_points(passages, emb, 4)), " ".join(passages[:3])):
        r = teachback.grade(pasted, passages, emb)
        assert r["graded"] is False and r["reason"] == COPIED_MESSAGE
        assert r["score"] is None and r["passed"] is False


def test_a_mostly_copied_explanation_with_a_few_words_added_is_not_graded(kb):
    _, emb = kb
    passages = _passages(kb, "binary-search")
    padded = "I think that " + " ".join(teachback.key_points(passages, emb, 4)) + " and that is all."
    assert teachback.grade(padded, passages, emb)["graded"] is False


def test_an_explanation_in_the_learners_own_words_is_graded(kb):
    _, emb = kb
    passages = _passages(kb, "binary-search")
    assert teachback.copied_fraction(OWN_WORDS, passages) < 0.3        # well under the 0.6 limit
    r = teachback.grade(OWN_WORDS, passages, emb)
    assert r["graded"] is True and r["reason"] is None


def test_a_pasted_teachback_changes_no_mastery(svc, kb):
    svc.embedder = kb[1]
    pasted = " ".join(teachback.key_points(_passages(kb, "binary-search"), kb[1], 4))
    r = asyncio.run(svc.teachback("u3", "binary-search", pasted))
    assert r["graded"] is False and r["reason"] == COPIED_MESSAGE
    prof = asyncio.run(svc._profile("u3"))
    assert not prof.concept_mastery and not prof.patterns.get("attempts")
