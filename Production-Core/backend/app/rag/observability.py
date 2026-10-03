"""Per-request tracing and an in-process metrics ring buffer (feeds the admin view)."""
from __future__ import annotations

import threading
import time
import uuid
from collections import Counter, deque
from contextlib import contextmanager
from typing import Any, Deque, Dict, List


class Trace:
    def __init__(self, query_len: int):
        self.request_id = uuid.uuid4().hex[:12]
        self.started = time.perf_counter()
        self.stages: List[Dict[str, Any]] = []
        self.data: Dict[str, Any] = {"query_chars": query_len}   # never store the raw query/answers

    @contextmanager
    def stage(self, name: str, **info):
        t0 = time.perf_counter()
        rec: Dict[str, Any] = {"name": name, **info}
        try:
            yield rec
            rec["ok"] = True
        except Exception as e:
            rec["ok"] = False
            rec["error"] = type(e).__name__
            raise
        finally:
            rec["ms"] = round((time.perf_counter() - t0) * 1000, 1)
            self.stages.append(rec)

    def set(self, **kw):
        self.data.update(kw)

    def finish(self) -> Dict[str, Any]:
        return {"request_id": self.request_id,
                "total_ms": round((time.perf_counter() - self.started) * 1000, 1),
                "stages": self.stages, **self.data}


class Metrics:
    def __init__(self, cap: int = 500):
        self._buf: Deque[Dict[str, Any]] = deque(maxlen=cap)
        self._lock = threading.Lock()
        self.counters: Counter = Counter()

    def record(self, trace: Dict[str, Any]) -> None:
        with self._lock:
            self._buf.append({k: v for k, v in trace.items() if k != "personalization"})   # per-learner data stays out of admin views
            self.counters["requests"] += 1
            self.counters[f"status:{trace.get('status', 'unknown')}"] += 1
            if trace.get("cache_hit"):
                self.counters["cache_hits"] += 1
            if trace.get("failure"):
                self.counters[f"failure:{trace['failure']}"] += 1

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            rows = list(self._buf)
            counters = dict(self.counters)

        def pct(vals, p):
            if not vals:
                return None
            vals = sorted(vals)
            return round(vals[min(len(vals) - 1, int(p * len(vals)))], 1)

        stage_ms: Dict[str, List[float]] = {}
        for r in rows:
            for s in r.get("stages", []):
                stage_ms.setdefault(s["name"], []).append(s["ms"])
        totals = [r["total_ms"] for r in rows]
        tokens = sum(r.get("tokens_total", 0) for r in rows)
        return {
            "counters": counters,
            "latency_ms": {"p50": pct(totals, 0.5), "p95": pct(totals, 0.95)},
            "stage_latency_ms": {k: {"p50": pct(v, 0.5), "p95": pct(v, 0.95)} for k, v in stage_ms.items()},
            "tokens_total": tokens,
            "recent": rows[-20:][::-1],
        }


metrics = Metrics()
