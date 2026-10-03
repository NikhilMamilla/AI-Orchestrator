"""Embedding providers with an LRU cache and a deterministic offline fallback.

Primary: BAAI/bge-small-en-v1.5 (free, local, 384-d, strong on MTEB retrieval for
its size). bge models want an instruction prefix on *queries* only.
Fallback: hashed bag-of-words/bigrams. It is a real (lexical) embedding, used when the
neural model cannot be loaded (offline CI, missing weights); the pipeline reports
which embedder is active so metrics are never silently attributed to the wrong one.
"""
from __future__ import annotations

import hashlib
import logging
import re
import threading
from collections import OrderedDict
from typing import List

import numpy as np

logger = logging.getLogger(__name__)
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "
_TOK = re.compile(r"[a-z0-9_]+")


class LRU:
    def __init__(self, cap: int = 2048):
        self.cap, self._d, self._lock = cap, OrderedDict(), threading.Lock()
        self.hits = self.misses = 0

    def get(self, k):
        with self._lock:
            if k in self._d:
                self._d.move_to_end(k)
                self.hits += 1
                return self._d[k]
            self.misses += 1
            return None

    def put(self, k, v):
        with self._lock:
            self._d[k] = v
            self._d.move_to_end(k)
            while len(self._d) > self.cap:
                self._d.popitem(last=False)


class HashingEmbedder:
    name = "hashing-384"
    dim = 384

    def _vec(self, text: str) -> np.ndarray:
        toks = _TOK.findall(text.lower())
        feats = toks + [f"{a}_{b}" for a, b in zip(toks, toks[1:])]
        v = np.zeros(self.dim, dtype=np.float32)
        for f in feats:
            h = int.from_bytes(hashlib.blake2b(f.encode(), digest_size=8).digest(), "little")
            v[h % self.dim] += 1.0 if (h >> 63) & 1 else -1.0
        n = np.linalg.norm(v)
        return v / n if n else v

    def encode_documents(self, texts: List[str]) -> np.ndarray:
        return np.vstack([self._vec(t) for t in texts]) if texts else np.zeros((0, self.dim), np.float32)

    def encode_query(self, text: str) -> np.ndarray:
        return self._vec(text)


class SentenceTransformerEmbedder:
    dim = 384

    def __init__(self, model_name: str = "BAAI/bge-small-en-v1.5"):
        from sentence_transformers import SentenceTransformer
        self.name = model_name
        self._model = SentenceTransformer(model_name)

    def encode_documents(self, texts: List[str]) -> np.ndarray:
        return np.asarray(self._model.encode(texts, normalize_embeddings=True, batch_size=32,
                                             show_progress_bar=False), dtype=np.float32)

    def encode_query(self, text: str) -> np.ndarray:
        return np.asarray(self._model.encode(QUERY_PREFIX + text, normalize_embeddings=True),
                          dtype=np.float32)


class CachedEmbedder:
    """Wraps an embedder with a query-embedding LRU cache."""

    def __init__(self, inner):
        self.inner, self.cache, self.doc_cache = inner, LRU(4096), LRU(4096)

    @property
    def name(self) -> str:
        return self.inner.name

    def encode_documents(self, texts):
        """Per-text cache: the verifier re-embeds the same evidence passages across requests."""
        out, missing = {}, []
        for t in dict.fromkeys(texts):
            hit = self.doc_cache.get(t)
            if hit is None:
                missing.append(t)
            else:
                out[t] = hit
        if missing:
            for t, v in zip(missing, self.inner.encode_documents(missing)):
                self.doc_cache.put(t, v)
                out[t] = v
        return np.vstack([out[t] for t in texts]) if texts else np.zeros((0, 384), np.float32)

    def encode_query(self, text: str) -> np.ndarray:
        v = self.cache.get(text)
        if v is None:
            v = self.inner.encode_query(text)
            self.cache.put(text, v)
        return v


def load_embedder(prefer_neural: bool = True) -> CachedEmbedder:
    if prefer_neural:
        try:
            return CachedEmbedder(SentenceTransformerEmbedder())
        except Exception as e:                      # model download / import failure
            logger.warning("Neural embedder unavailable (%s); using hashing fallback", e)
    return CachedEmbedder(HashingEmbedder())
