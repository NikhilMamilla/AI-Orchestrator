# Security

The threat model, what protects each part, and the limits we know about. System layout is in
[ARCHITECTURE.md](ARCHITECTURE.md); setup of the secrets is in [SETUP.md](SETUP.md).

## Authentication and authorization

Sign-in is **Firebase Authentication** (email/password and Google). Firebase only proves who someone is; all learner
data is in Supabase Postgres and is reached only through this API.

* **Every request is verified server-side** (`security.py`). A Firebase ID token must be RS256, signed by one of
  Google's published keys (cached for an hour, refreshed when an unknown `kid` appears, with a 60-second cool-down so a
  forged `kid` cannot make the server fetch keys on every request), with `aud` = `FIREBASE_PROJECT_ID`,
  `iss` = `https://securetoken.google.com/<project>`, a valid `exp` and a subject. Any other algorithm, including
  `alg=none`, is rejected.
* **Identity comes only from the token.** The Firebase uid is mapped to a stable UUID (uuid5). A `user_id` or
  `student_id` in a query string or body is never trusted; asking for another learner's id returns 403.
* **Fails closed.** Without `FIREBASE_PROJECT_ID` (or the legacy Supabase settings) every protected route answers 401.
* **Legacy mode.** If `FIREBASE_PROJECT_ID` is empty, Supabase Auth JWTs are accepted instead (ES256/RS256 via JWKS, or
  HS256 with `SUPABASE_JWT_SECRET`; the algorithm is chosen from an allow-list per mode, never from the token).
* **`AUTH_DISABLED`** is a development shortcut. It is honoured only when `ENV` is not `production`, and the server
  refuses to start with it in production.
* **Admin** = a verified email listed in `ADMIN_EMAILS`, or (legacy mode) `app_metadata.role == "admin"`. With Firebase
  an admin email counts only once **`email_verified`** is true, so nobody can claim an admin address by signing up with
  it. Every admin route depends on `require_admin`.
* **Database:** RLS on every table; knowledge tables are read-only to users; `rag_requests`, `content_gaps`,
  `announcements` and `admin_audit` have RLS on and no policies, so only the API's database role can touch them.
* **WebSocket:** the token travels in the first frame (`{"type":"auth","token":…}`), never in the URL, where it would end
  up in logs. A connection is registered only after authentication and is keyed by `user_id:session_id`, so two learners
  can never share or replace one another's connection. A bad first frame closes with code 4401.

## Transport, headers and abuse limits

* **CORS:** an explicit origin allow-list (`ALLOWED_ORIGINS`), methods `GET POST PUT DELETE OPTIONS`, headers
  `Authorization` and `Content-Type`. Never `*` with credentials.
* **Response headers (API):** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
  `Cache-Control: no-store`. The static site adds `nosniff`, `X-Frame-Options: DENY` and a strict referrer policy
  (`frontend/vercel.json`). In production the API docs and OpenAPI schema are switched off.
* **Rate limits** (sliding window, per user, or per client address when unauthenticated): ask 20/min (configurable with
  `RAG_RATE_LIMIT_PER_MIN`), quiz 20, challenge submit 12, code run 30, teach-back 10, sketch 6, coding-profile verify 6,
  share create 10, upload 5, `/agents/*` 12 and `/sessions/*` 20 (both reach the LLM), public share view 30 and account lookup 5 per address.
  The live session WebSocket allows 30 messages per learner per minute, 3 handlers in flight per connection and 16,000
  characters per message. Every request body is capped at 1 MB (3 MB for the document upload) and refused with 413 before it is parsed. Limits live in memory, per process:
  run one backend process or move them to Redis before scaling out. Behind a host's proxy the backend image trusts
  `X-Forwarded-For` (`FORWARDED_ALLOW_IPS`), so do not expose that image directly to the internet.
* **Errors:** clients get generic messages; details go to server logs. A database outage returns 503 with a plain message.
* **Uploads (admin only):** type allow-list, 2 MB cap, UTF-8/binary checks, `%PDF` magic, encrypted PDFs refused.

## RAG-specific threats

Threat model: a malicious *document* or *question* tries to hijack the model, leak the prompt or keys, or make the
system assert false things confidently.

