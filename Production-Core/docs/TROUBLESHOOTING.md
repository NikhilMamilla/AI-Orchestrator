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

## Frontend
- `Missing VITE_FIREBASE_API_KEY…` at start-up: create `frontend/.env.local` from `frontend/.env.example`.
- Admin page says "Verify your email": the admin email must be verified (Settings → Profile), then sign out and back in.
- Google sign-in says "unauthorised domain": add the site to Firebase → Authentication → Authorised domains.
- Build failures after dependency changes: delete `frontend/node_modules` and run `npm ci`.
