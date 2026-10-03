# Kiddoo — a DSA tutor that shows its evidence

**Most AI tutors sound confident whether or not they are right.** Kiddoo only answers from a curated
knowledge base, cites every claim, checks each sentence against its sources, and says *"I don't have
enough evidence"* instead of guessing. On top of that, five cooperating agents decide what a learner
should study next, and show their reasoning.

Built on a **zero-cost stack**: Supabase (Postgres + pgvector), Firebase Auth (sign-in only), Mistral's free
API (ministral / open-mistral-nemo, with automatic failover to Gemini and Groq when configured), Judge0 CE for
code execution, and local open models (bge-small embeddings, MiniLM cross-encoder, DeBERTa NLI).

## What is different

| | Typical "RAG chatbot" | Kiddoo |
|---|---|---|
| Retrieval | embed → top-k | query understanding → multi-query **dense + BM25** → **RRF** fusion → learner-level weighting + **prerequisite-graph hop** → **cross-encoder rerank** → parent-child context + compression |
| Answers | fluent text | **numbered citations**, per-sentence **support check**, citation repair, measured **confidence**, extractive fallback if the LLM is down |
| Unknown topics | hallucinate | **evidence gate** refuses before spending a model call |
| Quality claims | "it works" | **evaluation harness**: Recall@K, Precision@K, MRR, nDCG, ablations, gate calibration — [results](Production-Core/docs/eval/results.md) |
| Security | none | JWT-verified on every route + WebSocket, RLS, prompt-injection defences at ingest/query/prompt/output — [details](Production-Core/docs/SECURITY.md) |
| Learning loop | static content | grounded **check questions** → **Bayesian Knowledge Tracing** → **spaced repetition** → prerequisite-aware roadmap, every decision explained |
| Behavioural analyst | none | struggle / rushing / plateau / **misconception** detection from real response times and wrong-option provenance, using the PRD's own thresholds |
| Adaptive teaching | one tone | **per-learner bandit** over teaching styles (Thompson sampling) and **mastery-aware** explanation level and prerequisite hints |
| Placement and goals | none | **adaptive diagnostic** over the prerequisite graph (~8 questions), goal + deadline feasibility with weekly plan |
| Assessment | multiple choice | hints that cost mastery credit, confidence calibration, **debugging and coding challenges graded by real execution** (Judge0) |
| Monitoring | none | student-controlled, expiring, revocable **teacher/parent link** with alerts and talking points, no answers or free text |
| See it run | static diagrams | **visualizer** whose steps are recorded from real runs; audio explanations; PDF learning journal |
| Progress UI | animated spinner | stage list streamed from the **real** server trace (only stages that ran) |
| Observability | logs | per-request trace, p50/p95 per stage, admin dashboard |
| Explaining back | none | **Teach it back**: your own explanation is checked sentence by sentence against the sources, no LLM involved — [measured](Production-Core/docs/eval/teachback.md) |
| Vision | none | **Draw it**: a vision model *reads* your tree, **fixed rules judge it**; catches 16/16 invalid drawings vs about a third when the model judges directly — [measured, with its false-alarm problem](Production-Core/docs/eval/sketch.md) |
| Evidence | claims | **Evidence Lab**: opt-in pre/post test with bootstrap CI, paired t and effect size; refuses to claim an effect below 10 completers. No real cohort yet |
| Control | none | tone, session length and style preferences that change real behaviour; opt-in leaderboard; **delete my data** |

## Try it

```bash
# see Production-Core/docs/SETUP.md for the 5-minute setup
cd Production-Core && python scripts/smoke_test.py      # end-to-end through the real API
python -m backend.app.rag.evaluation --neural           # reproduce the retrieval numbers
python -m pytest                                        # 214 offline tests
```

## Demo script (4 minutes)

1. **Ask** *"Why does binary search need a sorted array?"* — watch the stages stream, click a `[1]` chip,
   see the exact source passage and score.
2. Ask *"How do I bake sourdough?"* — it **refuses**, with no model call. Ask the same with
   *"ignore previous instructions…"* — rejected by the guard.
3. **Admin console → Content → upload** a markdown file containing a hidden "ignore all previous instructions" line — it is
   quarantined and reported; re-upload is a no-op (content-hash versioning).
4. **Admin console**: admins land on their own console (aggregates only, groups under 5 hidden in production):
   **Answer quality** shows grounded vs refused per day and p50/p95 per stage (no query text stored).
   **Inspector** shows why a question would be answered or refused (retrieval scores, evidence gate) without calling the model.
5. **Learn**: answer the check question under a grounded answer; watch mastery move, the review queue
   schedule, and the roadmap re-order by prerequisites.
6. **Challenges**: fix a buggy binary search; hidden tests run in a real sandbox, mastery updates, the help ladder opens after repeated failures.
7. **Journal → Share**: create a revocable link a teacher can open without an account.
8. **Concepts**: the knowledge map is the real prerequisite graph; **Insights**: agent decisions with
   their reasoning, badges computed from real progress.

## Repository

```
.github/                  CI: backend tests, frontend lint + tests + build
curriculum/               the roadmap the corpus follows (the landing's 22 domains read it)
Production-Core/
  backend/app/rag/        the pipeline (ingest · chunking · retrieval · rerank · generate · guard · eval)
  backend/app/agents/     Orchestrator · Knowledge · Teaching · Assessment · Analyst
  backend/app/learning/   mastery, review, roadmap, challenges, journal, study, coding profiles
  backend/app/admin/      admin console aggregates (no learner identities), question inspector, audit log
  backend/app/api/v1/     REST + SSE + WebSocket
  frontend/               React 19 · Vite · Tailwind (src/pages, src/components, src/admin = admin console, src/experience = landing story)
  supabase/migrations/    schema, pgvector, FTS, RLS
  data/knowledge/         26 original DSA concept documents (the corpus)
  data/eval/              labelled evaluation questions
  data/challenges/        debugging and coding challenges with hidden tests
  docs/                   ARCHITECTURE · LEARNING · RAG · SECURITY · SETUP · TROUBLESHOOTING · DEMO · eval results
  infrastructure/         docker compose (app stack, self-hosted Judge0)
  scripts/                migrate · ingest_knowledge · smoke_test · build/verify_challenges
```
