"""SQLite-backed knowledge store: documents, hierarchical chunks, FTS5 (BM25) index
and float32 embedding blobs.

Why SQLite: zero-cost, zero-ops, transactional (so incremental re-ingestion is
atomic) and FTS5 gives a real BM25 implementation without extra dependencies.
Dense vectors are held in memory as one normalised matrix, which is exact and
fast at this corpus scale (10^4-10^5 chunks); swapping in an ANN index is a
local change inside `DenseIndex`.
"""
from __future__ import annotations

import json
import re
import sqlite3
import threading
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np

from .types import Chunk, Document

SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    level INTEGER NOT NULL,
    domain TEXT NOT NULL DEFAULT 'foundations',
    prerequisites TEXT NOT NULL DEFAULT '[]',
    tags TEXT NOT NULL DEFAULT '[]',
    content_hash TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    parent_id TEXT,
    kind TEXT NOT NULL CHECK (kind IN ('section','passage')),
    heading_path TEXT NOT NULL,
    text TEXT NOT NULL,
    text_hash TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    level INTEGER NOT NULL,
    tags TEXT NOT NULL DEFAULT '',
    embedding BLOB
);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_id);
CREATE INDEX IF NOT EXISTS idx_chunks_parent ON chunks(parent_id);
CREATE INDEX IF NOT EXISTS idx_chunks_hash ON chunks(text_hash);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    heading_path, text, tags, content='chunks', content_rowid='rowid',
    tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
    INSERT INTO chunks_fts(rowid, heading_path, text, tags)
    VALUES (new.rowid, new.heading_path, new.text, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, heading_path, text, tags)
    VALUES ('delete', old.rowid, old.heading_path, old.text, old.tags);
