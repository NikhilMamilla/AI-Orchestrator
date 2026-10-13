# Assessment Agent (Comprehensive Evaluator)

Generates questions and grades answers. Overview of all agents: [ARCHITECTURE.md](../ARCHITECTURE.md#agents).

## Two paths

| Path | Code | Used by |
|---|---|---|
| **Grounded, measured** | `learning/quiz.py`, `learning/challenges.py`, `learning/service.py` | *Learn* check questions (wrong options are real sentences from other concepts, so a wrong pick shows a misconception), hints, confidence, and the *Challenges* page, where code runs in Judge0 against hidden tests |
| **LLM-generated** | `agents/assessment/` | `/agents/assessment/generate` and `/evaluate`, and the live session |

## `agents/assessment/`

* **`question_generator.py`**: `QuestionGenerator` builds five question types from a concept: multiple choice,
  explanation, application, code and debugging, at a difficulty chosen from the learner's context, with a stated
  cognitive target per difficulty.
* **`evaluator.py`**: `AnswerEvaluator` grades by type. Multiple choice is exact. Explanation, application and
  debugging answers are judged by the LLM (partial credit and misconceptions). **Code answers are run**, through
  `CodeExecutionService` (Judge0), test case by test case, comparing stdout to the expected output.
* **`agent.py`**: `AssessmentAgent` orchestrates both, picks the difficulty (`_determine_difficulty`) and adds a
  performance summary with a recommendation (advance, practise, review).

All LLM calls go through the shared router (Mistral → Gemini → Groq). Run time and memory are shown only if Judge0
returns them.

## API

* `POST /api/v1/agents/assessment/generate`: build a quiz from concept data.
* `POST /api/v1/agents/assessment/evaluate`: grade submissions.

Both are authenticated. Hidden-test grading for the *Challenges* page is a separate route,
`POST /api/v1/learning/challenges/{id}/submit`, with its own rate limit.
