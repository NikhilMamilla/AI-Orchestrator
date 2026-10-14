# Orchestrator Agent

The coordinator of the five agents. Overview of all five: [ARCHITECTURE.md](../ARCHITECTURE.md#agents); the learner-facing
adaptive rules (mastery, session plan, goals, placement) are in [LEARNING.md](../LEARNING.md).

## Two layers, stated plainly

| Layer | Code | What it does today |
|---|---|---|
| **Learner-facing decisions** | `learning/policy.py`, `planner.py`, `goals.py`, `diagnostic.py` | The real adaptive loop behind *Learn*, *Insights* and *Today's plan*: advance / deepen / review / remediate, the 60/25/15 plan, goal feasibility, placement. Computed from recorded answers; every decision is written to `agent_events` with its reasoning. |
| **Agent framework** | `agents/orchestrator/` | The original agent-protocol implementation used by the live session (`/ws/session/{id}`) and `/sessions/*`. |

## `agents/orchestrator/`

* **`decision_engine.py`**: `DecisionEngine.decide_next_action` returns one of `ADVANCE`, `DEEPEN`, `REVIEW`, `REMEDIATE`,
  `SWITCH` (teaching strategy) or `BREAK` (a critical-issue check runs first, for example fatigue), each with a reason,
  the next concept and a recommended strategy.
* **`session_planner.py`**: `SessionPlanner` builds quick, standard and extended session plans from the learner's profile
  and goal, and `plan_learning_path` finds a concept path from where the learner is to a goal.
* **`agent.py`**: `OrchestratorAgent` starts a session (`start_learning_session`), greets the learner, processes each
  response (`process_student_response`), generates the tutor reply, and emits agent events to the learner's event log.

## The live session (`/session/:id`, WebSocket `/ws/session/{id}`)

The live session is a **grounded tutor chat**. Every chat turn goes through `RAGPipeline.answer()`, the same pipeline as the
Ask page: screening, the semantic guard, the evidence gate, generation, per-sentence verification and citations. The reply
arrives with its status, confidence, citations and sources, and the chat shows them exactly as Ask does (citation chips, a
"Not enough evidence" card, a sources panel). An off-topic question is refused without calling the model; an injection is
rejected. The client's chat history is screened and assistant turns are dropped.

| Step in `OrchestratorAgent` | What it does |
|---|---|
| Greeting | Plain text (no model): who Kiddoo is, how many concepts you've mastered, how to start |
| "Start" | Only when the *whole* message is a start phrase ("start", "let's start", "ok", "dive in"…) and no concept is under way; begins with the first concept of your path, or the easiest concept with no prerequisites |
| Content (`_request_content`) | The concept's own passages from the knowledge store; flagged unavailable when the notes don't have it |
| Lesson (`_request_lesson`) | The grounded, cited explanation of the concept from the same pipeline; says plainly when there are no notes |
| Answer grading (`_evaluate_answer`) | The Assessment agent's evaluator (exact for multiple choice); `is_correct` is `None` and nothing is counted when there is no active question |
| Analysis (`_request_analysis`) | The rule-based Analyst over the graded answers; `mastery_level` is `None` when nothing was graded |
| Re-explanation (`_adapt_teaching`) | The Teaching agent, starting from the concept's own notes |
| Next concept / prerequisite / alternative | `DecisionEngine`, using the real prerequisite graph (`learning/policy.py`); it returns no concept (and the orchestrator says so) rather than inventing one |

The message-type key is `interaction_type` (`chat`, `assessment_answer`, `comprehension_check`); `type` is accepted as well. The
current web UI sends chat turns only; the assessment and comprehension branches are exercised by tests.

## Messaging

`services/message_queue.py` wraps Redis pub/sub and is **optional**: with no Redis the orchestrator still runs and
nothing else depends on it (the admin *System* page lists Redis as optional). The only channel the orchestrator publishes
to today is `analyst.requests`.

## Verification

`python -m pytest backend/app/tests/test_learning` covers the learner-facing policy, planner, goals, diagnostic and analyst rules.