1. **Ingest-time quarantine.** Instruction-like spans ("ignore previous instructions…", chat-template tokens, "reveal your
   system prompt") are replaced with a marker before chunking; the count is reported to the uploader.
2. **Query screening.** Length, control characters and the same injection patterns are rejected before any retrieval
   or model call.
3. **Delimiter neutralisation.** Evidence text cannot close or open `<evidence>` or fake `<system>` tags.
4. **Untrusted-data prompt.** The system prompt declares evidence to be data, forbids following instructions found in it,
   and forbids revealing rules or keys.
5. **Output verification.** Every sentence must be supported by cited evidence (lexical + semantic + NLI check);
   unsupported claims are flagged and a mostly-unsupported answer is withheld.
6. **FTS injection.** Free text is reduced to quoted alphanumeric tokens before it reaches `MATCH` / `to_tsquery`; SQL is
   parameterised throughout.
7. **XSS.** Answers render through React-Markdown; model-supplied links are never rendered as anchors (only `[n]`
   citation chips are interactive).

**Honest limits.** Pattern matching cannot catch every paraphrased injection: the guard blocked 72% of 40 attacks with
zero false positives on 101 benign questions ([eval/redteam.md](eval/redteam.md)). It is one layer; the claim verifier
and the "evidence only" contract are the backstops, and the verifier is a signal, not a guarantee
([eval/verifier.md](eval/verifier.md)).

## Privacy

* **Share links** (`api/v1/share.py`): 256-bit random tokens, only the SHA-256 hash is stored, 30-day expiry, owner can
  revoke. The public view is rate limited per address and built from an allow-list of fields: never answers, questions
  or free text. Unknown, expired and revoked links return one identical 404. The shared page sets `noindex` and
  `no-referrer`; the API sends `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.
* **Content gaps:** refused questions are stored with no user column, shown to admins only, clustered by meaning and
  deleted after 90 days.
* **Admin console:** aggregates only. Any group smaller than `ADMIN_MIN_GROUP` (5, production only) is hidden, and
  mastery-based personalisation is removed from traces before they enter the admin metrics buffer. Admin actions are
  written to `admin_audit` (the actor is the admin's own email).
* **Study data and the leaderboard are opt-in.** The leaderboard shows nicknames only. The Evidence Lab CSV export is
  anonymised.
* **Your data:** *Settings → Privacy & data* exports everything, or deletes a part or all of it. "Delete my data" runs in one
  transaction.
* **Account lookup** (`POST /auth/account-check`, used by "Forgot password"): it looks an email up by a keyed HMAC hash
  (the email itself is not stored for this) and says whether an account exists and which sign-in methods it has. That
  lets someone test whether an address has an account, which is a deliberate usability trade-off, limited to 5 requests
  per minute per address. A phishing-resistant alternative would be to always answer "if an account exists, we sent an
  email".
* **Coding profiles:** a verification code derived from a server-only secret proves ownership of a GitHub, LeetCode or
  Codeforces profile; each check is rate limited because it reads a third-party site.

## Audit history

| Finding (early builds) | Severity | Fix |
|---|---|---|
| No endpoint verified the caller; the WebSocket accepted anyone | Critical | Token verification on every REST route and on the WebSocket's first frame |
| `user_id` / `student_id` taken from the query string or body (IDOR) | Critical | Identity comes only from the verified token |
| CORS `*` with credentials | High | Explicit origin allow-list |
| `str(exception)` returned to clients | Medium | Generic messages; details in server logs |
| Default `SECRET_KEY`, secrets in files in the tree | High | No server-signed tokens; `.env*` git-ignored; `.env.example` documents everything; only public Firebase web config reaches the browser |
| Fake `time` / `memory` in code-run responses | Low (integrity) | Only engine-reported values are returned |
| No rate limits | Medium | Sliding-window limiters (above) |
| Unvalidated uploads | Medium | Allow-list, size cap, magic-number and encryption checks, admin only |

**Production audit (2026-10).** Live-session WebSockets are registered only after authentication, keyed by the verified
user. `/agents/*` act on the caller only (403 for another learner's id, typed bodies, 422 on bad input). "Delete my data"
is one transaction. Proxy client addresses are trusted for the rate limits.

## Secrets

Never commit `.env` or `.env.local` (both are git-ignored). Rotate any key that has appeared in a chat, screenshot or
shared document, in particular the Supabase **database password** and LLM provider keys. The Firebase web config
(`VITE_FIREBASE_*`) is public by design; the server-side secrets are `DATABASE_URL`, the LLM keys, `HF_TOKEN` and
`JUDGE0_API_KEY`. The frontend deploy uploads files with `.vercelignore`, which excludes `.env*`, the Python
environment, dependencies and build output.

## Reporting

Open a private issue on the repository.
