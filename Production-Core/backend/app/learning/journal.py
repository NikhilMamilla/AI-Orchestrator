"""Learning journal (PRD Feature 11): an auto-generated summary of a period, built only from recorded attempts.

Time invested is the sum of measured seconds-to-answer (a lower bound: reading time outside questions is not
tracked) and is labelled that way. "Overcame" means a concept that had wrong answers in the period and is now
at or above the mastery threshold, so the claim is checkable against the stored data.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Mapping, Optional, Sequence

from .mastery import MASTERED


def build_journal(attempts: Sequence[Mapping[str, Any]], mastery: Mapping[str, float], titles: Mapping[str, str],
                  history: Sequence[Mapping[str, Any]] = (), days: int = 7, now: Optional[datetime] = None) -> Dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    name = lambda c: titles.get(c, c)                                                   # noqa: E731

    period = [a for a in attempts if datetime.fromisoformat(a["t"]) >= since]
    by_day: Dict[str, List[Mapping[str, Any]]] = defaultdict(list)
    for a in period:
        by_day[a["t"][:10]].append(a)

    per_concept: Dict[str, List[bool]] = defaultdict(list)
    for a in period:
        per_concept[a["c"]].append(bool(a["ok"]))

    overcame = [c for c, res in per_concept.items() if not all(res) and mastery.get(c, 0.0) >= MASTERED]
    improving = sorted(((c, sum(r) / len(r)) for c, r in per_concept.items() if len(r) >= 2), key=lambda x: x[1])
    focus = [{"id": c, "title": name(c), "mastery": round(mastery.get(c, 0.0), 3)}
             for c in sorted(per_concept, key=lambda c: mastery.get(c, 0.0)) if mastery.get(c, 0.0) < MASTERED][:3]

    first = next((h for h in history if h["date"] >= since.date().isoformat()), None)
    last = history[-1] if history else None
    secs = sum(a["s"] for a in period if a.get("s") is not None)
    confusions = Counter((a["c"], a["x"]) for a in period if not a["ok"] and a.get("x"))

    return {
        "days": days, "from": since.date().isoformat(), "to": now.date().isoformat(),
        "answers": len(period), "correct": sum(1 for a in period if a["ok"]),
        "accuracy": round(sum(1 for a in period if a["ok"]) / len(period), 3) if period else None,
        "active_days": len(by_day),
        "minutes_answering": round(secs / 60, 1),
        "time_note": "Measured from question response times; time spent reading is not included.",
        "concepts_practiced": [{"id": c, "title": name(c), "answers": len(r), "accuracy": round(sum(r) / len(r), 3)}
                               for c, r in sorted(per_concept.items(), key=lambda kv: -len(kv[1]))],
        "mastered_now": sorted(name(c) for c, m in mastery.items() if m >= MASTERED),
        "overcame": [name(c) for c in overcame],
        "needs_work": focus,
        "recurring_mix_ups": [{"concept": name(c), "confused_with": name(x), "times": n}
                              for (c, x), n in confusions.most_common(3) if n >= 2],
        "overall_mastery_change": None if not (first and last) else
        {"from": first["mastery"], "to": last["mastery"], "delta": round(last["mastery"] - first["mastery"], 1)},
        "daily": [{"date": d, "answers": len(v), "correct": sum(1 for a in v if a["ok"])} for d, v in sorted(by_day.items())],
        "hardest": [{"id": c, "title": name(c), "accuracy": round(acc, 3)} for c, acc in improving[:2]],
    }
