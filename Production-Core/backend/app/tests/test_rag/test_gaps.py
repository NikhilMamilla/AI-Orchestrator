"""Content-gap clustering: same topic asked differently groups together; the closest concept is named."""
import numpy as np

from backend.app.rag.gaps import cluster, nearest_concepts


class VecEmbedder:
    """Maps known phrases to fixed directions so clustering behaviour is exact and deterministic."""
    axes = {"hash": 0, "graph": 1, "sourdough": 2}

    def encode_documents(self, texts):
        out = np.zeros((len(texts), 3), dtype=np.float32)
        for i, t in enumerate(texts):
            for k, a in self.axes.items():
                if k in t.lower():
                    out[i, a] = 1.0
            if not out[i].any():
                out[i, 2] = 0.2
            out[i] /= np.linalg.norm(out[i])
        return out


def test_same_topic_groups_and_clusters_are_ordered_by_frequency():
    qs = ["what is a hash collision", "how do hash tables resolve collisions", "hash function design",
          "explain graph coloring", "how to bake sourdough"]
    cl = cluster(qs, VecEmbedder())
    assert [c["count"] for c in cl] == [3, 1, 1]
    assert "hash" in cl[0]["topic"].lower() and len(cl[0]["examples"]) == 3


def test_empty_and_blank_input_is_safe():
    assert cluster([], VecEmbedder()) == [] and cluster(["", "  "], VecEmbedder()) == []


def test_nearest_concept_and_suggestion():
    class D:
        def __init__(self, id, title, tags): self.id, self.title, self.tags = id, title, tags
    docs = [D("hash-tables", "Hash Tables", ["hash"]), D("graphs", "Graphs", ["graph"])]
    cl = nearest_concepts(cluster(["what is a hash collision", "how to bake sourdough"], VecEmbedder()), docs, VecEmbedder())
    assert cl[0]["closest_concept"]["id"] == "hash-tables" and cl[0]["suggestion"] == "Extend this concept's document"
    assert cl[1]["suggestion"] == "Write a new concept document"
