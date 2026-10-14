"""Multiple-choice answers like "Option C" must be read as the letter, and a word that merely starts with a letter is not an answer."""
import asyncio

import pytest

from backend.app.agents.assessment.evaluator import AnswerEvaluator


def grade(answer, correct="C"):
    q = {"correct_answer": correct, "explanation": "because"}
    return asyncio.run(AnswerEvaluator(None)._evaluate_mcq(q, answer, None))["is_correct"]


@pytest.mark.parametrize("answer", ["C", "c", "C)", "(c)", "Option C", "option c.", "Answer: C", " c "])
def test_ways_of_writing_the_right_letter_are_accepted(answer):
    assert grade(answer) is True


@pytest.mark.parametrize("answer", ["A", "Option A", "Option B", "OP", "Dijkstra", "", "none of these"])
def test_other_answers_are_not(answer):
    assert grade(answer) is False
