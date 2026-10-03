"""Query understanding: intent, concept linking, rewrites.

Deterministic and free (no LLM call) so it adds ~0 latency; an optional LLM multi-query
expansion can be layered on via `llm_rewrites` and is evaluated separately.
"""
from __future__ import annotations

import re
from typing import Dict, List, Optional, Sequence

from .types import Document, QueryPlan

STOP = set("""a an the is are was were be been being of to in on for with and or but if then than that this
these those it its as at by from how what why when where which who whom do does did can could should would
will shall may might i me my we our you your about into over under between so such not no yes please explain
tell give show me us""".split())

_INTENTS = [
    ("complexity", r"\b(complexity|big[\s-]?o|runtime|time\s+cost|space\s+cost|how\s+fast|worst[\s-]case|amortized)\b"),
    ("compare", r"\b(vs\.?|versus|difference|differences|compare|comparison|better\s+than|or\b.*\bwhich)\b"),
    ("debug", r"\b(bug|wrong|error|fails?|failing|infinite\s+loop|off[\s-]by[\s-]one|doesn'?t\s+work|why\s+does\s+my|stack\s+overflow)\b"),
    ("code", r"\b(implement|code|write|pseudocode|snippet|python|java|c\+\+|function)\b"),
    ("how_to", r"\b(how\s+(do|does|to|can)|steps?|approach|technique|strategy|when\s+to\s+use)\b"),
    ("definition", r"\b(what\s+is|what\s+are|define|definition|meaning|explain|introduction)\b"),
]
_ABBREV = {"bfs": "breadth first search", "dfs": "depth first search", "dp": "dynamic programming",
           "bst": "binary search tree", "ll": "linked list", "lru": "least recently used cache",
           "mst": "minimum spanning tree", "kmp": "knuth morris pratt", "nlogn": "n log n",
           "heap": "heap priority queue", "pq": "priority queue"}


def _tokens(s: str) -> List[str]:
    return re.findall(r"[a-z0-9+#]+", s.lower())


def keywords(s: str) -> List[str]:
    return [t for t in _tokens(s) if t not in STOP and len(t) > 1]


class QueryAnalyzer:
    def __init__(self, documents: Sequence[Document]):
        self.docs = {d.id: d for d in documents}
        self._names: Dict[str, str] = {}
        for d in documents:
            self._names[" ".join(_tokens(d.title))] = d.id
            for t in d.tags:
                self._names.setdefault(" ".join(_tokens(t)), d.id)

    def analyze(self, query: str, level: Optional[int] = None,
                llm_rewrites: Sequence[str] = ()) -> QueryPlan:
        q = query.strip()
        low = q.lower()
        intent = "other"
        for name, rx in _INTENTS:
            if re.search(rx, low):
                intent = name
                break

        expanded = " ".join(_ABBREV.get(t, t) for t in _tokens(q))
        toks = " " + " ".join(_tokens(expanded)) + " "
        concepts = []
        for name, did in sorted(self._names.items(), key=lambda kv: -len(kv[0])):
            if name and f" {name} " in toks and did not in concepts:
                concepts.append(did)
        # drop concepts subsumed by a longer matched one (e.g. "search" inside "binary search")
        concepts = [c for c in concepts if not any(
            c != o and self.docs[c].title.lower() in self.docs[o].title.lower() for o in concepts)]

        rewrites: List[str] = []
        kw = " ".join(keywords(expanded))
        if expanded != low and expanded:
            rewrites.append(expanded)                                # abbreviation expansion
        if kw and kw != low:
            rewrites.append(kw)                                      # keyword form (BM25-friendly)
        if concepts:
            titles = " ".join(self.docs[c].title for c in concepts[:2])
            rewrites.append(f"{titles} {intent.replace('_', ' ')} {kw}".strip())   # concept-grounded
        rewrites += [r for r in llm_rewrites if r]
        seen, uniq = {low}, []
        for r in rewrites:
            if r.lower() not in seen:
                seen.add(r.lower())
                uniq.append(r)

        warnings = []
        if len(keywords(q)) < 2 and not concepts:
            warnings.append("ambiguous_query")
        return QueryPlan(original=q, intent=intent, rewrites=uniq[:4], concepts=concepts,
                         level=level, warnings=warnings)
