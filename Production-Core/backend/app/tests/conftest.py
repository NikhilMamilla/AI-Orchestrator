from pathlib import Path

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
