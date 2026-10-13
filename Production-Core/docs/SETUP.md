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
python scripts/migrate.py                             # creates the tables (safe to run again)
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
python -m pytest                                   # 221 offline tests (no network, no models)
python -m backend.app.rag.evaluation --neural      # retrieval ablation, writes docs/eval/results.json
python -m backend.app.rag.evaluation --neural --pg # same against Supabase
python scripts/smoke_test.py                       # end-to-end through the real SSE endpoint
cd frontend && npm run lint && npm test && npm run build   # 31 tests; the build also runs scripts/check-dist.mjs
```

## Environment variables

See `.env.example` (backend) and `frontend/.env.example`: every variable is documented there. The README has the full
tables. Key ones: `DATABASE_URL`, `FIREBASE_PROJECT_ID`, `MISTRAL_API_KEY` (plus optional `GEMINI_API_KEY`,
`GROQ_API_KEYS`, `LLM_PROVIDERS`), `ADMIN_EMAILS`, `ALLOWED_ORIGINS`, `ENV`, and for small servers `EMBEDDINGS=hosted` with
`HF_TOKEN`. Optional: `REDIS_URL` (agent message queue; nothing breaks without it), `JUDGE0_API_URL` / `JUDGE0_API_KEY`,
`ADMIN_MIN_GROUP`, `RAG_RATE_LIMIT_PER_MIN`. `AUTH_DISABLED=true` is for local development only and the server refuses
to start with it when `ENV=production`.

Docker instead: `cd infrastructure && docker compose up --build` (starts Redis, the backend from `backend/Dockerfile`
and the frontend dev server; reads `backend/.env`). Self-hosted Judge0:
`docker compose -f docker-compose.judge0.yml up -d`. Something failing? See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Deployment (free options)

**Backend**

* Small free host (Render free web service, 512 MB): deploy the image `ghcr.io/nikhilmamilla/kiddoo-backend:server`
  (`backend/Dockerfile.server`, published by `.github/workflows/backend-image.yml` on every push to `main` that touches
  the backend or its data). Set `EMBEDDINGS=hosted`, `HF_TOKEN`, `ENV=production` and `ALLOWED_ORIGINS=<frontend url>`,
  plus the keys from `.env.example`. The image has no PyTorch; the reranker and claim checker use their built-in
  fallbacks, and the process peaks near 160 MB.
* Host with ~1.5 GB RAM: `backend/Dockerfile` (the three models are baked into the image, full quality).
* Behind the host's proxy the image trusts `X-Forwarded-For` (`FORWARDED_ALLOW_IPS`), so per-client rate limits see real
  clients. Do not expose it directly to the internet without a proxy.
* Rate limits are in memory, per process: run one backend process (the default), or move them to Redis before scaling out.
* Free hosts sleep when idle, so the first request after a quiet spell can take up to a minute. Model weights download on
  first start in the full image; mount a cache volume or accept a one-off cold start.

**Frontend** (any static host works: Vercel, Netlify, Cloudflare Pages)

* Build with `npm run build` and publish `dist/`, with `VITE_API_URL`, `VITE_WS_URL` and the `VITE_FIREBASE_*` values set.
* Add the site's domain under Firebase → Authentication → **Authorised domains**, and the site's URL to the backend's
  `ALLOWED_ORIGINS`.
* **The maintainer's Vercel project** (`.vercel/project.json`, root `Production-Core/frontend`, `vercel.json` for caching,
  security headers and the SPA rewrite) is deployed from a machine that holds the landing story's placeholder asset
  files, which are not in git: `npx vercel deploy --prod` uploads the local folder (`.vercelignore` excludes secrets,
  the Python environment, dependencies and build output), and the Vercel env var `VITE_PLACEHOLDERS=ship` makes the build
  include them. **A `git push` does not update that site.** Anyone else deploying gets the code-drawn story, which needs
  no extra files. Details: [FRONTEND.md](FRONTEND.md) and [../frontend/ASSET-TODO.md](../frontend/ASSET-TODO.md).

**CI** (GitHub Actions): backend tests on `Production-Core/backend|data|supabase` changes; frontend lint, tests and build
on `Production-Core/frontend`, `curriculum` and challenge changes; the backend image on `main`.
