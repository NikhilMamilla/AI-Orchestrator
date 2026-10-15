"""PostgresKnowledgeStore against a real Postgres with pgvector.

Runs only when TEST_DATABASE_URL is set (a throwaway database; e.g. a local `pgvector/pgvector` container) and is skipped
otherwise. It applies the documents/chunks part of migration 0001 and cleans up the rows it adds.
"""
import os
import re
from pathlib import Path

import numpy as np
import pytest

from backend.app.rag.types import Chunk, Document

DSN = os.environ.get("TEST_DATABASE_URL", "")
pytestmark = [pytest.mark.postgres, pytest.mark.skipif(not DSN, reason="TEST_DATABASE_URL is not set")]

MIGRATION = Path(__file__).resolve().parents[4] / "supabase" / "migrations" / "0001_init.sql"
DIM = 384


def vec(axis: int) -> np.ndarray:
    v = np.zeros(DIM, dtype=np.float32)
    v[axis] = 1.0
    return v


def make(doc_id: str, text: str, axis: int, level: int = 1):
    doc = Document(id=doc_id, title=doc_id.title(), source=f"{doc_id}.md", level=level, domain="test",
                   prerequisites=[], tags=["t"], content_hash="h-" + doc_id)
    section = Chunk(id=f"{doc_id}#s", doc_id=doc_id, parent_id=None, kind="section", heading_path=doc.title,
                    text=text, ordinal=0, level=level)
    passage = Chunk(id=f"{doc_id}#p", doc_id=doc_id, parent_id=section.id, kind="passage", heading_path=doc.title,
                    text=text, ordinal=1, level=level)
    return doc, [section, passage], {section.id: "hs-" + doc_id, passage.id: "hp-" + doc_id}, {passage.id: vec(axis)}


@pytest.fixture(scope="module")
def store():
    from backend.app.rag.pg_store import PostgresKnowledgeStore
    s = PostgresKnowledgeStore(DSN, pool_size=2)
    sql = MIGRATION.read_text(encoding="utf-8")
    head = re.split(r"create table if not exists profiles", sql, maxsplit=1)[0]     # extension, documents, chunks, match_* functions
    with s.pool.connection() as c:
        c.execute(head)
    yield s
    for d in ("zz_alpha", "zz_beta"):
        s.delete_document(d)
    s.close()


@pytest.fixture(autouse=True)
def two_documents(store):
    store.replace_document(*make("zz_alpha", "Binary search halves a sorted array at every step.", 0))
    store.replace_document(*make("zz_beta", "Hash tables map keys to buckets in constant time.", 1, level=2))
    yield


def test_list_documents_returns_both(store):
    ids = {d.id for d in store.list_documents()}
    assert {"zz_alpha", "zz_beta"} <= ids


def test_get_chunks_by_id(store):
    got = store.get_chunks(["zz_alpha#p", "zz_beta#s", "missing"])
    assert set(got) == {"zz_alpha#p", "zz_beta#s"} and got["zz_alpha#p"].kind == "passage"
    assert store.get_chunks([]) == {}


def test_bm25_search_with_and_without_doc_ids(store):
    hits = [i for i, _ in store.bm25_search("binary search sorted array", k=10)]
    assert "zz_alpha#p" in hits
    assert store.bm25_search("binary search", k=10, doc_ids=["zz_beta"]) == []
    scoped = [i for i, _ in store.bm25_search("hash buckets", k=10, doc_ids=["zz_beta"])]
    assert scoped == ["zz_beta#p"]


def test_dense_search_with_and_without_doc_ids(store):
    top = store.dense_search(vec(0), k=5)
    assert top[0][0] == "zz_alpha#p"
    scoped = [i for i, _ in store.dense_search(vec(0), k=5, doc_ids=["zz_beta"])]
    assert scoped == ["zz_beta#p"]
    assert all(i != "zz_beta#p" for i, _ in store.dense_search(vec(0), k=5, max_level=1))


def test_replace_document_swaps_chunks_and_refreshes_the_cache(store):
    store.list_documents()                                         # warm the cache
    doc, chunks, hashes, emb = make("zz_alpha", "Quick sort partitions around a pivot.", 2)
    store.replace_document(doc, chunks, hashes, emb)
    assert store.get_chunks(["zz_alpha#p"])["zz_alpha#p"].text.startswith("Quick sort")
    assert [i for i, _ in store.bm25_search("pivot partitions", k=5)] == ["zz_alpha#p"]
    assert store.dense_search(vec(2), k=1)[0][0] == "zz_alpha#p"
