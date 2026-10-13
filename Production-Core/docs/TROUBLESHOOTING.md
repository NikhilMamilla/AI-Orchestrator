# Troubleshooting

Symptoms we actually hit while building this, and what fixed them.

## Database / Supabase
| Symptom | Cause | Fix |
|---|---|---|
| `failed to resolve host 'db.<ref>.supabase.co'` | The direct host is IPv6-only on the free tier | Use the **Session pooler** string (`aws-0-<region>.pooler.supabase.com`, user `postgres.<ref>`) |
| `pool initialization incomplete` on Windows | psycopg's *async* pool cannot use the Windows default event loop | Already handled: the app uses the sync pool in worker threads |
| `Tenant or user not found` | Wrong pooler region | Try the region shown in Supabase → Settings → Database |
| Every protected route returns 401 | `FIREBASE_PROJECT_ID` empty, or a token from a different Firebase project | Set `FIREBASE_PROJECT_ID` in `backend/.env`; sign in again. For local dev only: `AUTH_DISABLED=true` |
| `function match_chunks_dense does not exist` | Migrations not applied | `python scripts/migrate.py` |

## LLM providers
| Symptom | Cause | Fix |
|---|---|---|
| Answers say "Quoted from sources" | Every provider failed, so the system degraded to extractive answers (by design) | Check `/rag/admin/metrics` → `failure:llm_unavailable`, and the key/quota of each provider |
| Groq `Organization has been restricted` | Account-level block | Use another provider; the router already fails over and cools the dead one down |
| Gemini `404 … no longer available to new users` | Retired model id | Defaults use the rolling `gemini-flash-latest` alias |
| Mistral `429` on `mistral-small` | The free tier gives that model zero quota | Defaults use `ministral-14b/8b` and `open-mistral-nemo` |

## Performance
| Symptom | Cause | Fix |
|---|---|---|
| First request takes a minute | Models download/load on first use | Run `scripts/ingest_knowledge.py` once; keep the process warm; cache `~/.cache/huggingface` in Docker |
| Rerank stage slow | Cross-encoder on a busy CPU | `RAGConfig.pool` controls how many candidates are reranked; `RAG_NEURAL=false` disables it |
| Retrieval slow | Database far from the server | Deploy the backend in the same region as Supabase; metadata is cached for 60 s |

## Hosting
| Symptom | Cause | Fix |
|---|---|---|
| The browser blocks API calls (CORS error) | The site's URL is not in `ALLOWED_ORIGINS` | Set `ALLOWED_ORIGINS=<frontend url>` on the backend (several URLs, comma separated) |
| The first request takes up to a minute | Free hosts sleep when idle | Wait, or open the site a minute before a demo |
| Search quality drops on the small server | `EMBEDDINGS=hosted` and the Hugging Face service is down or `HF_TOKEN` is missing, so search fell back to keywords | Check `HF_TOKEN`; the trace shows which scorer ran |
| Live session closes immediately (code 4401) | The first WebSocket frame was not a valid `{"type":"auth","token":…}` | Sign in again; check `VITE_WS_URL` |
| Pushed to GitHub but the hosted site did not change | The frontend is deployed with the Vercel CLI, not by a push | Run `npx vercel deploy --prod` from the repository root ([SETUP.md](SETUP.md)) |

## Frontend
- `Missing VITE_FIREBASE_API_KEY…` at start-up: create `frontend/.env.local` from `frontend/.env.example`.
- Admin page says "Verify your email": the admin email must be verified (Settings → Profile), then sign out and back in.
- Google sign-in says "unauthorised domain": add the site to Firebase → Authentication → Authorised domains.
- Build failures after dependency changes: delete `frontend/node_modules` and run `npm ci`.
- The landing story shows five still cards instead of the animation: the OS asks for reduced motion, or the browser has no WebGL. Both are intended.
- The landing story looks plain or shows no hands, glass or clouds: the placeholder asset files are missing. The code-drawn versions are used instead, which is the normal state of a default build.
- `check-dist` fails the build: a placeholder file, a paid font name or a `/placeholder-assets/` URL reached `dist/`. Build without `VITE_PLACEHOLDERS=ship`, or remove the file named in the message.
- The floating light specks do not show: *Settings → Appearance → Floating light* is off, *Reduce motion* is on, or you are on a phone (app pages on phones draw a plain sky).
