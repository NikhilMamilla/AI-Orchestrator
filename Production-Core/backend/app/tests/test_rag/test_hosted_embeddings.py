"""Hosted embeddings (small servers without torch): batching, retries, the offline fallback and its effect on retrieval."""
import httpx
import numpy as np
import pytest

from backend.app.rag import embeddings as E


def _hosted(handler, retries=3):
    h = E.HostedEmbedder("tok", retries=retries)
    h._client = httpx.Client(transport=httpx.MockTransport(handler))
    return h


def _vectors(texts):
    out = []
    for i, _ in enumerate(texts):
        v = np.zeros(384)
        v[i % 384] = 3.0
        out.append(v.tolist())
    return out


def test_batches_inputs_and_normalises(monkeypatch):
    monkeypatch.setattr(E.time, "sleep", lambda *_: None)
    sizes = []

    def handler(req):
        assert req.headers["Authorization"] == "Bearer tok"
        texts = __import__("json").loads(req.content)["inputs"]
        sizes.append(len(texts))
        return httpx.Response(200, json=_vectors(texts))
    h = _hosted(handler)
    v = h.encode_documents([f"t{i}" for i in range(70)])
    assert v.shape == (70, 384) and sizes == [32, 32, 6]
    assert np.allclose(np.linalg.norm(v, axis=1), 1.0)


def test_query_carries_the_bge_prefix():
    seen = []

    def handler(req):
        seen.extend(__import__("json").loads(req.content)["inputs"])
        return httpx.Response(200, json=_vectors(seen[-1:]))
    _hosted(handler).encode_query("binary search")
    assert seen == [E.QUERY_PREFIX + "binary search"]


def test_retries_transient_errors_then_succeeds(monkeypatch):
    monkeypatch.setattr(E.time, "sleep", lambda *_: None)
    calls = {"n": 0}

    def handler(req):
        calls["n"] += 1
        return httpx.Response(503) if calls["n"] < 3 else httpx.Response(200, json=_vectors(["a"]))
    assert _hosted(handler).encode_documents(["a"]).shape == (1, 384) and calls["n"] == 3


def test_permanent_error_raises_unavailable(monkeypatch):
    monkeypatch.setattr(E.time, "sleep", lambda *_: None)
    with pytest.raises(E.EmbeddingUnavailable):
        _hosted(lambda req: httpx.Response(401)).encode_documents(["a"])
    with pytest.raises(E.EmbeddingUnavailable):                       # a malformed answer is not trusted
        _hosted(lambda req: httpx.Response(200, json=[[1.0, 2.0]])).encode_documents(["a"])


def test_fallback_answers_but_is_never_cached(monkeypatch):
    monkeypatch.setattr(E.time, "sleep", lambda *_: None)
    state = {"up": False}

    def handler(req):
        texts = __import__("json").loads(req.content)["inputs"]
        return httpx.Response(200, json=_vectors(texts)) if state["up"] else httpx.Response(503)
    emb = E.CachedEmbedder(E.FallbackEmbedder(_hosted(handler), E.HashingEmbedder()))

    down = emb.encode_query("what is a heap")
    assert emb.degraded and down.shape == (384,)
    assert emb.cache.get("what is a heap") is None                    # fallback vectors are not kept
    emb.encode_documents(["a passage"])
    assert emb.doc_cache.get("a passage") is None

    state["up"] = True
    up = emb.encode_query("what is a heap")
    assert not emb.degraded and emb.cache.get("what is a heap") is not None
    assert not np.allclose(up, down)                                  # the real vector replaces the fallback


def test_encode_queries_uses_one_call_and_the_cache(monkeypatch):
    monkeypatch.setattr(E.time, "sleep", lambda *_: None)
    calls = []

    def handler(req):
        texts = __import__("json").loads(req.content)["inputs"]
        calls.append(len(texts))
        return httpx.Response(200, json=_vectors(texts))
    emb = E.CachedEmbedder(E.FallbackEmbedder(_hosted(handler), E.HashingEmbedder()))
    first = emb.encode_queries(["a", "b", "a"])
    assert calls == [2] and len(first) == 3 and np.allclose(first[0], first[2])
    emb.encode_queries(["a", "b"])
    assert calls == [2]                                               # all cached: no second call


def test_retrieval_skips_dense_search_while_degraded(kb, monkeypatch):
    from backend.app.rag.retrieval import HybridRetriever
    store, emb = kb

    class Degraded:
        name, degraded = "down", True

        def encode_queries(self, texts):
            return [emb.encode_query(t) for t in texts]

        def encode_query(self, t):
            return emb.encode_query(t)

    called = {"dense": 0}
    real = store.dense_search

    def dense(*a, **k):
        called["dense"] += 1
        return real(*a, **k)
    monkeypatch.setattr(store, "dense_search", dense)
    from backend.app.rag.query import QueryAnalyzer
    plan = QueryAnalyzer(store.list_documents()).analyze("How does binary search work on a sorted array?")
    hits = HybridRetriever(store, Degraded()).retrieve(plan)
    assert called["dense"] == 0 and hits                              # keyword search still answers
