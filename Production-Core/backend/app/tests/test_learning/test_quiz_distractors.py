"""Check-question quality: template wrong options come from the same concept's material (with a fact altered, so they are false
but plausible), and an LLM question is rejected when a wrong option is almost a copy of the passage (a second true answer)."""
import random

from backend.app.learning.quiz import corrupt, template_quiz, validate

PASSAGE = ("Binary search finds a target in a sorted array by repeatedly comparing it with the middle element and discarding the half "
           "that cannot contain the target. Each step halves the search space, so it runs in O(log n) time instead of the O(n) of linear search.")
SAME = [
    "If the middle element is smaller than the target, everything to its left is also smaller, so the left half can be eliminated safely.",
    "Binary search only works on a sorted array, because without ordering the discarded half may still contain the target.",
    "Each step halves the search space, so the number of comparisons grows with the logarithm of the array length, O(log n).",
    "The loop ends when the search space is empty or the middle element equals the target.",
]
OTHER = ["Dijkstra's algorithm picks the unvisited vertex with the smallest tentative distance at every step.",
         "A hash table maps keys to buckets using a hash function and resolves collisions by chaining entries.",
         "A stack removes elements in last-in, first-out order, which suits undo features and parsing."]


def test_corrupt_alters_a_fact_and_never_returns_the_original():
    assert "O(n)" in corrupt("It runs in O(log n) time.") and "O(log n)" not in corrupt("It runs in O(log n) time.")
    assert "right half" in corrupt("the left half can be eliminated")
    assert corrupt("Nothing here can be changed by a rule at all really") is None


def test_template_wrong_options_come_from_the_same_concept_when_there_is_enough_material():
    q = template_quiz("Binary Search", PASSAGE, OTHER, "binary-search", "c1", random.Random(1), sources={o: "other" for o in OTHER},
                      same_concept_sentences=SAME)
    wrong = [o for i, o in enumerate(q.options) if i != q.answer_index]
    assert len(wrong) == 3 and not any(w in OTHER for w in wrong)               # no other-concept sentences were needed
    assert all(w not in SAME and w not in PASSAGE for w in wrong)               # each is an altered statement, not a true one
    assert all("search" in w.lower() or "array" in w.lower() or "left" in w.lower() or "right" in w.lower() or "O(" in w for w in wrong)
    assert [s for i, s in enumerate(q.option_sources) if i != q.answer_index] == ["binary-search"] * 3


def test_template_falls_back_to_other_concepts_when_the_concept_has_too_little_material():
    q = template_quiz("Binary Search", PASSAGE, OTHER, "binary-search", "c1", random.Random(2), sources={o: "other" for o in OTHER},
                      same_concept_sentences=SAME[:1])
    wrong = [o for i, o in enumerate(q.options) if i != q.answer_index]
    assert len(wrong) == 3 and sum(w in OTHER for w in wrong) >= 2


def test_template_without_same_concept_material_still_works():
    q = template_quiz("Binary Search", PASSAGE, OTHER, "binary-search", "c1", random.Random(3))
    assert q is not None and len(set(q.options)) == 4


def llm(options, idx=0):
    return {"question": "Why does binary search need a sorted array?", "options": options, "answer_index": idx,
            "explanation": "The passage says it discards the half that cannot contain the target."}


GOOD = ["Because it discards the half that cannot contain the target",
        "Because sorting makes each comparison cheaper",
        "Because it must visit every element at least once",
        "Because the middle element is always the answer"]


def test_an_llm_question_with_plausible_wrong_options_is_accepted():
    assert validate(llm(GOOD), PASSAGE) is not None


def test_an_llm_question_whose_wrong_option_copies_the_passage_is_rejected():
    copied = list(GOOD)
    copied[2] = "Each step halves the search space, so it runs in O(log n) time instead of the O(n) of linear search"
    assert validate(llm(copied), PASSAGE) is None                               # that option is as true as the key
