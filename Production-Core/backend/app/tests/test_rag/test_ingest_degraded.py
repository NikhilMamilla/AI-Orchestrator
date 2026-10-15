"""While the hosted embedding service is down the embedder silently answers with offline hashing vectors. Those must never
be stored: the document's content hash would then mark it 'unchanged' and it would never be re-embedded."""
from backend.app.rag.embeddings import CachedEmbedder, EmbeddingUnavailable, FallbackEmbedder, HashingEmbedder
from backend.app.rag.ingest import Ingestor
from backend.app.rag.store import KnowledgeStore

DOC = b"---\nid: demo\ntitle: Demo\nlevel: beginner\n---\n# Demo\n\n" + b"Binary search halves the search space at every step. " * 12


class Down:
    name = "hosted"

    def encode_documents(self, texts):
        raise EmbeddingUnavailable("service down")

    encode_query = encode_queries = encode_documents


def test_fallback_vectors_are_never_stored():
    store = KnowledgeStore(":memory:")
    emb = CachedEmbedder(FallbackEmbedder(Down(), HashingEmbedder()))
    report = Ingestor(store, emb).ingest_bytes("demo.md", DOC)
    assert "demo.md" in report.failed and "embedding" in report.failed["demo.md"].lower()
    assert store.get_document("demo") is None                 # nothing was stored, so a retry will embed it properly
    store.close()


def test_ingest_still_works_when_the_embedder_is_healthy():
    store = KnowledgeStore(":memory:")
    report = Ingestor(store, CachedEmbedder(HashingEmbedder())).ingest_bytes("demo.md", DOC)
    assert report.added == ["demo"] and not report.failed
    store.close()
