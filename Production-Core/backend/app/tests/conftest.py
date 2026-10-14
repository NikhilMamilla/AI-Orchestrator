import os
from pathlib import Path

# Environment variables beat backend/.env, so setting these before anything imports the settings keeps a developer's local
# .env (a dead DATABASE_URL, real API keys) out of the tests. The suite runs in development mode; real runs default to production.
for _name, _value in {"ENV": "development", "EMBEDDINGS": "local", "AUTH_DISABLED": "false", "DATABASE_URL": "", "SUPABASE_URL": "",
                      "SUPABASE_JWT_SECRET": "", "FIREBASE_PROJECT_ID": "", "HF_TOKEN": "", "ADMIN_EMAILS": "", "APP_SECRET": "",
                      "MISTRAL_API_KEY": "", "MISTRAL_API_KEYS": "", "GEMINI_API_KEY": "", "GEMINI_API_KEYS": "", "GROQ_API_KEY": "",
                      "GROQ_API_KEYS": "", "JUDGE0_API_KEY": ""}.items():
    os.environ[_name] = _value

import pytest

from backend.app.rag.embeddings import CachedEmbedder, HashingEmbedder
from backend.app.rag.ingest import Ingestor
from backend.app.rag.store import KnowledgeStore

KNOWLEDGE = Path(__file__).resolve().parents[3] / "data" / "knowledge"


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from backend.app.main import app      # imported lazily so unit tests don't need the whole app
    return TestClient(app)


@pytest.fixture
def embedder():
    return CachedEmbedder(HashingEmbedder())


@pytest.fixture
def empty_store():
    s = KnowledgeStore(":memory:")
    yield s
    s.close()


@pytest.fixture(scope="module")
def kb():
    """Real corpus ingested once per module with the offline embedder."""
    emb = CachedEmbedder(HashingEmbedder())
    store = KnowledgeStore(":memory:")
    report = Ingestor(store, emb).ingest_directory(KNOWLEDGE)
    assert not report.failed, report.failed
    return store, emb
