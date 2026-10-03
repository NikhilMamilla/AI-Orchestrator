# The learning system

How the five PRD agents are realised. Everything here is computed from the learner's own recorded answers; where
the system has too little data it says so instead of guessing.

| PRD agent | Where | What it actually does |
|---|---|---|
| Knowledge Curator | `rag/` | Hybrid retrieval, rerank, evidence gate, cited answers (see `RAG.md`) |
| Adaptive Pedagogy | `learning/strategy.py`, `rag/personalize.py` | Chooses the teaching style (bandit) and explanation level (from mastery) |
| Comprehensive Evaluator | `learning/quiz.py`, `service.py` | Grounded check questions, hints, confidence, grading, misconception capture |
| Behavioural Analyst | `learning/analyst.py` | Struggle, rushing, slow, plateau, confusion pairs, calibration, best time of day |
| Master Orchestrator | `learning/policy.py`, `planner.py`, `goals.py`, `diagnostic.py` | Advance/deepen/review/remediate, session plan, goal feasibility, placement |

## Learner model

* **Mastery**: Bayesian Knowledge Tracing per concept (`mastery.py`). Parameters depend on concept level. A correct
  answer earns less credit when hints were used or the learner said "just guessing" (the guess probability rises).
* **Review**: SM-2-style intervals plus an exponential retention estimate. Overdue concepts go in the review queue.
* **Attempts log** (last 300): concept, correct, seconds-to-answer (from server timestamps), local hour, the concept
  a wrong option was taken from, stated confidence, hints used.

## Behavioural Analyst (`analyst.py`)

Rules use the PRD's own thresholds, each with a minimum sample size, and every signal carries its evidence:

| Signal | Trigger |
|---|---|
| struggle | 3 wrong in a row |
| rapid_wrong | at least 3 of the last 4 answers wrong and under 3 s |
| slow | last 3 answers take more than 2x the learner's median (needs 5+ earlier timings) |
| repeated_confusion | the same wrong concept chosen 3+ times (names both concepts, offers a contrast question) |
| plateau | 8+ attempts on a concept, mastery under 70%, last 4 no better than the 4 before |
| overconfident | 2+ wrong among the last 8 "sure" answers |
| best time of day | only when two time buckets each have 5+ answers |

**Misconception capture:** wrong options in template questions are real sentences from other concepts. Which one a
learner picks reveals what they confuse the topic with. No model is involved.

## Orchestrator

* **Decision** (`policy.py`): mastered, prerequisites met: advance. 60% or more: deepen. Weak prerequisite and
  failing: remediate. Otherwise review. The reasoning string is shown to the learner.
* **Session plan** (`planner.py`): 60% new, 25% practice, 15% review, with a 30/50/20 comfortable/challenging/stretch
  question mix. Priority order follows the PRD: well-being first (a session shrinks by half when the Analyst sees
  rapid-wrong or struggle), then prerequisite gaps, then review, practice, new.
* **Goal and deadline** (`goals.py`): remaining roadmap vs minutes per day. States are on track, tight, unrealistic
  (with the daily time that would work), past deadline, done. The 25 minutes per concept and 5 study days per week are
  stated assumptions, shown in the UI.
* **Placement diagnostic** (`diagnostic.py`): about 8 adaptive questions. A correct answer raises the probability that
  the concept's prerequisites are known; a wrong answer lowers its dependents. The next question is the most
  informative one. Inferred concepts are labelled **assumed** and count as "ready" for unlocking, never as mastered.

## Meta-learning (`strategy.py`)

A per-learner multi-armed bandit over teaching styles (Socratic, worked example, analogy, concise). With style set to
"auto", Thompson sampling picks the style from Beta posteriors; the reward is whether the learner answers the next
check question on that concept correctly. The UI shows measured wins out of trials and names a best style only when
two or more styles have at least 3 trials.

## Mastery-aware answers (`rag/personalize.py`)

