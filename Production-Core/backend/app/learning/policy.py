"""Orchestrator decision policy (PRD 7.5 "Decision 1: what to teach next?") over the prerequisite DAG.

Pure functions: given mastery per concept and the DAG, decide advance / deepen / remediate / review and
explain why. The reasoning string is what the learner sees in the agent activity feed.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence

from .mastery import DEEPEN, MASTERED, READY


@dataclass
class ConceptNode:
    id: str
    title: str
    level: int
    prerequisites: List[str] = field(default_factory=list)
    domain: str = ""


@dataclass
class Decision:
    action: str                       # advance | deepen | remediate | review | complete
    concept_id: Optional[str]
    reasoning: str
    focus: Optional[str] = None       # the concept the learner should study next


def unlocked(node: ConceptNode, mastery: Dict[str, float], known: set) -> bool:
    return all(mastery.get(p, 0.0) >= READY for p in node.prerequisites if p in known)


def next_concepts(graph: Dict[str, ConceptNode], mastery: Dict[str, float], limit: int = 3) -> List[ConceptNode]:
    """Unlocked, not-yet-mastered concepts, easiest first; partially learned ones before untouched."""
    known = set(graph)
    cands = [n for n in graph.values() if mastery.get(n.id, 0.0) < MASTERED and unlocked(n, mastery, known)]
    cands.sort(key=lambda n: (-(mastery.get(n.id, 0.0) > 0), n.level, -mastery.get(n.id, 0.0), n.title))
    return cands[:limit]


def weakest_prerequisite(node: ConceptNode, graph: Dict[str, ConceptNode], mastery: Dict[str, float],
                         threshold: float = 0.5) -> Optional[ConceptNode]:
    weak = [graph[p] for p in node.prerequisites if p in graph and mastery.get(p, 0.0) < threshold]
    return min(weak, key=lambda n: mastery.get(n.id, 0.0)) if weak else None


def decide(concept_id: str, correct: bool, graph: Dict[str, ConceptNode], mastery: Dict[str, float],
           recent_correct: Sequence[bool] = ()) -> Decision:
    node = graph.get(concept_id)
    if node is None:
        return Decision("review", concept_id, "Unknown concept; nothing to decide.")
    m = mastery.get(concept_id, 0.0)
    title = node.title
    streak_wrong = 0
    for ok in reversed(list(recent_correct)):
        if ok:
            break
        streak_wrong += 1

    if m >= MASTERED:
        nxt = next_concepts(graph, mastery, limit=1)
        if not nxt:
            return Decision("complete", concept_id, f"{title} is mastered ({m:.0%}) and nothing else is left to unlock.")
        return Decision("advance", concept_id,
                        f"{title} is mastered ({m:.0%} ≥ {MASTERED:.0%}); prerequisites for "
                        f"{nxt[0].title} are met, so moving on.", focus=nxt[0].id)

    weak = weakest_prerequisite(node, graph, mastery)
    if (not correct or streak_wrong >= 2) and weak is not None:
        return Decision("remediate", concept_id,
                        f"Struggling with {title} ({m:.0%}) and the prerequisite {weak.title} is shaky "
                        f"({mastery.get(weak.id, 0.0):.0%}); revisit {weak.title} first.", focus=weak.id)

    if m >= DEEPEN:
        return Decision("deepen", concept_id,
                        f"{title} is at {m:.0%}: close to mastery ({MASTERED:.0%}); a few more practice questions.",
                        focus=concept_id)

    if correct:
        return Decision("deepen", concept_id,
                        f"Correct answer on {title}, now {m:.0%}; keep practicing to reach {MASTERED:.0%}.",
                        focus=concept_id)
    return Decision("review", concept_id,
                    f"Missed a question on {title} ({m:.0%}); re-read the explanation, then try again.",
                    focus=concept_id)


def learning_path(graph: Dict[str, ConceptNode], mastery: Dict[str, float],
                  goal: Optional[str] = None) -> List[ConceptNode]:
    """Topological roadmap of everything still to master (or just what the goal needs).

    Kahn's algorithm over the prerequisite DAG; among available nodes the easiest and most-started go first.
    """
    needed = set(graph)
    if goal and goal in graph:
        needed, stack = set(), [goal]
        while stack:
            cur = stack.pop()
            if cur in needed:
                continue
            needed.add(cur)
            stack += [p for p in graph[cur].prerequisites if p in graph]
    todo = {i for i in needed if mastery.get(i, 0.0) < MASTERED}
    indeg = {i: sum(1 for p in graph[i].prerequisites if p in todo) for i in todo}
    order: List[ConceptNode] = []
    ready = [i for i, d in indeg.items() if d == 0]
    while ready:
        ready.sort(key=lambda i: (-(mastery.get(i, 0.0) > 0), graph[i].level, graph[i].title))
        cur = ready.pop(0)
        order.append(graph[cur])
        for i in todo:
            if cur in graph[i].prerequisites and i in indeg:
                indeg[i] -= 1
                if indeg[i] == 0 and i not in {n.id for n in order} and i not in ready:
                    ready.append(i)
    return order
