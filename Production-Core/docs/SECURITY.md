# Security

## What was wrong before (audit findings)

| Finding | Severity | Fix |
|---|---|---|
| No endpoint verified the caller; WebSocket accepted anyone | Critical | Supabase JWT verification on every REST route (`get_current_user`) and on the WebSocket's first frame |
| `user_id` / `student_id` taken from query string or body (IDOR: read anyone's dashboard/profile) | Critical | Identity comes only from the verified token; client-supplied ids are ignored |
| CORS `*` with credentials | High | Explicit origin allow-list (`ALLOWED_ORIGINS`), limited methods/headers |
| `str(exception)` returned to clients | Medium | Generic messages; details go to server logs |
| Default `SECRET_KEY`, secrets in `.env` files in tree | High | No server-signed tokens are used any more; `.env*` git-ignored; `.env.example` documents everything; only the *publishable* key reaches the browser |
| Fake `time`/`memory` in code-run responses | Low (integrity) | Only engine-reported values are returned |
| No rate limits | Medium | Sliding-window limiter per user on `ask`, `upload`, `run` |
| Unvalidated uploads (n/a before: no upload) | — | Allow-list of types, 2 MB cap, UTF-8/binary checks, `%PDF` magic, encrypted PDFs refused |

## Authentication & authorization

* Tokens: RS/ES256 via the project's JWKS (cached, refreshed on unknown `kid`) or HS256 if
  `SUPABASE_JWT_SECRET` is set. The algorithm is chosen from an allow-list per mode, never blindly from
  the token → `alg=none` and HS256/public-key confusion are rejected (covered by tests).
* Checks: signature, `iss = <SUPABASE_URL>/auth/v1`, `aud = authenticated`, `exp`, non-empty `sub`.
* Fails **closed** if Supabase is not configured.
* `AUTH_DISABLED` is a dev-only escape hatch; the server refuses to start with it when `ENV=production`.
* Admin = `app_metadata.role == "admin"` (only writable server-side) or an email in `ADMIN_EMAILS`. **Caveat:** the email route trusts the address in the token, so keep "Confirm email" enabled in Supabase Auth (otherwise anyone could sign up with an admin's address); prefer the `app_metadata.role` route.
* Database: RLS on every table; `auth.uid()` scoping; knowledge tables are read-only to users.
* WebSocket token travels in the first frame, not the URL (URLs end up in logs).

## RAG-specific threats

Threat model: a malicious *document* or *question* tries to hijack the model, leak the prompt/keys, or
make the system assert false things confidently.

1. **Ingest-time quarantine** – instruction-like spans ("ignore previous instructions…", chat-template
   tokens, "reveal your system prompt") are replaced with a marker before chunking; the count is reported
   to the uploader.
2. **Query screening** – length, control characters and the same injection patterns are rejected before
   any retrieval or model call.
3. **Delimiter neutralisation** – evidence text cannot close/open `<evidence>` or fake `<system>` tags.
4. **Untrusted-data prompt** – the system prompt declares evidence to be data, forbids following
   instructions found in it, and forbids revealing rules/keys.
5. **Output verification** – every sentence must be supported by cited evidence (lexical + semantic
   check); unsupported claims are flagged, and a mostly-unsupported answer is withheld.
6. **FTS injection** – free text is reduced to quoted alphanumeric tokens before it reaches
   `MATCH`/`to_tsquery`; SQL is parameterised throughout.
7. **XSS** – answers render through React-Markdown; model-supplied links are never rendered as
   anchors (only `[n]` citation chips are interactive).

Honest limits: pattern matching cannot catch every paraphrased injection. It is one layer; the claim
verifier and the "evidence only" contract are the backstops, and uploads are admin-only.

## Production audit (2026-10)

* Live-session WebSockets are registered only after authentication, keyed by the verified user. Two learners can never
  share or replace one another's connection.
* `/agents/*` act on the caller only. Another learner's `student_id` gets a 403, and request bodies are typed (422 on
  bad input).
* "Delete my data" runs in one transaction.
* Proxy client addresses are trusted for the rate limits.

## Secrets

Never commit `.env`. Rotate any key that has appeared in a chat, screenshot or shared document — in
particular the Supabase **database password** and Groq keys used while building this project.

## Reporting

Open a private issue on the repository.

## Added in the learning-system work

* **Share links** (`api/v1/share.py`): 256-bit random tokens, only the SHA-256 hash is stored, 30-day expiry, owner can
  revoke, public view is rate-limited per client address, and unknown/expired/revoked links return one identical 404.
  The view is built from an allow-list of fields and never contains answers, questions or free text. Verified against the
  real database (create, view, forged token, revoke, double revoke, revoke by another user). The shared page sets
  `noindex` and `no-referrer`; the API sends `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.
* **Content gaps**: refused questions are stored with no user column (RLS on, no policies, server-only access), shown to
  admins only, clustered by meaning, deleted after 90 days.
* **Per-learner data in traces**: mastery-based personalisation is removed before a trace enters the admin metrics buffer.
* **JWKS refetch cooldown**: a forged `kid` can no longer make the server fetch signing keys on every request.
* **Admin by email** trusts the address in the token; keep "Confirm email" enabled in Supabase or use `app_metadata.role`.

