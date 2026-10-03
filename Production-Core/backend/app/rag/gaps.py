"""Content-gap analytics: which topics do learners ask about that the knowledge base cannot answer?

Questions the evidence gate refused are stored WITHOUT any user identifier. The admin view clusters them by
meaning (embedding cosine, greedy single pass) so "hash collisions" asked 7 different ways is one gap with a
count, and names the closest existing concept so the curator knows whether to extend a document or write a new one.
"""
from __future__ import annotations

from typing import Any, Dict, List, Sequence

import numpy as np

CLUSTER_SIM = 0.78          # cosine above which two questions are the same topic
RETENTION_DAYS = 90
MAX_ROWS = 600


def cluster(questions: Sequence[str], embedder, threshold: float = CLUSTER_SIM) -> List[Dict[str, Any]]:
    """Greedy leader clustering; each cluster keeps its first question as the representative."""
    qs = [q for q in questions if q and q.strip()][:MAX_ROWS]
    if not qs:
        return []
    vecs = embedder.encode_documents(qs)
    leaders: List[int] = []
    members: List[List[int]] = []
    for i, v in enumerate(vecs):
        if leaders:
            sims = vecs[leaders] @ v
            j = int(np.argmax(sims))
            if sims[j] >= threshold:
                members[j].append(i)
                continue
        leaders.append(i)
        members.append([i])
    out = []
    for lead, mem in zip(leaders, members):
        centroid = vecs[mem].mean(axis=0)
        # most central question represents the cluster better than the first one asked
        rep = mem[int(np.argmax(vecs[mem] @ centroid))]
        out.append({"topic": qs[rep], "count": len(mem), "examples": [qs[m] for m in mem[:4]], "_centroid": centroid})
    out.sort(key=lambda c: -c["count"])
    return out


def nearest_concepts(clusters: List[Dict[str, Any]], docs, embedder) -> List[Dict[str, Any]]:
    """Attach the closest existing concept (by title + tags) and how close it is."""
    if not clusters or not docs:
        return clusters
    labels = [f"{d.title}. {', '.join(d.tags[:6])}" for d in docs]
    dvecs = embedder.encode_documents(labels)
    for c in clusters:
        sims = dvecs @ c.pop("_centroid")
        j = int(np.argmax(sims))
        c["closest_concept"] = {"id": docs[j].id, "title": docs[j].title, "similarity": round(float(sims[j]), 3)}
        c["suggestion"] = ("Extend this concept's document" if sims[j] >= 0.55 else "Write a new concept document")
    return clusters
