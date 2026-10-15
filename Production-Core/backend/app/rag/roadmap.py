"""The DSA roadmap (curriculum/dsa_roadmap.md, 22 domains) against what Kiddoo has notes for (26 concept documents).

A learner can ask about a roadmap topic Kiddoo has not written up yet (segment trees, Fenwick trees, Mo's algorithm...). The
evidence gate already refuses those; this lets the refusal say *why*: "Segment Trees are on the roadmap but not in Kiddoo's
notes yet". It only names a topic; it never invents content about it.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Sequence


def _norm(text: str) -> str:
    """Lower-case words without apostrophes or punctuation, a trailing plural 's' dropped: "Mo’s Algorithms" -> "mo algorithm"."""
    words = re.sub(r"[^a-z0-9]+", " ", re.sub(r"[’']", "", text.lower())).split()
    return " ".join(w[:-1] if len(w) > 3 and w.endswith("s") else w for w in words)


@dataclass(frozen=True)
class Topic:
    name: str            # as written in the roadmap
    domain: str
    key: str             # normalised, what a question is matched against


class Roadmap:
    def __init__(self, topics: Sequence[Topic]):
        self.topics: List[Topic] = sorted(topics, key=lambda t: -len(t.key))        # the most specific phrase wins

    def uncovered_mention(self, query: str, docs) -> Optional[Topic]:
        """The roadmap topic the question mentions that no concept document covers, or None."""
        q = f" {_norm(query)} "
        covered = [_norm(f"{d.title} {' '.join(d.tags)}") for d in docs]
        for t in self.topics:
            if f" {t.key} " in q and not any(t.key in c or (_norm(d.title) and _norm(d.title) in t.key) for c, d in zip(covered, docs)):
                return t
        return None


def _terms(domain: str, bullets: List[str]) -> List[str]:
    out = [p.strip() for p in re.split(r"&|/", re.sub(r"\([^)]*\)", "", domain)) if p.strip()]
    for b in bullets:
        for item in re.split(r"[,;]", b):
            item = re.sub(r"\([^)]*\)", "", item).strip(" .")
            if item:
                out.append(item)
    return out


def parse_roadmap(md: str) -> Roadmap:
    topics: List[Topic] = []
    domain, bullets = None, []

    def flush():
        if domain:
            for term in _terms(domain, bullets):
                key = _norm(term)
                # a single short word ("Search", "Basics") would match half of everything: use phrases or long words only
                if key and (" " in key or len(key) >= 7):
                    topics.append(Topic(term, domain, key))

    for line in md.splitlines():
        h = re.match(r"^##\s+\S*\s*\d+\.\s+(.+?)\s*$", line)
        if h:
            flush()
            domain, bullets = h.group(1), []
        elif domain and (b := re.match(r"^-\s+\*\*[^*]+\*\*:\s*(.+)$", line)):
            bullets.append(b.group(1))
    flush()
    return Roadmap(topics)


def load_roadmap(path: Path) -> Roadmap:
    return parse_roadmap(Path(path).read_text(encoding="utf-8"))
