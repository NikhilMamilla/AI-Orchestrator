# Orchestrator Agent 🕹️

The **Orchestrator Agent** is the "Pedagogical Brain" of the Kiddoo platform. It acts as the master coordinator, synchronizing Knowledge, Teaching, Assessment, and Analyst agents to create a seamless, adaptive learning experience.

## Responsibilities
- **Session Lifespan Management**: Handles the creation, state maintenance, and conclusion of learning sessions.
- **Agent Synchronization**: Uses a Message Queue (MQ) to delegate tasks and aggregate results from specialized agents.
- **Pedagogical Strategy**: Employs a Decision Engine and Session Planner to adapt the curriculum in real-time.
- **Adaptive Remediation**: Orchestrates the loop between assessment failure and prerequisite review.

## Architecture

### 1. Decision Engine (`decision_engine.py`)
The logic center that determines the student's next state based on performance, fatigue, and mastery.
- **States**: `ADVANCE`, `REVIEW`, `REMEDIATE`, `CONTINUE`, `SUGGEST_BREAK`, `SWITCH_MODALITY`.

### 2. Session Planner (`session_planner.py`)
Generates structured learning paths and daily session goals.
- Uses LLM (Grok) to customize paths based on student goals and available time.

### 3. Orchestration Logic (`agent.py`)
The core class that implements the message-passing protocol.
- **`start_learning_session`**: Kickstarts the brain by planning the path and requesting the first lesson.
- **`process_student_response`**: The main entry point for interaction, routing data to Analysts or Evaluators as needed.

## Communication Pattern
The Orchestrator communicates via Redis Pub/Sub topics:
- `knowledge.requests`: Fetches content.
- `teaching.requests`: Requests lesson generation.
- `assessment.requests`: Triggers question generation.
- `analyst.requests`: Requests deep behavioral analysis.

## LLM Integration
Powered by **Grok (xAI)** via the centralized `LLMService`.
- Model: `grok-beta`
- Primary use cases: Strategy selection, session planning, and reasoning about student performance.

## Status: 100% Operational ✅
Verified through end-to-end integration tests (`test_complete_loop.py`).