END;
"""

_FTS_TOKEN = re.compile(r"[A-Za-z0-9_]+")


def fts_query(text: str) -> str:
    """Build a safe FTS5 OR-query from free text (no operators can be injected)."""
    tokens = [t for t in _FTS_TOKEN.findall(text.lower()) if len(t) > 1]
    return " OR ".join(f'"{t}"' for t in dict.fromkeys(tokens))


class KnowledgeStore:
    def __init__(self, path: str | Path = ":memory:"):
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._db = sqlite3.connect(self.path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._db.execute("PRAGMA foreign_keys=ON")
        if self.path != ":memory:":
            self._db.execute("PRAGMA journal_mode=WAL")
        self._db.executescript(SCHEMA)
        self._dense_ids: List[str] = []
        self._dense_matrix: Optional[np.ndarray] = None
        self._dense_dirty = True

    # ---------- documents ----------
    def get_document(self, doc_id: str) -> Optional[Document]:
        with self._lock:
            r = self._db.execute("SELECT * FROM documents WHERE id=?", (doc_id,)).fetchone()
        return self._row_to_doc(r) if r else None

    def list_documents(self) -> List[Document]:
        with self._lock:
            rows = self._db.execute(
                "SELECT * FROM documents ORDER BY level, title").fetchall()
        return [self._row_to_doc(r) for r in rows]

    @staticmethod
    def _row_to_doc(r: sqlite3.Row) -> Document:
        return Document(
            id=r["id"], title=r["title"], source=r["source"], level=r["level"], domain=r["domain"],
            prerequisites=json.loads(r["prerequisites"]), tags=json.loads(r["tags"]),
            content_hash=r["content_hash"], version=r["version"])

    def replace_document(self, doc: Document, chunks: Sequence[Chunk],
                         text_hashes: Dict[str, str],
                         embeddings: Dict[str, np.ndarray]) -> None:
        """Atomically swap a document's chunks for a new version."""
        with self._lock, self._db:
            self._db.execute("DELETE FROM chunks WHERE doc_id=?", (doc.id,))
            self._db.execute(
                """INSERT INTO documents(id,title,source,level,domain,prerequisites,tags,content_hash,version)
                   VALUES(?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(id) DO UPDATE SET title=excluded.title, source=excluded.source,
                     level=excluded.level, domain=excluded.domain, prerequisites=excluded.prerequisites, tags=excluded.tags,
                     content_hash=excluded.content_hash, version=excluded.version,
                     updated_at=CURRENT_TIMESTAMP""",
                (doc.id, doc.title, doc.source, doc.level, doc.domain, json.dumps(doc.prerequisites),
                 json.dumps(doc.tags), doc.content_hash, doc.version))
            for c in chunks:
                emb = embeddings.get(c.id)
                self._db.execute(
                    """INSERT INTO chunks(id,doc_id,parent_id,kind,heading_path,text,text_hash,
                                          ordinal,level,tags,embedding)
                       VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                    (c.id, c.doc_id, c.parent_id, c.kind, c.heading_path, c.text,
                     text_hashes[c.id], c.ordinal, c.level, c.tags,
                     emb.astype(np.float32).tobytes() if emb is not None else None))
            self._dense_dirty = True

    def delete_document(self, doc_id: str) -> None:
        with self._lock, self._db:
            self._db.execute("DELETE FROM chunks WHERE doc_id=?", (doc_id,))
            self._db.execute("DELETE FROM documents WHERE id=?", (doc_id,))
            self._dense_dirty = True

    def known_text_hashes(self, exclude_doc: Optional[str] = None) -> set:
        with self._lock:
            rows = self._db.execute(
                "SELECT text_hash FROM chunks WHERE kind='passage' AND doc_id != ?",
                (exclude_doc or "",)).fetchall()
        return {r[0] for r in rows}

    # ---------- chunks ----------
    @staticmethod
    def _row_to_chunk(r: sqlite3.Row) -> Chunk:
        return Chunk(id=r["id"], doc_id=r["doc_id"], parent_id=r["parent_id"], kind=r["kind"],
                     heading_path=r["heading_path"], text=r["text"], ordinal=r["ordinal"],
                     level=r["level"], tags=r["tags"])

    def get_chunks(self, ids: Iterable[str]) -> Dict[str, Chunk]:
        ids = list(ids)
        out: Dict[str, Chunk] = {}
        with self._lock:
            for i in range(0, len(ids), 500):
                part = ids[i:i + 500]
                q = ",".join("?" * len(part))
                for r in self._db.execute(f"SELECT id,doc_id,parent_id,kind,heading_path,text,"
                                          f"ordinal,level,tags FROM chunks WHERE id IN ({q})", part):
                    out[r["id"]] = self._row_to_chunk(r)
        return out

    def sections_for_doc(self, doc_id: str) -> List[Chunk]:
        with self._lock:
            rows = self._db.execute(
                "SELECT id,doc_id,parent_id,kind,heading_path,text,ordinal,level,tags FROM chunks "
                "WHERE doc_id=? AND kind='section' ORDER BY ordinal", (doc_id,)).fetchall()
        return [self._row_to_chunk(r) for r in rows]

    def passages_for_doc(self, doc_id: str) -> List[Tuple[str, str]]:
        with self._lock:
            rows = self._db.execute(
                "SELECT id, text FROM chunks WHERE doc_id=? AND kind='passage'", (doc_id,)).fetchall()
        return [(r["id"], r["text"]) for r in rows]

    def stats(self) -> Dict[str, int]:
        with self._lock:
            d = self._db.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
            p = self._db.execute("SELECT COUNT(*) FROM chunks WHERE kind='passage'").fetchone()[0]
            s = self._db.execute("SELECT COUNT(*) FROM chunks WHERE kind='section'").fetchone()[0]
        return {"documents": d, "sections": s, "passages": p}

    # ---------- sparse (BM25 via FTS5) ----------
    def bm25_search(self, query: str, k: int = 30, max_level: Optional[int] = None,
                    doc_ids: Optional[Sequence[str]] = None) -> List[Tuple[str, float]]:
        q = fts_query(query)
        if not q:
            return []
        sql = ("SELECT c.id, bm25(chunks_fts, 4.0, 1.0, 2.0) AS s FROM chunks_fts "
               "JOIN chunks c ON c.rowid = chunks_fts.rowid "
               "WHERE chunks_fts MATCH ? AND c.kind='passage'")
        params: list = [q]
        if max_level is not None:
            sql += " AND c.level <= ?"
            params.append(max_level)
        if doc_ids:
            sql += f" AND c.doc_id IN ({','.join('?' * len(doc_ids))})"
            params += list(doc_ids)
        sql += " ORDER BY s LIMIT ?"
        params.append(k)
        with self._lock:
            rows = self._db.execute(sql, params).fetchall()
        # FTS5 bm25() is lower-is-better (negative); flip so higher is better.
        return [(r["id"], -float(r["s"])) for r in rows]

    # ---------- dense ----------
    def _load_dense(self) -> None:
        with self._lock:
            rows = self._db.execute(
                "SELECT id, embedding FROM chunks WHERE kind='passage' AND embedding IS NOT NULL"
            ).fetchall()
        if not rows:
            self._dense_ids, self._dense_matrix = [], None
        else:
            self._dense_ids = [r["id"] for r in rows]
            self._dense_matrix = np.vstack(
                [np.frombuffer(r["embedding"], dtype=np.float32) for r in rows])
        self._dense_dirty = False

    def dense_search(self, query_vec: np.ndarray, k: int = 30, max_level: Optional[int] = None,
                     doc_ids: Optional[Sequence[str]] = None) -> List[Tuple[str, float]]:
        if self._dense_dirty:
            self._load_dense()
        if self._dense_matrix is None:
            return []
        scores = self._dense_matrix @ query_vec.astype(np.float32)
        order = np.argsort(-scores)
        allowed = None
        if max_level is not None or doc_ids:
            meta = self._meta_for(self._dense_ids)
            allowed = {
                cid for cid, (lvl, did) in meta.items()
                if (max_level is None or lvl <= max_level) and (not doc_ids or did in doc_ids)}
        out: List[Tuple[str, float]] = []
        for i in order:
            cid = self._dense_ids[i]
            if allowed is not None and cid not in allowed:
                continue
            out.append((cid, float(scores[i])))
            if len(out) >= k:
                break
        return out

    def _meta_for(self, ids: List[str]) -> Dict[str, Tuple[int, str]]:
        with self._lock:
            rows = self._db.execute("SELECT id, level, doc_id FROM chunks WHERE kind='passage'").fetchall()
        return {r["id"]: (r["level"], r["doc_id"]) for r in rows}

    def close(self) -> None:
        with self._lock:
            self._db.close()
