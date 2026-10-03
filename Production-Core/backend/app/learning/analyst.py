"""Behavioural Analyst (PRD 7.4): learning-pattern, struggle and misconception detection from real attempts.

Every signal is a transparent rule over the learner's recorded attempts, using the thresholds the PRD names
(3 wrong in a row, response time > 2x baseline, same mistake 3+ times, plateau). Each rule has a minimum
sample size and reports the evidence behind it, so the system says nothing when it has not seen enough.

Attempt record: {"c": concept, "ok": bool, "s": seconds-to-answer | None, "t": ISO time,
                 "h": local hour | None, "x": concept the chosen wrong option came from | None}
"""
from __future__ import annotations

from collections import Counter
from statistics import median
from typing import Any, Dict, List, Mapping, Sequence

STRUGGLE_RUN = 3            # PRD: 3 wrong in a row
SLOW_FACTOR = 2.0           # PRD: response time 2x beyond baseline
REPEAT_MISTAKE = 3          # PRD: same mistake type 3+ times
MIN_BASELINE = 5            # attempts with a timing needed before "slow" means anything
RUSHED_SECONDS = 3.0        # reading a stem and four options in under 3 s is not a considered answer
PLATEAU_MIN_ATTEMPTS = 8
BUCKET_MIN = 5
HISTORY_CAP = 300

BUCKETS = (("morning", 5, 12), ("afternoon", 12, 17), ("evening", 17, 22), ("night", 22, 29))


def _bucket(hour: int) -> str:
    h = hour if hour >= 5 else hour + 24
    return next(name for name, lo, hi in BUCKETS if lo <= h < hi)


def _signal(sid: str, severity: str, title: str, detail: str, action: str, evidence: Dict[str, Any],
            ask: str | None = None) -> Dict[str, Any]:
    out = {"id": sid, "severity": severity, "title": title, "detail": detail, "action": action, "evidence": evidence}
    if ask:
        out["ask"] = ask
    return out


