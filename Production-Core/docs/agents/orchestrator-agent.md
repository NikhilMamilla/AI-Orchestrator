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

## What is real in the live session, and what is a placeholder

| Step in `OrchestratorAgent` | Status |
|---|---|
| Session plan, greeting, decision engine, tutor reply, event emission | Real |
| Lesson text (`_request_lesson`) | Real: one call to the shared LLM router (Mistral → Gemini → Groq) |
| Content package (`_request_content`) | **Placeholder**: builds a title and one sentence from the concept id; it does not call the Knowledge agent |
| Answer evaluation (`_evaluate_answer`) | **Placeholder**: returns a fixed "correct, 0.8" result |
| Session analysis (`_request_analysis`) | **Partly placeholder**: publishes an `analyst.requests` message to Redis (if connected) and returns a fixed result |
| Re-explanation (`_adapt_teaching`) | **Placeholder**: returns a fixed sentence |

The real Knowledge, Teaching, Assessment and Analyst agents are fully wired behind the **`/agents/*` REST endpoints**
(and their own pages). The measured, adaptive behaviour learners see in *Learn*, *Insights* and *Challenges* comes from the
`learning/` modules, not from this live-session path. Connecting these placeholders to the real agents is the open
work item for the live-session loop.

## Messaging

`services/message_queue.py` wraps Redis pub/sub and is **optional**: with no Redis the orchestrator still runs and
nothing else depends on it (the admin *System* page lists Redis as optional). The only channel the orchestrator publishes
to today is `analyst.requests`.

## Verification

`python -m pytest backend/app/tests/test_learning` covers the learner-facing policy, planner, goals, diagnostic and analyst rules.
