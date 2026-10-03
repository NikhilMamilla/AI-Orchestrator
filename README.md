# Kiddoo: a DSA tutor that shows its evidence

**Kiddoo is an AI tutor for Data Structures and Algorithms (DSA) that never guesses.** It answers only from a curated
set of course notes. Every claim in an answer carries a numbered citation you can open, and each sentence is checked
against its sources before you see it. When the notes don't cover a question, Kiddoo says *"I don't have enough
evidence"* instead of making something up.

Around that tutor sits a learning system. It measures what you know from your own answers, decides what you should
study next, explains why, and lets you practise on real code that is actually run and graded.

> © 2026 NikhilMamilla. All rights reserved. See [LICENSE](LICENSE): viewing is allowed; copying, reuse or
> redistribution needs written permission.

---

## Contents

1. [What you can do with it](#what-you-can-do-with-it)
2. [How it works](#how-it-works)
3. [Tech stack](#tech-stack)
4. [Run it on your computer](#run-it-on-your-computer)
5. [Configuration (environment variables)](#configuration-environment-variables)
6. [Tests and checks](#tests-and-checks)
7. [Project structure](#project-structure)
8. [Deploying](#deploying)
9. [Troubleshooting](#troubleshooting)
10. [Documentation](#documentation)
11. [Copyright and licence](#copyright-and-licence)

---

## What you can do with it

| Feature | What it does |
|---|---|
| **Ask** | Ask any DSA question. You see each stage of the answer as it runs, numbered citations you can click to read the exact source passage, and a confidence score. Off-topic questions and prompt-injection attempts are refused. |
| **Learn** | A check question follows each answer. Your answers update a mastery estimate per concept (Bayesian Knowledge Tracing), schedule spaced reviews, and reorder your roadmap so prerequisites come first. |
| **Placement and goals** | A short adaptive test (about 8 questions) finds your level. Set a goal and a deadline and Kiddoo tells you whether it is realistic and builds a weekly plan. |
| **Challenges** | Debugging and coding exercises run in a real sandbox (Judge0) against hidden tests. Hints are available but cost a little mastery credit. |
| **Teach it back** | Explain a concept in your own words. Each sentence is checked against the course notes without using an AI model. |
| **Concepts map** | The real prerequisite graph of the 26 concepts, coloured by your mastery. |
| **Visualizer and Playground** | Watch algorithms step through real runs, or write and run code in the browser. |
| **Insights and Journal** | Decisions the five agents made for you, with their reasoning; badges from real progress; a learning journal you can export as a PDF. |
| **Share with a teacher or parent** | A private link that you can revoke and that expires. It shows your progress, never your answers or anything you typed. |
| **Settings and privacy** | Tutor tone, teaching style, session length, appearance, linked coding profiles (GitHub, LeetCode, Codeforces…), and full control over your data: export it, or delete part or all of it. |
| **Admin console** | For admins only: usage and answer-quality trends, content gaps, a question inspector, announcements and system health. Aggregates only, so no individual learner is identifiable. |

## How it works

```
 Browser (React app)
   │  sign in with Firebase (email/password or Google)  →  ID token
   ▼
 FastAPI backend  ── verifies the token on every request ──┐
   │                                                       │
   ├─ Ask:   question ─► safety guard ─► hybrid search (meaning + keywords)
   │                     ─► rerank ─► evidence gate (refuse if too weak)
   │                     ─► LLM writes an answer with citations
   │                     ─► every sentence checked against its source (NLI)
   │
   ├─ Learn: answers ─► mastery model (BKT) ─► review queue ─► roadmap
   ├─ Agents: Orchestrator · Knowledge · Teaching · Assessment · Analyst
   └─ Challenges ─► Judge0 sandbox (real code execution)
   ▼
 Supabase Postgres (+ pgvector)  ── all app data, course notes and their vectors
```

* **Knowledge base.** `Production-Core/data/knowledge/` holds 26 original DSA documents. They are split into passages,
  embedded and stored in Postgres, and only these passages are used to answer.
* **Retrieval.** Several reformulations of the question are searched by meaning (dense vectors) and by keywords (BM25).
  The results are fused, weighted for your level and for prerequisites, then reranked by a cross-encoder.
* **Honesty.** If the best evidence is too weak, Kiddoo refuses before spending an AI call. After generation, each
  sentence is checked for support, and unsupported answers are withheld.
* **Cost.** Every service used has a free tier, and the language model fails over automatically between Mistral,
  Gemini and Groq.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, framer-motion, three.js, Recharts, Monaco editor |
| Backend | Python 3.11, FastAPI, pydantic, psycopg 3 |
| AI / search | sentence-transformers (bge-small embeddings, MiniLM cross-encoder, NLI model), Mistral / Gemini / Groq APIs |
| Data | Supabase Postgres with pgvector and full-text search |
| Sign-in | Firebase Authentication (sign-in only; all data stays in Postgres) |
| Code execution | Judge0 CE |
| Tests and CI | pytest, Vitest, ESLint, GitHub Actions |

## Run it on your computer

### 1. What you need

* **Python 3.11 or newer** and **Node.js 20 or newer**.
* Free accounts on:
  * [Supabase](https://supabase.com), for the database;
  * [Firebase](https://console.firebase.google.com), for sign-in;
  * at least one language-model provider: [Mistral](https://console.mistral.ai), with
    [Gemini](https://aistudio.google.com/apikey) or [Groq](https://console.groq.com) as optional backups.
* About 1 GB of disk space for the Python packages and the AI models.

### 2. Get the code

```bash
git clone https://github.com/NikhilMamilla/AI-Orchestrator.git
cd AI-Orchestrator/Production-Core
```

### 3. Set up the database (Supabase)

1. Create a Supabase project.
2. Go to **Settings → Database → Connection string → Session pooler** and copy the connection string. It goes in
   `DATABASE_URL` in step 5.
3. The schema is created in step 5 with `python scripts/migrate.py`. Alternatively, paste each file in
   `supabase/migrations/` into the Supabase SQL editor, in number order.

### 4. Set up sign-in (Firebase)

1. Create a Firebase project. Under **Authentication → Sign-in method**, enable **Email/Password**, and **Google** if
   you want it.
2. Under **Project settings → Your apps**, add a **Web app** and keep its config values for step 6.

### 5. Start the backend

```bash
python -m venv venv
# Windows:      venv\Scripts\activate
# macOS/Linux:  source venv/bin/activate

pip install --extra-index-url https://download.pytorch.org/whl/cpu torch     # small CPU-only build
pip install -r backend/requirements-dev.txt

cp .env.example backend/.env       # then open backend/.env and fill in the values (see Configuration)
python scripts/migrate.py          # creates the tables (safe to run again)
python scripts/ingest_knowledge.py # loads the 26 course notes (first run downloads ~130 MB of models)

uvicorn backend.app.main:app --reload
```

The API now runs at **http://127.0.0.1:8000**, with interactive docs at `/docs`.

### 6. Start the frontend

In a second terminal:

```bash
cd Production-Core/frontend
cp .env.example .env.local         # fill in the Firebase web config from step 4
npm install
npm run dev
```

Open **http://localhost:5173**, create an account and start asking.

### 7. (Optional) Make yourself an admin

Put your email in `ADMIN_EMAILS` in `backend/.env` and restart the backend. Verify the email from
**Settings → Profile**, or sign in with Google, then sign out and back in. **Settings → Admin console** then opens the
admin console.

### Using Docker instead

```bash
cd Production-Core/infrastructure
docker compose up --build          # reads backend/.env and frontend/.env.local
```

For a self-hosted Judge0, run `docker compose -f docker-compose.judge0.yml up -d`.

## Configuration (environment variables)

The backend reads `Production-Core/backend/.env`; the template is
[`Production-Core/.env.example`](Production-Core/.env.example).

| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | yes | Supabase *session pooler* connection string |
| `FIREBASE_PROJECT_ID` | yes | Your Firebase project id; the backend accepts only that project's tokens |
| `MISTRAL_API_KEY` | yes (or another provider) | Language model key |
| `GEMINI_API_KEY`, `GROQ_API_KEYS` | optional | Backup providers, used automatically if one fails |
| `LLM_PROVIDERS` | optional | Order to try providers (default `mistral,gemini,groq`) |
| `ADMIN_EMAILS` | optional | Comma-separated admin emails (they count only once verified) |
| `ALLOWED_ORIGINS` | yes in production | The frontend URL(s) allowed to call the API |
| `ENV` | yes in production | Set to `production` to switch off all development shortcuts and the API docs |
| `JUDGE0_API_URL` | optional | Code-execution server (defaults to the free public Judge0 CE) |
| `RAG_NEURAL` | optional | `true` uses the AI models for search and checking; `false` uses a lightweight offline mode |
| `EMBEDDINGS`, `HF_TOKEN` | optional | `EMBEDDINGS=hosted` with a Hugging Face token runs without PyTorch (for small servers) |

The frontend reads `Production-Core/frontend/.env.local`; the template is
[`Production-Core/frontend/.env.example`](Production-Core/frontend/.env.example).

| Variable | What it is |
|---|---|
| `VITE_API_URL` | Backend URL (default `http://localhost:8000/api/v1`) |
| `VITE_WS_URL` | Backend WebSocket URL (default `ws://localhost:8000/api/v1/ws`) |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | Firebase web config |

**Never commit `.env` or `.env.local`.** Both are already excluded by `.gitignore`.

## Tests and checks

```bash
# backend (from Production-Core/, offline: no network or models needed)
python -m pytest                                   # 214 tests

# frontend (from Production-Core/frontend/)
npm run lint
npm test                                           # 31 tests
npm run build                                      # type-check, build, and verify the bundle

# end to end against a running backend (from Production-Core/)
python scripts/smoke_test.py

# reproduce the retrieval-quality numbers
python -m backend.app.rag.evaluation --neural
```

GitHub Actions runs the backend tests and the frontend lint, tests and build on every push.

## Project structure

```
.
├── LICENSE                  copyright and terms of use
├── README.md                this file
├── curriculum/              the DSA roadmap the course notes follow
├── .github/                 CI workflows and the pull-request template
└── Production-Core/
    ├── backend/
    │   ├── app/
    │   │   ├── api/v1/      HTTP, streaming and WebSocket endpoints
    │   │   ├── rag/         search, reranking, answer generation, checking, safety guard, evaluation
    │   │   ├── agents/      the five agents (Orchestrator, Knowledge, Teaching, Assessment, Analyst)
    │   │   ├── learning/    mastery, reviews, roadmap, challenges, journal, preferences, coding profiles
    │   │   ├── admin/       admin statistics (aggregates only), question inspector, audit log
    │   │   ├── services/    database, models and shared services
    │   │   └── tests/       the backend test suite
    │   ├── requirements.txt
    │   └── Dockerfile
    ├── frontend/
    │   ├── src/
    │   │   ├── pages/       one file per screen (Ask, Learn, Challenges, Settings…)
    │   │   ├── components/  shared UI pieces
    │   │   ├── admin/       the admin console
    │   │   ├── experience/  the animated landing story
    │   │   └── lib/         API clients, auth, helpers
    │   └── package.json
    ├── supabase/migrations/ the database schema, in order
    ├── data/
    │   ├── knowledge/       the 26 course notes (the only source of answers)
    │   ├── challenges/      coding and debugging challenges with hidden tests
    │   └── eval/            labelled questions for measuring quality
    ├── docs/                architecture, setup, security, RAG, learning, evaluation results
    ├── scripts/             migrate, ingest knowledge, smoke test, build/verify challenges
    └── infrastructure/      Docker Compose files
```

## Deploying

* **Backend, small free hosts (for example Render's free plan, 512 MB):** run the image built by
  `backend/Dockerfile.server`. GitHub Actions publishes it as `ghcr.io/nikhilmamilla/kiddoo-backend:server`. It has no
  PyTorch: set `EMBEDDINGS=hosted` and `HF_TOKEN`, and embeddings come from Hugging Face Inference (the same vectors as
  the local model, so nothing is re-ingested). The reranker and the sentence checker then use their built-in non-AI
  fallbacks. If the hosted service is down, search falls back to keywords instead of failing. The process peaks at
  about 160 MB.
* **Backend, larger hosts (~1.5 GB RAM):** `backend/Dockerfile` bakes the three models into the image for full quality.
* For either one, set `ENV=production` and `ALLOWED_ORIGINS=<your frontend URL>` plus the keys above.
* **Frontend:** any static host (Vercel, Netlify, Cloudflare Pages). Run `npm run build`, publish `dist/`, and set the
  `VITE_*` variables. Add the site's domain under Firebase → Authentication → **Authorised domains**.
* Free hosts sleep when idle. The first request after a quiet spell takes up to a minute while the backend wakes up.

Full details are in [docs/SETUP.md](Production-Core/docs/SETUP.md).

## Troubleshooting

| Problem | Fix |
|---|---|
| Every request returns 401 | `FIREBASE_PROJECT_ID` is missing or wrong in `backend/.env`. Sign out and in again |
| `failed to resolve host db.<ref>.supabase.co` | Use the **Session pooler** connection string, not the direct one |
| Answers say "Quoted from sources" | Every language-model provider failed, so Kiddoo fell back to quoting its sources; check your API keys |
| The first question is slow | The AI models load in the background after start-up; wait a moment, or run `ingest_knowledge.py` first |
| `Missing VITE_FIREBASE_API_KEY…` | Create `frontend/.env.local` from `frontend/.env.example` |

More fixes are in [docs/TROUBLESHOOTING.md](Production-Core/docs/TROUBLESHOOTING.md).

## Documentation

| Document | About |
|---|---|
| [ARCHITECTURE](Production-Core/docs/ARCHITECTURE.md) | How the pieces fit together |
| [SETUP](Production-Core/docs/SETUP.md) | Installation and deployment, in full |
| [RAG](Production-Core/docs/RAG.md) | The search and answer pipeline, and how it was measured |
| [LEARNING](Production-Core/docs/LEARNING.md) | Mastery, reviews, roadmap, agents and the landing story |
| [SECURITY](Production-Core/docs/SECURITY.md) | Threat model and protections |
| [DEMO](Production-Core/docs/DEMO.md) | A guided tour of the main features |
| [Evaluation results](Production-Core/docs/eval/results.md) | Retrieval-quality measurements |

## Copyright and licence

**© 2026 NikhilMamilla. All rights reserved.**

This project is proprietary. You may view it on GitHub, but you may not copy, modify, redistribute or reuse any part of
it, including the code, the course notes, the challenges or the designs, without written permission. See
[LICENSE](LICENSE) for the full terms. To ask for permission, contact [NikhilMamilla on GitHub](https://github.com/NikhilMamilla).

Third-party libraries and models used by the project remain under their own licences.
