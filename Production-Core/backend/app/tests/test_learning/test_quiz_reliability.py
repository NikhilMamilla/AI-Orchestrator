"""A check question must (almost) never fail to build: the passage picked for it has to contain a sentence the fallback can use."""
import random

from backend.app.learning.quiz import has_usable_sentence


def test_a_passage_is_picked_only_if_a_question_can_be_made_from_it(svc, kb):
    store, _ = kb
    for doc in store.list_documents():
        for seed in range(40):
            text, _ = svc._passage_for(doc.id, None, random.Random(seed))
            assert has_usable_sentence(text), (doc.id, seed)


def test_has_usable_sentence():
    assert has_usable_sentence("Binary search finds a target in a sorted array by comparing it with the middle element.")
    assert not has_usable_sentence("Short. Also short. ```code block only```")
