"""Policy simulation: does the Orchestrator's policy get a learner further per question than simpler policies?

    python -m backend.app.learning.simulate [--students 300] [--budget 120]

THIS IS A SIMULATION, not a study with real learners. Synthetic students have hidden true knowledge of each
concept in the real prerequisite graph (data/knowledge). They learn by practicing, and learning is much slower
when a prerequisite is unknown (the assumption that favours prerequisite-aware policies, stated openly). They
answer multiple-choice questions with slip and guess probabilities. Each policy only sees the answers, estimates
mastery with the same BKT code the product uses, and chooses what to practice next. Score = concepts truly known
after a fixed question budget (and questions needed to know 80% of the curriculum).

Policies
  random   : practice a random concept each time
  fixed    : walk the curriculum in a fixed order, a fixed number of questions per concept, never go back
  unlocked-only : ablation: only concepts whose prerequisites look known, no remediation, no lingering
  adaptive : the product's policy: practice what is unlocked and not yet mastered, remediate weak prerequisites
"""
from __future__ import annotations

import argparse
import random
import re
import statistics
from pathlib import Path
from typing import Callable, Dict, List

from .mastery import MASTERED, READY, bkt_update, params_for_level
from .policy import ConceptNode, decide, next_concepts

ROOT = Path(__file__).resolve().parents[3]
P_SLIP, P_GUESS = 0.10, 0.25
GATED_LEARN_FACTOR = 0.25            # learning speed when a prerequisite is not yet known (assumption)
FIXED_QUESTIONS_PER_CONCEPT = 4


def load_graph() -> Dict[str, ConceptNode]:
    levels = {"beginner": 1, "intermediate": 2, "advanced": 3}
    graph: Dict[str, ConceptNode] = {}
    for f in sorted((ROOT / "data" / "knowledge").glob("*.md")):
        head = re.match(r"---\n(.*?)\n---", f.read_text(encoding="utf-8"), re.S)
        meta = dict(re.findall(r"^(\w+):\s*(.*)$", head.group(1), re.M)) if head else {}
        prereqs = re.findall(r"[\w-]+", meta.get("prerequisites", "").strip("[]"))
        graph[meta["id"]] = ConceptNode(meta["id"], meta.get("title", meta["id"]), levels.get(meta.get("level", "beginner"), 1), prereqs)
    for n in graph.values():
        n.prerequisites = [p for p in n.prerequisites if p in graph]
    return graph


class Student:
    def __init__(self, graph: Dict[str, ConceptNode], rng: random.Random):
        self.g, self.rng = graph, rng
        self.p_learn = rng.uniform(0.08, 0.30)                          # learner speed varies
        self.knows = {c: rng.random() < 0.08 for c in graph}            # a few concepts already known

    def practice(self, concept: str) -> bool:
        """One question: returns whether the answer was correct; learning may occur."""
        node = self.g[concept]
        correct = self.rng.random() < ((1 - P_SLIP) if self.knows[concept] else P_GUESS)
        if not self.knows[concept]:
            gated = all(self.knows[p] for p in node.prerequisites)
            if self.rng.random() < self.p_learn * (1.0 if gated else GATED_LEARN_FACTOR):
                self.knows[concept] = True
        return correct

    def known(self) -> int:
        return sum(self.knows.values())


def run(policy: Callable, graph: Dict[str, ConceptNode], budget: int, rng: random.Random) -> Dict[str, float]:
    s = Student(graph, rng)
    est = {c: params_for_level(graph[c].level).p_init for c in graph}
    recent: Dict[str, List[bool]] = {c: [] for c in graph}
    state: Dict = {}
    reach_80 = None
    for q in range(1, budget + 1):
        concept = policy(graph, est, recent, rng, state)
        ok = s.practice(concept)
        est[concept] = bkt_update(est[concept], ok, params_for_level(graph[concept].level))
        recent[concept] = (recent[concept] + [ok])[-6:]
        if reach_80 is None and s.known() >= 0.8 * len(graph):
            reach_80 = q
    return {"known": s.known(), "reach_80": reach_80 if reach_80 is not None else budget + 1}


def p_random(graph, est, recent, rng, state):
    return rng.choice(sorted(graph))