With level "auto" the explanation level comes from the learner's mastery of the concept in the question
(under 40%: beginner, 75% and above: advanced). Weak or unpracticed prerequisites are boosted in retrieval and shown
as "worth revisiting first". Per-learner data is stripped from admin metrics.

## Other features

* **Hints**: first hint rules out one wrong option, second shows the source passage; each lowers mastery credit.
* **Confidence**: "guess / not sure / sure" before answering; calibration is reported by confidence level.
* **Journal**: summary of a period built from recorded answers; "overcame" requires an actual miss followed by mastery.
  PDF export uses the browser's print-to-PDF.
* **Visualizer**: binary and linear search, five sorts. Steps are recorded from a real run; verified on 2,100 random
  inputs plus exact comparison counts.
* **Content gaps** (admin): refused questions stored without user identity, clustered by meaning, mapped to the
  closest existing concept. Kept 90 days.
* **Teacher/parent view**: the student creates a named, expiring (30 days), revocable read-only link. It shows mastery, streak, accuracy, overdue reviews and the Analyst's alerts with suggested talking points, from an allow-listed set of fields: no answers, questions or free text. Only a SHA-256 hash of the token is stored; unknown, expired and revoked links return the same 404.
* **Audio**: browser speech synthesis (Listen) and dictation where the browser supports them.

## Policy simulation

`python -m backend.app.learning.simulate` compares the policy with random and fixed-order practice on synthetic
learners over the real prerequisite graph. It is a simulation, not a study with real learners; the report
(`docs/eval/policy_simulation.md`) states its assumptions and finds that nearly all of the gain comes from
prerequisite-aware unlocking, with no measurable extra benefit from remediation or lingering.

## Newer features

* **Teach it back** (`POST /learning/teachback`): the learner explains a concept in their own words. Every sentence goes
  through the same claim verifier as the tutor's answers (accuracy), and the passage's key points are tested for being
  entailed by individual learner sentences (coverage). No LLM is involved, so nothing can be invented. A graded attempt
  updates mastery once per concept per 24 h. Measured on LLM-simulated learners: `docs/eval/teachback.md`.
* **Draw it** (`POST /learning/sketch`): draw a BST or heap; a vision model reads it twice and **fixed rules** judge it.
  No verdict when the two readings disagree; the reading is always shown back. `docs/eval/sketch.md`.
* **Evidence Lab** (`/lab`, `/learning/study/*`): an opt-in pre/post test (8 fresh questions per phase on four concepts,
  no hints, no feedback, mastery untouched). The organiser's report gives n, mean gain, a bootstrap 95% CI, paired t,
  Cohen's dz and Hake's normalised gain, and refuses to claim an effect below 10 completers. Anonymised CSV export.
  There is no control group, and the page says so. **No real learner has used it yet.**
* **Preferences** (`/settings`): tone (written into the tutor prompt), default teaching style, planned session length.
* **Leaderboard** (opt-in, nickname only, points derived from measured mastery) and **delete my learning data**.
* **Landing page**: an opening count (the real 26-concept, 51-link prerequisite graph), a "draw a zero" gate, then a
  five-part scroll story (`frontend/src/experience`). Its words come from this file and the README. Its city is built
  from `curriculum/dsa_roadmap.md`: the 22 domains, real prerequisite roads between them, and tool chips only where the
  tool exists. Tests check all three against their sources. With reduced motion the story is five still cards.
  The story can use third-party placeholder assets: in development, and on the hosted site (`VITE_PLACEHOLDERS=ship`).
  A default build draws every stage itself and is checked to contain none of them (`frontend/ASSET-TODO.md`).

## Not built (honest scope)

Emotion recognition beyond the rapid-wrong and slow-answer heuristics, group challenges and discussion forums, class-wide
teacher dashboards and class averages (the shared view is per student), curated video content, social-media sharing of the
journal (PDF export exists), a mobile app. These are listed in the PRD's later phases.
