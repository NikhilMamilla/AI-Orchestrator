"""Adaptive placement diagnostic (PRD 9.1 step 3) using the prerequisite graph as a knowledge structure.

Each concept carries a belief p = P(learner knows it). Asking one question moves beliefs along the graph:
a correct answer makes the concept's prerequisites likely known (you cannot do binary search without arrays),
a wrong answer makes its dependents unlikely. The next question is the one with the most expected leverage:
high uncertainty, many connected concepts. Placement therefore needs ~8 questions instead of one per concept.

Honesty rules: inferred beliefs are labelled "assumed" and never written as measured mastery. They only let the
roadmap unlock the right topics; real BKT mastery still comes from the learner's own answers.
"""
from __future__ import annotations

from typing import Dict, List, Mapping, Optional, Set

from .policy import ConceptNode

GUESS = 0.25               # 4-option multiple choice
SLIP = 0.10
PRIOR = 0.5
ANCESTOR_LIFT = 0.70       # how strongly a correct answer implies each (direct) prerequisite is known
DESCENDANT_DROP = 0.55     # how strongly a wrong answer implies each (direct) dependent is not known
DEPTH_DECAY = 0.8          # inference weakens with graph distance
ASSUMED_KNOWN = 0.80
LIKELY_GAP = 0.30
ASSUMED_MASTERY_VIEW = 0.65   # what an assumed-known concept counts as when unlocking dependents (not "mastered")


def _walk(graph: Mapping[str, ConceptNode], start: str, up: bool) -> Dict[str, int]:
    """Transitive ancestors (up=True) or descendants with their graph distance."""
    children: Dict[str, List[str]] = {}
    for n in graph.values():
        for p in n.prerequisites:
            children.setdefault(p, []).append(n.id)
    seen: Dict[str, int] = {}
    frontier, depth = [start], 0
    while frontier:
        depth += 1
        nxt: List[str] = []
        for cur in frontier:
            for nb in ([p for p in graph[cur].prerequisites if p in graph] if up else children.get(cur, [])):
                if nb not in seen and nb != start:
                    seen[nb] = depth
                    nxt.append(nb)
        frontier = nxt
    return seen


def update(belief: Dict[str, float], graph: Mapping[str, ConceptNode], concept: str, correct: bool) -> Dict[str, float]:
    """Bayes update on the asked concept, then propagate along the prerequisite graph."""
    b = dict(belief)
    p = b.get(concept, PRIOR)
    like_k, like_n = (1 - SLIP, GUESS) if correct else (SLIP, 1 - GUESS)
    b[concept] = p * like_k / (p * like_k + (1 - p) * like_n)
    if correct:
        for a, d in _walk(graph, concept, up=True).items():
            lift = ANCESTOR_LIFT * (DEPTH_DECAY ** (d - 1))
            b[a] = b.get(a, PRIOR) + (1 - b.get(a, PRIOR)) * lift
    else:
        for x, d in _walk(graph, concept, up=False).items():
            drop = DESCENDANT_DROP * (DEPTH_DECAY ** (d - 1))
            b[x] = b.get(x, PRIOR) * (1 - drop)
    return b


def next_probe(belief: Mapping[str, float], graph: Mapping[str, ConceptNode], asked: Set[str],
               measured: Set[str] = frozenset()) -> Optional[str]:
    """The unasked concept whose answer would tell us the most about the rest of the graph."""
    best, best_score = None, 0.0
    reach_max = max(1, len(graph) - 1)
    for c in sorted(graph):                                    # sorted: deterministic tie-breaks
        if c in asked or c in measured:
            continue
        p = belief.get(c, PRIOR)
        if p >= ASSUMED_KNOWN or p <= LIKELY_GAP:              # already settled by what we have seen
            continue
        uncertainty = p * (1 - p) * 4                          # 1.0 at p = 0.5
        reach = (len(_walk(graph, c, up=True)) + len(_walk(graph, c, up=False))) / reach_max
        score = uncertainty * (0.5 + reach)
        if score > best_score:
            best, best_score = c, score
    return best                                                # None once every concept is settled


def placement(belief: Mapping[str, float], asked: Mapping[str, bool], measured: Mapping[str, float]) -> Dict[str, Dict]:
    """Per-concept outcome: how we know (asked / inferred / measured) and what it implies."""
    out: Dict[str, Dict] = {}
    for c, p in belief.items():
        if c in measured:
            continue
        source = "asked" if c in asked else "inferred"
        status = "assumed_known" if p >= ASSUMED_KNOWN else ("likely_gap" if p <= LIKELY_GAP else "unsure")
        out[c] = {"p": round(p, 3), "source": source, "status": status}
    return out


def effective_mastery(measured: Mapping[str, float], diag: Optional[Mapping]) -> Dict[str, float]:
    """Mastery view used for unlocking topics: measured mastery wins; assumed-known counts as 'ready', not mastered."""
    eff = dict(measured)
    for c, info in ((diag or {}).get("placement") or {}).items():
        if c not in eff and info.get("status") == "assumed_known":
            eff[c] = ASSUMED_MASTERY_VIEW
    return eff