def p_fixed(graph, est, recent, rng, state):
    order = state.setdefault("order", sorted(graph, key=lambda c: (graph[c].level, c)))
    i, k = state.get("i", 0), state.get("k", 0)
    if k >= FIXED_QUESTIONS_PER_CONCEPT:
        i, k = (i + 1) % len(order), 0
    state["i"], state["k"] = i, k + 1
    return order[i]


def p_adaptive(graph, est, recent, rng, state):
    """The product's decision policy: remediate shaky prerequisites, else practice what is unlocked and unmastered."""
    last = state.get("last")
    if last is not None:
        d = decide(last, bool(recent[last][-1]) if recent[last] else True, graph, est, recent[last])
        if d.action == "remediate" and d.focus:
            state["last"] = d.focus
            return d.focus
        if d.action in ("deepen", "review") and est[last] < MASTERED and rng.random() < 0.85:
            return last
    nxt = next_concepts(graph, est, 1)
    pick = nxt[0].id if nxt else rng.choice(sorted(graph))
    state["last"] = pick
    return pick


def p_gated(graph, est, recent, rng, state):
    """Ablation: mastery-gated and prerequisite-unlocked, but never remediates and never lingers on a concept."""
    nxt = next_concepts(graph, est, 3)
    return rng.choice(nxt).id if nxt else rng.choice(sorted(graph))


POLICIES = {"random": p_random, "fixed order": p_fixed, "unlocked-only (no remediation)": p_gated, "adaptive (ours)": p_adaptive}


def ci(xs: List[float]) -> float:
    return 1.96 * statistics.pstdev(xs) / (len(xs) ** 0.5)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--students", type=int, default=300)
    ap.add_argument("--budget", type=int, default=120)
    ap.add_argument("--out", default=str(ROOT / "docs" / "eval" / "policy_simulation.md"))
    args = ap.parse_args()
    graph = load_graph()
    rows = []
    for name, pol in POLICIES.items():
        res = [run(pol, graph, args.budget, random.Random(1000 + i)) for i in range(args.students)]   # same students for every policy
        known = [r["known"] for r in res]
        r80 = [r["reach_80"] for r in res]
        reached = sum(1 for r in res if r["reach_80"] <= args.budget)
        rows.append((name, statistics.mean(known), ci(known), statistics.median(r80), reached / len(res)))
    lines = ["# Policy simulation (synthetic learners)", "",
             "**This is a simulation, not a study with real learners.** Synthetic students with hidden knowledge of the "
             f"{len(graph)} real concepts and their prerequisite graph answer questions with slip 10% and guess 25%. Learning "
             f"is {1 / GATED_LEARN_FACTOR:.0f}x slower when a prerequisite is unknown (an assumption that favours "
             "prerequisite-aware policies). Every policy sees only answers and uses the product's BKT estimator.", "",
             f"{args.students} students per policy (identical students across policies), budget {args.budget} questions.", "",
             "| policy | concepts truly known after budget (mean ± 95% CI) | questions to know 80% (median) | students reaching 80% |",
             "|---|---|---|---|"]
    for name, m, c, med, frac in rows:
        lines.append(f"| {name} | {m:.1f} / {len(graph)} ± {c:.1f} | {med:.0f}{'+' if med > args.budget else ''} | {frac:.0%} |")
    by = {r[0]: r for r in rows}
    ours, gated, fixed = by["adaptive (ours)"], by["unlocked-only (no remediation)"], by["fixed order"]
    gain = ours[1] - fixed[1]
    extra = ours[1] - gated[1]
    lines += ["", f"**Where the gain comes from:** prerequisite-aware unlocking accounts for almost all of it "
                  f"(+{gated[1] - fixed[1]:.1f} concepts over a fixed order). Remediation and lingering on a concept add "
                  + (f"{extra:+.1f} concepts, " + ("within the confidence interval, so no measurable benefit in this simulation."
                                                    if abs(extra) <= ours[2] + gated[2] else "a measurable difference.")),
              f"Total advantage of the full policy over a fixed order: {gain:+.1f} concepts after {args.budget} questions."]
    lines += ["", "Reading: differences larger than the confidence intervals are real *within this simulation*; whether "
                  "real learners behave like the simulated ones is untested. The honest claim is that the policy is "
                  "sound under explicit assumptions, not that it improves real learning outcomes."]
    Path(args.out).write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
