"""Supabase Postgres knowledge store (pgvector + full-text search).

Same public surface as `KnowledgeStore` (SQLite), so the pipeline is storage-agnostic and the
SQLite store doubles as the offline test/CI backend. Retrieval runs inside the database via
the `match_chunks_dense` / `match_chunks_bm25` SQL functions (HNSW + GIN indexes), so no
vectors are loaded into application memory.

Use Supabase's *pooler* connection string (session mode, port 5432 on the pooler host); the
direct host is IPv6-only on the free tier.
"""
from __future__ import annotations

import threading
import time
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
from pgvector.psycopg import register_vector
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .types import Chunk, Document


class PostgresKnowledgeStore:
    def __init__(self, dsn: str, pool_size: int = 8):
        self.pool = ConnectionPool(dsn, min_size=1, max_size=pool_size, open=True,
                                   configure=register_vector,
                                   kwargs={"row_factory": dict_row, "prepare_threshold": None})
        # Document metadata and counts change only on ingest; caching them removes 2-3 network
        # round-trips from every query (the database is remote). Cleared on any local write,
        # and expires after TTL so other writers' changes are picked up.
        self._meta_ttl = 60.0
        self._meta: Dict[str, Tuple[float, object]] = {}
        self._meta_lock = threading.Lock()

    def _cached(self, key: str, loader):
        with self._meta_lock:
            hit = self._meta.get(key)
            if hit and time.monotonic() - hit[0] < self._meta_ttl:
                return hit[1]
        value = loader()
        with self._meta_lock:
            self._meta[key] = (time.monotonic(), value)
        return value

    def _invalidate(self) -> None:
        with self._meta_lock:
            self._meta.clear()

    # ----- documents -----
    @staticmethod
    def _doc(r) -> Document:
        return Document(id=r["id"], title=r["title"], source=r["source"], level=r["level"], domain=r["domain"],
                        prerequisites=list(r["prerequisites"]), tags=list(r["tags"]),
                        content_hash=r["content_hash"], version=r["version"])

    def get_document(self, doc_id: str) -> Optional[Document]:
        return next((d for d in self.list_documents() if d.id == doc_id), None)

    def list_documents(self) -> List[Document]:
        def load():
            with self.pool.connection() as c:
                return [self._doc(r) for r in c.execute("select * from documents order by level, title")]
        return self._cached("docs", load)

    def replace_document(self, doc: Document, chunks: Sequence[Chunk],
                         text_hashes: Dict[str, str], embeddings: Dict[str, np.ndarray]) -> None:
        with self.pool.connection() as c, c.transaction():
            c.execute("delete from chunks where doc_id=%s", (doc.id,))
            c.execute(
                """insert into documents(id,title,source,level,domain,prerequisites,tags,content_hash,version)
                   values (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   on conflict (id) do update set title=excluded.title, source=excluded.source,
                     level=excluded.level, domain=excluded.domain, prerequisites=excluded.prerequisites, tags=excluded.tags,
                     content_hash=excluded.content_hash, version=excluded.version, updated_at=now()""",
                (doc.id, doc.title, doc.source, doc.level, doc.domain, doc.prerequisites, doc.tags,
                 doc.content_hash, doc.version))
            # parents first so any future FK on parent_id holds; sections have no embedding
            rows = [(ch.id, ch.doc_id, ch.parent_id, ch.kind, ch.heading_path, ch.text,
                     text_hashes[ch.id], ch.ordinal, ch.level, ch.tags,
                     embeddings[ch.id].astype(np.float32) if ch.id in embeddings else None)
                    for ch in chunks]
            with c.cursor() as cur:
                cur.executemany(
                    """insert into chunks(id,doc_id,parent_id,kind,heading_path,text,text_hash,
                                          ordinal,level,tags,embedding)
                       values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", rows)
        self._invalidate()

    def delete_document(self, doc_id: str) -> None:
        with self.pool.connection() as c:
            c.execute("delete from documents where id=%s", (doc_id,))
        self._invalidate()

    def known_text_hashes(self, exclude_doc: Optional[str] = None) -> set:
        with self.pool.connection() as c:
            rows = c.execute("select text_hash from chunks where kind='passage' and doc_id <> %s",
                             (exclude_doc or "",)).fetchall()
        return {r["text_hash"] for r in rows}

    # ----- chunks -----
    def get_chunks(self, ids: Iterable[str]) -> Dict[str, Chunk]:
        ids = list(ids)
        if not ids:
            return {}
        with self.pool.connection() as c:
            rows = c.execute(
                "select id,doc_id,parent_id,kind,heading_path,text,ordinal,level,tags "
                "from chunks where id = any(%s)", (ids,)).fetchall()
        return {r["id"]: Chunk(**r) for r in rows}

    def sections_for_doc(self, doc_id: str) -> List[Chunk]:
        with self.pool.connection() as c:
            rows = c.execute(
                "select id,doc_id,parent_id,kind,heading_path,text,ordinal,level,tags from chunks "
                "where doc_id=%s and kind='section' order by ordinal", (doc_id,)).fetchall()
        return [Chunk(**r) for r in rows]

    def passages_for_doc(self, doc_id: str) -> List[Tuple[str, str]]:
        with self.pool.connection() as c:
            rows = c.execute("select id, text from chunks where doc_id=%s and kind='passage'",
                             (doc_id,)).fetchall()
        return [(r["id"], r["text"]) for r in rows]

    def stats(self) -> Dict[str, int]:
        def load():
            with self.pool.connection() as c:
                r = c.execute(
                    "select (select count(*) from documents) d, "
                    "(select count(*) from chunks where kind='section') s, "
                    "(select count(*) from chunks where kind='passage') p").fetchone()
            return {"documents": r["d"], "sections": r["s"], "passages": r["p"]}
        return self._cached("stats", load)

    # ----- retrieval (executed in the database) -----
    def bm25_search(self, query: str, k: int = 30, max_level: Optional[int] = None,
                    doc_ids: Optional[Sequence[str]] = None) -> List[Tuple[str, float]]:
        with self.pool.connection() as c:
            rows = c.execute("select id, score from match_chunks_bm25(%s, %s, %s, %s)",
                             (query, k, max_level, list(doc_ids) if doc_ids else None)).fetchall()
        return [(r["id"], float(r["score"])) for r in rows]

    def dense_search(self, query_vec: np.ndarray, k: int = 30, max_level: Optional[int] = None,
                     doc_ids: Optional[Sequence[str]] = None) -> List[Tuple[str, float]]:
        with self.pool.connection() as c:
            rows = c.execute("select id, score from match_chunks_dense(%s, %s, %s, %s)",
                             (query_vec.astype(np.float32), k, max_level,
                              list(doc_ids) if doc_ids else None)).fetchall()
        return [(r["id"], float(r["score"])) for r in rows]

    def close(self) -> None:
        self.pool.close()
