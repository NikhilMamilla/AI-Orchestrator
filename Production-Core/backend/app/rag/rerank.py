"""Reranking and context construction (parent-child expansion + extractive compression)."""
from __future__ import annotations

import logging
import math
import re
from typing import Dict, List, Optional, Sequence

from .query import keywords
from .store import KnowledgeStore
from .types import Candidate, Evidence

logger = logging.getLogger(__name__)


class CrossEncoderReranker:
    """cross-encoder/ms-marco-MiniLM-L-6-v2: free, local, ~22M params. Scores (query, passage)
    jointly, which fixes bi-encoder near-misses. Falls back to a lexical+dense blend."""

    def __init__(self, model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2", enabled: bool = True):
        self.model_name, self._model, self.name = model_name, None, "lexical-fallback"
        if enabled:
            try:
                from sentence_transformers import CrossEncoder
                self._model = CrossEncoder(model_name, max_length=256)
                self.name = model_name
            except Exception as e:
                logger.warning("Cross-encoder unavailable (%s); using lexical fallback", e)

    def rerank(self, query: str, cands: List[Candidate], top_n: int = 8) -> List[Candidate]:
        if not cands:
            return []
        if self._model is not None:
            pairs = [(query, f"{c.chunk.heading_path}\n{c.chunk.text}") for c in cands]
            raw = self._model.predict(pairs, show_progress_bar=False, batch_size=16)
            for c, s in zip(cands, raw):
                c.rerank_score = 1.0 / (1.0 + math.exp(-float(s)))       # logit -> (0,1)
        else:
            q = set(keywords(query))
            for c in cands:
                d = set(keywords(c.chunk.heading_path + " " + c.chunk.text))
                overlap = len(q & d) / max(1, len(q))
                c.rerank_score = 0.6 * overlap + 0.4 * max(0.0, c.dense_score)
        cands.sort(key=lambda c: c.rerank_score or 0.0, reverse=True)
        return cands[:top_n]


_SENT = re.compile(r"(?<=[.!?])\s+")


def _compress(text: str, q_terms: set, budget: int) -> str:
    """Extractive compression: keep code fences intact, keep the highest-overlap sentences
    in their original order until the character budget is met."""
    if len(text) <= budget:
        return text
    parts, buf, in_code = [], [], False
    for line in text.split("\n"):
        if line.strip().startswith("```"):
            if in_code:
                buf.append(line)
                parts.append(("code", "\n".join(buf)))
                buf, in_code = [], False
                continue
            if buf:
                parts.append(("text", "\n".join(buf)))
            buf, in_code = [line], True
        else:
            buf.append(line)
    if buf:
        parts.append(("code" if in_code else "text", "\n".join(buf)))
    units = []
    for kind, t in parts:
        if kind == "code":
            units.append((t, 10.0))
        else:
            for s in _SENT.split(t):
                if s.strip():
                    units.append((s.strip(), len(q_terms & set(keywords(s))) / max(1, len(q_terms))))
    order = sorted(range(len(units)), key=lambda i: -units[i][1])
    keep, used = set(), 0
    for i in order:
        if used + len(units[i][0]) > budget and keep:
            continue
        keep.add(i)
        used += len(units[i][0])
    return " ".join(units[i][0] for i in sorted(keep))


def build_evidence(query: str, ranked: Sequence[Candidate], store: KnowledgeStore,
                   titles: Dict[str, str], max_items: int = 5, char_budget: int = 900,
                   section_expand_chars: int = 1200) -> List[Evidence]:
    """Parent-child expansion: if two+ top passages share a short parent section, return the
    whole section as one evidence item (coherent context); otherwise return the passage,
    compressed to the budget. Adds neighbouring-redundancy removal."""
    q_terms = set(keywords(query))
    by_parent: Dict[str, List[Candidate]] = {}
    for c in ranked:
        by_parent.setdefault(c.chunk.parent_id or c.chunk.id, []).append(c)
    parents = store.get_chunks(by_parent.keys())
    out: List[Evidence] = []
    used_parents = set()
    for c in ranked:
        pid = c.chunk.parent_id or c.chunk.id
        if pid in used_parents:
            continue
        group = by_parent[pid]
        parent = parents.get(pid)
        score = max((g.rerank_score or g.fused_score) for g in group)
        if parent and len(group) >= 2 and len(parent.text) <= section_expand_chars:
            text, path = parent.text, parent.heading_path
            used_parents.add(pid)
        else:
            text, path = c.chunk.text, c.chunk.heading_path
            used_parents.add(pid)
        out.append(Evidence(ref=len(out) + 1, chunk_id=c.chunk.id, doc_id=c.chunk.doc_id,
                            doc_title=titles.get(c.chunk.doc_id, c.chunk.doc_id), heading_path=path,
                            text=_compress(text, q_terms, char_budget), score=float(score)))
        if len(out) >= max_items:
            break
    return out