def analyse(attempts: Sequence[Mapping[str, Any]], mastery: Mapping[str, float] | None = None,
            titles: Mapping[str, str] | None = None) -> Dict[str, Any]:
    mastery, titles = mastery or {}, titles or {}
    name = lambda cid: titles.get(cid, cid)                                           # noqa: E731
    att = list(attempts)
    signals: List[Dict[str, Any]] = []
    secs = [a["s"] for a in att if a.get("s") is not None]
    base = median(secs[:-3]) if len(secs[:-3]) >= MIN_BASELINE else None

    # 1) struggle: N wrong in a row
    run = 0
    for a in reversed(att):
        if a["ok"]:
            break
        run += 1
    if run >= STRUGGLE_RUN:
        last = att[-1]["c"]
        signals.append(_signal("struggle", "warn", "Three misses in a row",
                               f"Your last {run} answers were wrong (latest on {name(last)}). A hint or worked example "
                               "will help more than another attempt.", "worked_example", {"wrong_in_a_row": run, "concept": last}))

    # 2) rapid wrong answers: possible frustration or guessing
    recent = att[-4:]
    fast_wrong = [a for a in recent if not a["ok"] and a.get("s") is not None and a["s"] < RUSHED_SECONDS]
    if len(recent) >= 4 and len(fast_wrong) >= 3:
        signals.append(_signal("rapid_wrong", "warn", "Answering very fast, and missing",
                               f"{len(fast_wrong)} of your last 4 answers were wrong and given in under {RUSHED_SECONDS:.0f}s. "
                               "That pattern means guessing or frustration. Take a short break, then re-read the explanation.",
                               "break", {"fast_wrong": len(fast_wrong), "of": 4}))

    # 3) slow responses: possible confusion
    last3 = [a["s"] for a in att[-3:] if a.get("s") is not None]
    if base and len(last3) == 3 and median(last3) > SLOW_FACTOR * base:
        signals.append(_signal("slow", "info", "Taking much longer than usual",
                               f"Your recent answers take {median(last3):.0f}s against a usual {base:.0f}s. "
                               "That often signals confusion; a different explanation style may help.",
                               "change_strategy", {"recent_median_s": round(median(last3), 1), "baseline_s": round(base, 1)}))

    # misconceptions: which other concept the learner's wrong picks keep coming from
    pairs = Counter((a["c"], a["x"]) for a in att if not a["ok"] and a.get("x") and a["x"] != a["c"])
    confusions = [{"concept": c, "confused_with": x, "count": n, "concept_title": name(c), "confused_title": name(x)}
                  for (c, x), n in pairs.most_common(5)]
    for cf in confusions:
        if cf["count"] >= REPEAT_MISTAKE:
            signals.append(_signal(
                "repeated_confusion", "warn", f"You keep mixing up {cf['concept_title']} and {cf['confused_title']}",
                f"{cf['count']} wrong answers on {cf['concept_title']} chose a statement that actually describes "
                f"{cf['confused_title']}. Comparing them side by side usually fixes this.", "contrast", cf,
                ask=f"What is the difference between {cf['concept_title']} and {cf['confused_title']}?"))

    # 4) plateau per concept
    by_concept: Dict[str, List[bool]] = {}
    for a in att:
        by_concept.setdefault(a["c"], []).append(bool(a["ok"]))
    for c, res in by_concept.items():
        if len(res) >= PLATEAU_MIN_ATTEMPTS and mastery.get(c, 0.0) < 0.70:
            recent_acc, prior_acc = sum(res[-4:]) / 4, sum(res[-8:-4]) / 4
            if recent_acc - prior_acc <= 0.0:
                signals.append(_signal("plateau", "info", f"Progress on {name(c)} has stalled",
                                       f"Accuracy over your last 4 answers ({recent_acc:.0%}) is no better than the 4 before "
                                       f"({prior_acc:.0%}) and mastery is {mastery.get(c, 0.0):.0%}. Try a different explanation style.",
                                       "change_strategy", {"concept": c, "recent": recent_acc, "prior": prior_acc, "attempts": len(res)}))

    # 5) best time of day (local hour, only with enough samples in at least two buckets)
    tally: Dict[str, List[bool]] = {}
    for a in att:
        if a.get("h") is not None:
            tally.setdefault(_bucket(int(a["h"])), []).append(bool(a["ok"]))
    ok_buckets = {b: (sum(v) / len(v), len(v)) for b, v in tally.items() if len(v) >= BUCKET_MIN}
    best = None
    if len(ok_buckets) >= 2:
        b, (acc, n) = max(ok_buckets.items(), key=lambda kv: kv[1][0])
        best = {"bucket": b, "accuracy": round(acc, 3), "n": n,
                "others": {k: {"accuracy": round(v[0], 3), "n": v[1]} for k, v in ok_buckets.items() if k != b}}

    # 6) calibration: does stated confidence match results? Confident mistakes are misconceptions, not slips.
    cal: Dict[str, Dict[str, Any]] = {}
    for level in ("guess", "unsure", "sure"):
        rows = [a for a in att if a.get("k") == level]
        if len(rows) >= 3:
            cal[level] = {"n": len(rows), "accuracy": round(sum(1 for a in rows if a["ok"]) / len(rows), 3)}
    sure = [a for a in att if a.get("k") == "sure"][-8:]
    if len(sure) >= 3 and sum(1 for a in sure if not a["ok"]) >= 2:
        wrong_sure = sum(1 for a in sure if not a["ok"])
        signals.append(_signal("overconfident", "warn", "Confident, but wrong",
                               f"{wrong_sure} of your last {len(sure)} \"sure\" answers were wrong. Confident mistakes usually mean a "
                               "misconception rather than a slip, so re-read the source before moving on.",
                               "contrast", {"sure_wrong": wrong_sure, "sure_total": len(sure)}))

    total = len(att)
    return {"attempts": total, "calibration": cal, "accuracy": round(sum(a["ok"] for a in att) / total, 3) if total else None,
            "median_seconds": round(median(secs), 1) if secs else None, "signals": signals,
            "confusions": confusions, "best_time_of_day": best,
            "note": None if total >= 5 else "Answer a few more questions and patterns will start to appear."}
