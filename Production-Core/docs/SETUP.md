# Setup (zero cost)

You need: Python 3.11+, Node 20+, a free [Supabase](https://supabase.com) project (data), a free
[Firebase](https://console.firebase.google.com) project (sign-in only) and a free LLM key
([Mistral](https://console.mistral.ai), with Gemini and Groq as optional fallbacks).

## 1. Supabase (all data)

1. Create a project. Note the **Project URL** (Settings → API).
2. Settings → Database → *Connection string* → **Session pooler** (IPv4). Put it in `DATABASE_URL`.
   The direct `db.<ref>.supabase.co` host is IPv6-only on the free tier and often fails to resolve.
3. Apply the schema: `python scripts/migrate.py` (idempotent, tracked in `schema_migrations`), or
   paste `supabase/migrations/*.sql` into the SQL editor in order.

## 2. Firebase (sign-in only)

1. Create a project, then Authentication → Sign-in method: enable **Email/Password** and optionally **Google**.
2. Project settings → Your apps → add a **Web app**; copy its config into `frontend/.env.local` (`VITE_FIREBASE_*`).
3. Put the project id in `backend/.env` as `FIREBASE_PROJECT_ID`. The backend verifies every Firebase ID token.
4. Admins: list their emails in `ADMIN_EMAILS`. An admin email counts only once it is **verified**
   (Settings → Profile → *Send verification link*, or sign in with Google).

## 3. Backend

```bash
cd Production-Core
python -m venv venv && venv/Scripts/activate          # source venv/bin/activate on macOS/Linux
pip install --extra-index-url https://download.pytorch.org/whl/cpu torch   # small CPU build
pip install -r backend/requirements-dev.txt
cp .env.example backend/.env                          # fill DATABASE_URL, FIREBASE_PROJECT_ID, MISTRAL_API_KEY, ADMIN_EMAILS
python scripts/ingest_knowledge.py                    # embeds data/knowledge into Supabase (first run downloads ~130 MB of models)
uvicorn backend.app.main:app --reload                 # http://127.0.0.1:8000/docs
```

No Supabase yet? Leave `DATABASE_URL` empty: the RAG store falls back to a local SQLite file and you can
develop with `AUTH_DISABLED=true` (never in production).

## 4. Frontend

```bash
cd frontend
cp .env.example .env.local        # API URL + Firebase web config
npm install
npm run dev                       # http://localhost:5173
```

## 5. Verify

```bash
python -m pytest                                   # offline suite (no network, no models)
python -m backend.app.rag.evaluation --neural      # retrieval ablation, writes docs/eval/results.json
python -m backend.app.rag.evaluation --neural --pg # same against Supabase
python scripts/smoke_test.py                       # end-to-end through the real SSE endpoint
cd frontend && npm run build
```

## Environment variables

See `.env.example` (backend) and `frontend/.env.example` — every variable is documented there. Key ones: `DATABASE_URL`, `FIREBASE_PROJECT_ID`,
`MISTRAL_API_KEY` (plus optional `GEMINI_API_KEY`, `GROQ_API_KEYS`), `ADMIN_EMAILS`, `ALLOWED_ORIGINS`, `ENV`.

Docker instead: `cd infrastructure && docker compose up --build` (reads `backend/.env`). Self-hosted Judge0:
`docker compose -f docker-compose.judge0.yml up -d`. Something failing? See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Deployment (free options)

* Backend: Hugging Face Spaces (Docker, 16 GB RAM free) or Render free web service; `backend/Dockerfile`
  builds with CPU torch. Set `ENV=production`, `ALLOWED_ORIGINS=<frontend url>`.
* Frontend: Vercel / Netlify / Cloudflare Pages (`npm run build`, publish `dist/`), with `VITE_API_URL`
  and the `VITE_FIREBASE_*` values; add the site to Firebase → Authentication → Authorised domains.
* Behind the host's proxy the backend image trusts `X-Forwarded-For` (`FORWARDED_ALLOW_IPS` in `backend/Dockerfile`), so
  per-client rate limits see real clients. Do not expose that image directly to the internet without a proxy.
* Rate limits are in memory, per process: run one backend process (the default), or move them to Redis before scaling out.
* Free-tier note: the model weights download on first start; mount a cache volume or accept a one-off
  cold start.
