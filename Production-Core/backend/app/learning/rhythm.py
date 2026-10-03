"""A learner's own study rhythm: when they study (weekday x local hour) and how much, week by week.
Only ever computed for the learner who asks, from their own recorded answers."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Mapping, Sequence

WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def _dt(v: Any):
    if not isinstance(v, str) or not v:
        return None
    try:
        d = datetime.fromisoformat(v.replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def rhythm(attempts: Sequence[Mapping[str, Any]], now: datetime, weeks: int = 8) -> Dict[str, Any]:
    grid = [[0] * 24 for _ in range(7)]
    per_week = [[0, 0] for _ in range(weeks)]                       # [answers, correct], oldest first
    days = set()
    for a in attempts:
        t = _dt(a.get("t"))
        if not t:
            continue
        hour = int(a["h"]) % 24 if a.get("h") is not None else t.hour  # local hour when the browser sent it
        grid[t.weekday()][hour] += 1
        days.add(t.date())
        w = (now - t).days // 7
        if 0 <= w < weeks:
            per_week[weeks - 1 - w][0] += 1
            per_week[weeks - 1 - w][1] += bool(a.get("ok"))
    total = sum(map(sum, grid))
    peak = max(((d, h) for d in range(7) for h in range(24)), key=lambda dh: grid[dh[0]][dh[1]]) if total else None
    by_day = [sum(r) for r in grid]
    today = now.date()
    streak, d = 0, today if today in days else today - timedelta(days=1)
    while d in days:
        streak, d = streak + 1, d - timedelta(days=1)
    return {
        "weekdays": list(WEEKDAYS), "grid": grid, "answers": total, "active_days": len(days), "streak": streak,
        "peak": {"day": WEEKDAYS[peak[0]], "hour": peak[1]} if peak else None,
        "best_day": WEEKDAYS[by_day.index(max(by_day))] if total else None,
        "weekly": [{"weeks_ago": weeks - 1 - i, "answers": n, "accuracy": round(ok / n, 3) if n else None}
                   for i, (n, ok) in enumerate(per_week)],
    }


def daily_progress(history, attempts, now: datetime, days: int = 14):
    """One point per day for the last `days` days: overall mastery (carried forward from the last recorded day, 0 before
    the first), plus that day's answers and accuracy from the learner's own attempts. Nothing is invented."""
    by_day = {h.get("date"): h.get("mastery", 0.0) for h in history}
    first = min(by_day) if by_day else None
    counts: dict = {}
    for a in attempts:
        d = str(a.get("t", ""))[:10]
        n, ok = counts.get(d, (0, 0))
        counts[d] = (n + 1, ok + bool(a.get("ok")))
    last = 0.0
    for d in sorted(k for k in by_day if k < (now.date() - timedelta(days=days - 1)).isoformat()):
        last = by_day[d]                                          # carry in the level from before the window
    out = []
    for i in range(days - 1, -1, -1):
        d = (now.date() - timedelta(days=i)).isoformat()
        if d in by_day:
            last = by_day[d]
        n, ok = counts.get(d, (0, 0))
        out.append({"date": d, "mastery": last if first and d >= first else 0.0, "answers": n,
                    "accuracy": round(ok / n * 100, 1) if n else None})
    return out
