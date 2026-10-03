"""Aggregates for the admin console, as pure functions over rows the router reads.

Privacy rules, enforced here so every route inherits them:
* only counts, rates and distributions leave this module, never a user id, email, name or free text a learner wrote;
* any group smaller than `min_group` learners is reported as None (the UI shows "<k"), so nobody can be singled out.
  Production uses ADMIN_MIN_GROUP (default 5); development uses 1 so a local demo shows real numbers.
"""
from __future__ import annotations

import statistics
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence

from backend.app.learning.mastery import MASTERED, READY

BANDS = ("learning", "ready", "mastered")          # < READY, READY..MASTERED, >= MASTERED (PRD 7.5 thresholds)
STYLES = ("default", "socratic", "worked_example", "analogy")


def _dt(v: Any) -> Optional[datetime]:
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    if isinstance(v, str) and v:
        try:
            d = datetime.fromisoformat(v.replace("Z", "+00:00"))
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def gate(n: int, k: int) -> Optional[int]:
    """A count of learners, or None when it is a group too small to show."""
    return n if n == 0 or n >= k else None


def day_keys(days: int, now: datetime) -> List[str]:
    today = now.astimezone(timezone.utc).date()
    return [(today - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]


def _patterns(p: Mapping[str, Any]) -> Mapping[str, Any]:
    return p.get("patterns") or {}


# ---------------------------------------------------------------- overview
def overview(profiles: Sequence[Mapping[str, Any]], questions: Iterable[Mapping[str, Any]],
             code_runs: Iterable[Any], days: int, now: datetime, k: int) -> Dict[str, Any]:
    """KPIs with a per-day series each. `questions`: rag_requests rows (created_at, status, total_ms, confidence);
    `code_runs`: created_at values of code_submissions."""
    keys = day_keys(days, now)
    idx = {d: i for i, d in enumerate(keys)}
    active_by_day: List[set] = [set() for _ in keys]
    answers = [0] * len(keys)
    for n, p in enumerate(profiles):
        for a in _patterns(p).get("attempts", []):
            t = _dt(a.get("t"))
            i = idx.get(t.date().isoformat()) if t else None
            if i is not None:
                answers[i] += 1
                active_by_day[i].add(n)

    asked, grounded, refused, latency = [0] * len(keys), [0] * len(keys), [0] * len(keys), [[] for _ in keys]
    for q in questions:
        t = _dt(q.get("created_at"))
        i = idx.get(t.date().isoformat()) if t else None
        if i is None:
            continue
        asked[i] += 1
        grounded[i] += q.get("status") == "grounded"
        refused[i] += q.get("status") == "insufficient_evidence"
        if q.get("total_ms") is not None:
            latency[i].append(float(q["total_ms"]))
    runs = [0] * len(keys)
    for c in code_runs:
        t = _dt(c)
        i = idx.get(t.date().isoformat()) if t else None
        if i is not None:
            runs[i] += 1

    last_seen = [_dt(_patterns(p).get("last_active")) for p in profiles]
    created = [_dt(p.get("created_at")) for p in profiles]
    active_1d = sum(1 for t in last_seen if t and now - t <= timedelta(days=1))
    active_7d = sum(1 for t in last_seen if t and now - t <= timedelta(days=7))
    new = [0] * len(keys)
    for t in created:
        i = idx.get(t.date().isoformat()) if t else None
        if i is not None:
            new[i] += 1
    all_lat = sorted(x for day in latency for x in day)
    total_asked = sum(asked)
    return {
        "days": keys,
        "kpi": {
            "learners": len(profiles),
            "active_1d": gate(active_1d, k),
            "active_7d": gate(active_7d, k),
            "new": sum(new),
            "questions": total_asked,
            "answers": sum(answers),
            "code_runs": sum(runs),
            "grounded_rate": round(sum(grounded) / total_asked, 3) if total_asked else None,
            "refusal_rate": round(sum(refused) / total_asked, 3) if total_asked else None,
            "p95_ms": round(all_lat[min(len(all_lat) - 1, int(0.95 * len(all_lat)))]) if all_lat else None,
        },
        "series": {
            "active": [gate(len(s), k) for s in active_by_day],
            "new": new,
            "questions": asked,
            "answers": answers,
            "code_runs": runs,
            "grounded": grounded,
            "refused": refused,
        },
    }


def alerts(ov: Mapping[str, Any], gaps_top: Sequence[Mapping[str, Any]], docs_without_passages: int,
           services: Mapping[str, bool]) -> List[Dict[str, str]]:
    """Plain rules over the overview; each alert says what tripped it."""
    out: List[Dict[str, str]] = []
    s = ov["series"]
    half = len(s["questions"]) // 2
    prev_q, last_q = sum(s["questions"][:half]), sum(s["questions"][half:])
    prev_r, last_r = sum(s["refused"][:half]), sum(s["refused"][half:])
    if last_q >= 10 and prev_q >= 10:
        before, after = prev_r / prev_q, last_r / last_q
        if after - before >= 0.10:
            out.append({"level": "warning", "text": f"Refusal rate rose from {before:.0%} to {after:.0%}: learners are asking about topics the sources don't cover."})
    for g in gaps_top:
        if g.get("count", 0) >= 5:
            out.append({"level": "warning", "text": f"“{g['topic']}” was refused {g['count']} times. Consider a source for it."})
    if docs_without_passages:
        out.append({"level": "serious", "text": f"{docs_without_passages} document(s) have no passages, so they can never be cited."})
    for name, ok in services.items():
        if not ok:
            out.append({"level": "critical", "text": f"{name} is not reachable."})
    return out


# ---------------------------------------------------------------- learners (cohort only)
def learners(profiles: Sequence[Mapping[str, Any]], titles: Mapping[str, str], now: datetime, k: int) -> Dict[str, Any]:
    concepts = list(titles)
    bands: Dict[str, Counter] = {c: Counter() for c in concepts}
    acc: Dict[str, List[int]] = defaultdict(lambda: [0, 0])          # concept -> [correct, total]
    secs: Dict[str, List[float]] = defaultdict(list)
    who: Dict[str, set] = defaultdict(set)                            # learners who answered on a concept
    confusions: Counter = Counter()
    confusion_who: Dict[tuple, set] = defaultdict(set)
    overdue: Counter = Counter()
    struggling: Counter = Counter()
    style_n: Counter = Counter()
    style_w: Counter = Counter()
    per_learner: List[int] = []
    streaks: List[int] = []
    placement = {"started": 0, "finished": 0}
    goals = {"set": 0, "past_deadline": 0}

    for n, p in enumerate(profiles):
        pat = _patterns(p)
        for m in p.get("concept_mastery") or []:
            c, v = m.get("concept_id"), float(m.get("mastery_level") or 0)
            if c in bands:
                bands[c]["mastered" if v >= MASTERED else "ready" if v >= READY else "learning"] += 1
            due = _dt(m.get("next_review_due"))
            if c in bands and due and due < now:
                overdue[c] += 1
        att = pat.get("attempts", [])
        per_learner.append(len(att))
        for a in att:
            c = a.get("c")
            acc[c][1] += 1
            acc[c][0] += bool(a.get("ok"))
            who[c].add(n)
            if a.get("s") is not None:
                secs[c].append(float(a["s"]))
            if not a.get("ok") and a.get("x") and a.get("x") != c:
                confusions[(c, a["x"])] += 1
                confusion_who[(c, a["x"])].add(n)
        for c, res in (pat.get("recent_results") or {}).items():
            if len(res) >= 3 and not any(res[-3:]):                  # PRD: 3 wrong in a row
                struggling[c] += 1
        for style, s in (pat.get("strategy_stats") or {}).items():
            style_n[style] += int(s.get("n", 0))
            style_w[style] += int(s.get("wins", 0))
        streaks.append(int((p.get("overall_stats") or {}).get("current_streak", 0)))
        d = pat.get("diagnostic")
        if d:
            placement["started"] += 1
            placement["finished"] += bool(d.get("done"))
        g = pat.get("goal")
        if g:
            goals["set"] += 1
            dl = _dt(g.get("deadline"))
            goals["past_deadline"] += bool(dl and dl < now)

    heat = [{"concept": c, "title": titles[c], **{b: gate(bands[c][b], k) for b in BANDS},
             "learners": gate(sum(bands[c].values()), k)} for c in concepts]
    hardest = []
    for c, (ok, total) in acc.items():
        if c in titles and len(who[c]) >= k and total >= 3:
            hardest.append({"concept": c, "title": titles[c], "accuracy": round(ok / total, 3), "answers": total,
                            "learners": len(who[c]), "median_seconds": round(statistics.median(secs[c]), 1) if secs[c] else None})
    hardest.sort(key=lambda r: (r["accuracy"], -r["answers"]))
    mixups = [{"concept": titles.get(a, a), "confused_with": titles.get(b, b), "times": n}
              for (a, b), n in confusions.most_common(12) if len(confusion_who[(a, b)]) >= k]

    def buckets(vals: Sequence[int], edges: Sequence[tuple]) -> List[Dict[str, Any]]:
        return [{"label": lab, "learners": gate(sum(1 for v in vals if lo <= v <= hi), k)} for lab, lo, hi in edges]

    return {
        "learners": len(profiles),
        "heatmap": heat,
        "hardest": hardest[:8],
        "mixups": mixups,
        "overdue": [{"concept": c, "title": titles[c], "learners": gate(n, k)} for c, n in overdue.most_common(8) if c in titles],
        "struggling": [{"concept": c, "title": titles.get(c, c), "learners": gate(n, k)} for c, n in struggling.most_common(8)],
        "styles": [{"style": s, "trials": style_n[s], "win_rate": round(style_w[s] / style_n[s], 3) if style_n[s] else None}
                   for s in STYLES],
        "placement": {key: gate(v, k) for key, v in placement.items()},
        "goals": {key: gate(v, k) for key, v in goals.items()},
        "answers_per_learner": buckets(per_learner, [("0", 0, 0), ("1–5", 1, 5), ("6–20", 6, 20), ("21–50", 21, 50), ("50+", 51, 10**9)]),
        "streaks": buckets(streaks, [("0", 0, 0), ("1 day", 1, 1), ("2–6", 2, 6), ("7+", 7, 10**9)]),
    }


def missed_questions(rows: Iterable[Mapping[str, Any]], titles: Mapping[str, str], k: int) -> List[Dict[str, Any]]:
    """Quiz questions most often answered wrong, with the most-picked wrong option. Content, not people: grouped by
    question text, and only shown once at least k different learners answered it."""
    by_q: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        q = by_q.setdefault(r["question"], {"doc_id": r["doc_id"], "options": r["options"], "answer": r["answer_index"],
                                            "wrong": Counter(), "n": 0, "users": set()})
        q["n"] += 1
        q["users"].add(r.get("user_id"))
        if r.get("correct") is False and r.get("chosen_index") is not None:
            q["wrong"][int(r["chosen_index"])] += 1
    out = []
    for text, q in by_q.items():
        miss = sum(q["wrong"].values())
        if len(q["users"]) < k or not miss:
            continue
        pick, times = q["wrong"].most_common(1)[0]
        opts = q["options"] or []
        out.append({"concept": titles.get(q["doc_id"], q["doc_id"]), "question": text, "answers": q["n"],
                    "miss_rate": round(miss / q["n"], 3), "common_wrong": opts[pick] if pick < len(opts) else None,
                    "correct": opts[q["answer"]] if q["answer"] < len(opts) else None})
    out.sort(key=lambda r: (-r["miss_rate"], -r["answers"]))
    return out[:10]


def challenge_stats(profiles: Sequence[Mapping[str, Any]], catalog: Sequence[Mapping[str, Any]], k: int) -> List[Dict[str, Any]]:
    out = []
    for c in catalog:
        states = [s for p in profiles if (s := (_patterns(p).get("challenges") or {}).get(c["id"]))]
        tried, passed = len(states), sum(1 for s in states if s.get("passed"))
        fails = [int(s.get("fails", 0)) for s in states]
        out.append({"id": c["id"], "title": c.get("title", c["id"]), "concept": c.get("concept"), "kind": c.get("kind"),
                    "tried": gate(tried, k), "passed": gate(passed, k),
                    "pass_rate": round(passed / tried, 3) if tried >= max(k, 1) else None,
                    "mean_fails": round(sum(fails) / tried, 2) if tried >= max(k, 1) else None})
    return out


# ---------------------------------------------------------------- answer quality
def quality(rows: Sequence[Mapping[str, Any]], days: int, now: datetime) -> Dict[str, Any]:
    keys = day_keys(days, now)
    idx = {d: i for i, d in enumerate(keys)}
    status = {s: [0] * len(keys) for s in ("grounded", "insufficient_evidence", "fallback", "other")}
    p50, p95, lat = [None] * len(keys), [None] * len(keys), [[] for _ in keys]
    conf_hist = [0] * 10
    models: Counter = Counter()
    failures: Counter = Counter()
    tokens = cache_hits = 0
    for r in rows:
        t = _dt(r.get("created_at"))
        i = idx.get(t.date().isoformat()) if t else None
        if i is None:
            continue
        meta = r.get("meta") or {}
        st = r.get("status")
        bucket = st if st in ("grounded", "insufficient_evidence") else "fallback" if meta.get("mode") == "extractive" else "other"
        status[bucket][i] += 1
        if r.get("total_ms") is not None:
            lat[i].append(float(r["total_ms"]))
        if r.get("confidence") is not None and st == "grounded":
            conf_hist[min(9, max(0, int(float(r["confidence"]) * 10)))] += 1
        if meta.get("model"):
            models[meta["model"]] += 1
        if meta.get("failure"):
            failures[meta["failure"]] += 1
        tokens += int(meta.get("tokens_total") or 0)
        cache_hits += bool(meta.get("cache_hit"))
    for i, v in enumerate(lat):
        if v:
            v.sort()
            p50[i] = round(v[len(v) // 2])
            p95[i] = round(v[min(len(v) - 1, int(0.95 * len(v)))])
    total = sum(sum(v) for v in status.values())
    return {"days": keys, "status": status, "p50_ms": p50, "p95_ms": p95,
            "confidence": [{"bin": f"{i / 10:.1f}", "answers": n} for i, n in enumerate(conf_hist)],
            "models": [{"model": m, "answers": n} for m, n in models.most_common(6)],
            "failures": dict(failures), "tokens": tokens, "answers": total,
            "cache_hit_rate": round(cache_hits / total, 3) if total else None}


def eval_summary(files: Mapping[str, Any]) -> Dict[str, Any]:
    """Headline numbers from the committed evaluation runs (docs/eval/*.json); missing files are skipped."""
    out: Dict[str, Any] = {}
    r = files.get("results")
    if r:
        out["retrieval"] = [{"config": name, "recall@3": c["metrics"].get("recall@3"), "mrr": c["metrics"].get("mrr"),
                             "ndcg@5": c["metrics"].get("ndcg@5"), "n": c.get("n")} for name, c in r.get("configs", {}).items()]
        out["evidence_gate"] = (r.get("evidence_gate") or {}).get("best")
        out["injection_guard"] = r.get("injection_guard")
    g = (files.get("generation") or {}).get("summary")
    if g:
        out["generation"] = {k: g.get(k) for k in ("faithfulness_shipped", "citation_accuracy", "answer_rate", "oos_refusal_rate",
                                                  "relevance_mean_1to5", "n_scoped")}
    t = (files.get("teachback") or {}).get("summary")
    if t:
        out["teachback"] = {k: {"pass_rate": v.get("pass_rate"), "n": v.get("n")} for k, v in t.items()}
    s = files.get("sketch")
    if s:
        rate = lambda v: v[0] if isinstance(v, list) and v else v          # some keys are stored as [rate, n]
        out["sketch"] = {k: rate(s.get(k)) for k in ("n", "neuro_symbolic_accuracy", "direct_vlm_accuracy",
                                                     "neuro_symbolic_detects_invalid", "direct_detects_invalid")}
    return out


# ---------------------------------------------------------------- drill-down: one concept
def concept_detail(profiles: Sequence[Mapping[str, Any]], concept: str, titles: Mapping[str, str],
                   prerequisites: Sequence[str], dependents: Sequence[str], now: datetime, k: int, weeks: int = 8) -> Dict[str, Any]:
    bands: Counter = Counter()
    who, overdue, struggling = set(), 0, 0
    secs: List[float] = []
    week_ok = [[0, 0] for _ in range(weeks)]                      # [correct, total], oldest first
    out_mix: Counter = Counter()                                   # picked an option from another concept
    in_mix: Counter = Counter()                                    # another concept's question, this concept's option
    for n, p in enumerate(profiles):
        pat = _patterns(p)
        for m in p.get("concept_mastery") or []:
            if m.get("concept_id") == concept:
                v = float(m.get("mastery_level") or 0)
                bands["mastered" if v >= MASTERED else "ready" if v >= READY else "learning"] += 1
                due = _dt(m.get("next_review_due"))
                overdue += bool(due and due < now)
        res = (pat.get("recent_results") or {}).get(concept) or []
        struggling += len(res) >= 3 and not any(res[-3:])
        for a in pat.get("attempts", []):
            if a.get("c") == concept:
                who.add(n)
                if a.get("s") is not None:
                    secs.append(float(a["s"]))
                t = _dt(a.get("t"))
                if t:
                    w = (now - t).days // 7
                    if 0 <= w < weeks:
                        week_ok[weeks - 1 - w][1] += 1
                        week_ok[weeks - 1 - w][0] += bool(a.get("ok"))
                if not a.get("ok") and a.get("x") and a["x"] != concept:
                    out_mix[a["x"]] += 1
            elif not a.get("ok") and a.get("x") == concept:
                in_mix[a.get("c")] += 1
    total = sum(t for _, t in week_ok)
    enough = len(who) >= k
    return {
        "concept": concept, "title": titles.get(concept, concept),
        "prerequisites": [{"id": c, "title": titles.get(c, c)} for c in prerequisites],
        "dependents": [{"id": c, "title": titles.get(c, c)} for c in dependents],
        "learners": gate(len(who), k),
        "bands": {b: gate(bands[b], k) for b in BANDS},
        "overdue": gate(overdue, k), "struggling": gate(struggling, k),
        "answers": total if enough else None,
        "accuracy": round(sum(o for o, _ in week_ok) / total, 3) if enough and total else None,
        "median_seconds": round(statistics.median(secs), 1) if enough and secs else None,
        "weekly": [{"weeks_ago": weeks - 1 - i, "answers": t if enough else None,
                    "accuracy": round(o / t, 3) if enough and t else None} for i, (o, t) in enumerate(week_ok)],
        "confused_with": [{"title": titles.get(c, c), "times": n} for c, n in out_mix.most_common(5)] if enough else [],
        "mistaken_for": [{"title": titles.get(c, c), "times": n} for c, n in in_mix.most_common(5)] if enough else [],
    }


# ---------------------------------------------------------------- engagement
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def engagement(profiles: Sequence[Mapping[str, Any]], now: datetime, k: int, cohorts: int = 6) -> Dict[str, Any]:
    """Weekly retention cohorts (by the week of a learner's first answer) and when people study (weekday x hour)."""
    grid = [[0] * 24 for _ in range(7)]
    this_monday = (now - timedelta(days=now.weekday())).date()
    rows: Dict[date, List[set]] = {}
    for p in profiles:
        days = sorted({t for a in _patterns(p).get("attempts", []) if (t := _dt(a.get("t")))})
        for a in _patterns(p).get("attempts", []):
            t = _dt(a.get("t"))
            if t:
                hour = int(a["h"]) if a.get("h") is not None else t.hour      # the learner's local hour when recorded
                grid[t.weekday()][hour % 24] += 1
        if not days:
            continue
        first = days[0].date() - timedelta(days=days[0].weekday())
        weeks_active = {((d.date() - timedelta(days=d.weekday())) - first).days // 7 for d in days}
        rows.setdefault(first, [set() for _ in range(cohorts)])
        for w in weeks_active:
            if w < cohorts:
                rows[first][w].add(id(p))
    table = []
    for i in range(cohorts - 1, -1, -1):
        start = this_monday - timedelta(weeks=i)
        sets = rows.get(start)
        size = len(sets[0]) if sets else 0
        visible = gate(size, k)
        table.append({"week_of": start.isoformat(), "learners": visible,
                      "retention": [None if (w > i or not size or visible is None) else round(len(sets[w]) / size, 3)
                                    for w in range(cohorts)]})
    active = sum(1 for p in profiles if _patterns(p).get("attempts"))
    total = sum(map(sum, grid)) if gate(active, k) is not None else 0      # one person's study habits are never shown
    peak = max(((d, h) for d in range(7) for h in range(24)), key=lambda dh: grid[dh[0]][dh[1]])
    return {"cohorts": table, "weeks": cohorts, "weekdays": list(WEEKDAYS), "grid": grid if total else None,
            "answers": total, "learners": gate(active, k), "peak": {"day": WEEKDAYS[peak[0]], "hour": peak[1]} if total else None}
