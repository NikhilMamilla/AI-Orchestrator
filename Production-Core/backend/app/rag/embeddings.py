"""Embedding providers with an LRU cache and a deterministic offline fallback.

Primary: BAAI/bge-small-en-v1.5 (free, local, 384-d, strong on MTEB retrieval for
its size). bge models want an instruction prefix on *queries* only.
Hosted: the same model served by Hugging Face Inference (identical vectors, cosine 1.0 against the local model), for
servers too small for torch. If the service fails, a request falls back to the hashing embedder and retrieval skips
its dense search, whose stored vectors come from the real model.
Fallback: hashed bag-of-words/bigrams. It is a real (lexical) embedding, used when the
neural model cannot be loaded (offline CI, missing weights); the pipeline reports
which embedder is active so metrics are never silently attributed to the wrong one.
"""
from __future__ import annotations

import hashlib
import logging
import re
import threading
import time
from collections import OrderedDict
from typing import List, Optional

import httpx
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


class EmbeddingUnavailable(RuntimeError):
    """The hosted embedding service did not answer."""


class HostedEmbedder:
    """BAAI/bge-small-en-v1.5 through Hugging Face Inference: the vectors the knowledge base was ingested with, without
    torch or model weights on the server. Inputs go in batches; transient errors (429/5xx, timeouts) are retried."""
    dim = 384
    URL = "https://router.huggingface.co/hf-inference/models/{model}/pipeline/feature-extraction"
    BATCH = 32

    def __init__(self, token: str, model_name: str = "BAAI/bge-small-en-v1.5", timeout: float = 20.0, retries: int = 3):
        self.name = f"{model_name} (hosted)"
        self._url = self.URL.format(model=model_name)
        self._headers = {"Authorization": f"Bearer {token}"}
        self._client = httpx.Client(timeout=timeout)
        self._retries = retries

    def _post(self, batch: List[str]) -> list:
        for attempt in range(self._retries):
            try:
                r = self._client.post(self._url, headers=self._headers, json={"inputs": batch})
            except httpx.HTTPError as e:
                if attempt == self._retries - 1:
                    raise EmbeddingUnavailable(f"network error: {type(e).__name__}") from e
            else:
                if r.status_code == 200:
                    return r.json()
                if r.status_code not in (429, 500, 502, 503, 504) or attempt == self._retries - 1:
                    raise EmbeddingUnavailable(f"HTTP {r.status_code}")
            time.sleep(0.6 * (attempt + 1))
        raise EmbeddingUnavailable("no response")

    def _embed(self, texts: List[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dim), np.float32)
        rows: list = []
        for i in range(0, len(texts), self.BATCH):
            rows.extend(self._post(texts[i:i + self.BATCH]))
        v = np.asarray(rows, dtype=np.float32)
        if v.ndim != 2 or v.shape[1] != self.dim:
            raise EmbeddingUnavailable(f"unexpected embedding shape {v.shape}")
        return v / np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-12)

    def encode_documents(self, texts: List[str]) -> np.ndarray:
        return self._embed(list(texts))

    def encode_query(self, text: str) -> np.ndarray:
        return self._embed([QUERY_PREFIX + text])[0]

    def encode_queries(self, texts: List[str]) -> np.ndarray:
        return self._embed([QUERY_PREFIX + t for t in texts])


class FallbackEmbedder:
    """Primary embedder first; if it is unavailable, the fallback answers so that pairwise comparisons (verifier, guard,
    teach-back) keep working. `degraded` is true while the last call fell back: callers must not cache those vectors
    or compare them with vectors stored by the primary model."""

    def __init__(self, primary, fallback):
        self.primary, self.fallback = primary, fallback
        self.name = primary.name
        self.degraded = False
        self._warned = 0.0

    def _call(self, method: str, *args):
        try:
            out = getattr(self.primary, method)(*args)
            self.degraded = False
            return out
        except EmbeddingUnavailable as e:
            self.degraded = True
            if time.monotonic() - self._warned > 60:                 # at most one warning a minute
                self._warned = time.monotonic()
                logger.warning("Hosted embeddings unavailable (%s); using the offline fallback", e)
            fn = getattr(self.fallback, method, None)
            if fn is None:                                           # encode_queries on the fallback
                return np.vstack([self.fallback.encode_query(t) for t in args[0]]) if args[0] else np.zeros((0, 384), np.float32)
            return fn(*args)

    def encode_documents(self, texts):
        return self._call("encode_documents", texts)

    def encode_query(self, text):
        return self._call("encode_query", text)

    def encode_queries(self, texts):
        return self._call("encode_queries", texts)


class CachedEmbedder:
    """Wraps an embedder with a query-embedding LRU cache."""

    def __init__(self, inner):
        self.inner, self.cache, self.doc_cache = inner, LRU(4096), LRU(4096)

    @property
    def name(self) -> str:
        return self.inner.name

    @property
    def degraded(self) -> bool:
        """True while a hosted embedder is answering from its offline fallback."""
        return bool(getattr(self.inner, "degraded", False))

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
            vecs = self.inner.encode_documents(missing)
            keep = not self.degraded                                         # never cache fallback vectors
            for t, v in zip(missing, vecs):
                if keep:
                    self.doc_cache.put(t, v)
                out[t] = v
        return np.vstack([out[t] for t in texts]) if texts else np.zeros((0, 384), np.float32)

    def encode_query(self, text: str) -> np.ndarray:
        v = self.cache.get(text)
        if v is None:
            v = self.inner.encode_query(text)
            if not self.degraded:
                self.cache.put(text, v)
        return v

    def encode_queries(self, texts: List[str]) -> List[np.ndarray]:
        """Several queries at once: one call to the inner embedder for every text not yet cached."""
        missing = [t for t in dict.fromkeys(texts) if self.cache.get(t) is None]
        if missing:
            batch = getattr(self.inner, "encode_queries", None)
            vecs = batch(missing) if batch else [self.inner.encode_query(t) for t in missing]
            fresh = dict(zip(missing, vecs))
            if not self.degraded:
                for t, v in fresh.items():
                    self.cache.put(t, v)
        else:
            fresh = {}
        return [fresh[t] if t in fresh else self.cache.get(t) for t in texts]


def load_embedder(prefer_neural: bool = True, hosted_token: Optional[str] = None) -> CachedEmbedder:
    """`hosted_token` set: the model runs on Hugging Face Inference (no torch here), with the offline fallback."""
    if hosted_token:
        return CachedEmbedder(FallbackEmbedder(HostedEmbedder(hosted_token), HashingEmbedder()))
    if prefer_neural:
        try:
            return CachedEmbedder(SentenceTransformerEmbedder())
        except Exception as e:                      # model download / import failure
            logger.warning("Neural embedder unavailable (%s); using hashing fallback", e)
    return CachedEmbedder(HashingEmbedder())
