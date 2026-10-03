"""Code challenges (PRD 7.3: debugging tasks, code challenges, code execution) graded by real execution.

Each challenge has hidden tests; a submission is run against all of them in the Judge0 sandbox and graded on the
actual stdout. The first test is shown as a sample, the rest stay hidden. Expected outputs were produced by running the
reference solution (`scripts/build_challenges.py`) and every reference/starter pair is verified in the same sandbox
(`scripts/verify_challenges.py`), so a challenge cannot be unsolvable or pass without work.

Help ladder (PRD "hints vs let them struggle"): first failures give no help, from the 2nd a hint, from the 3rd the
worked solution. Mastery is updated once per challenge for the first failure, and once more on a pass; asking for the
worked solution lowers the credit for the pass (same BKT guess-probability mechanism as quiz hints).
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

from backend.app.config import settings

DATA = Path(__file__).resolve().parents[3] / "data" / "challenges" / "challenges.json"
PYTHON_ID = 71
HINT_AFTER, SOLUTION_AFTER = 2, 3
MAX_CODE = 8000
_cache: Optional[List[Dict[str, Any]]] = None


def load() -> List[Dict[str, Any]]:
    global _cache
    if _cache is None:
        _cache = json.loads(DATA.read_text(encoding="utf-8")) if DATA.exists() else []
    return _cache


def get(challenge_id: str) -> Optional[Dict[str, Any]]:
    return next((c for c in load() if c["id"] == challenge_id), None)


def public_view(c: Dict[str, Any], state: Dict[str, Any]) -> Dict[str, Any]:
    """What the learner may see: never the hidden tests or the reference until the help ladder allows it."""
    fails = int(state.get("fails", 0))
    out = {"id": c["id"], "concept": c["concept"], "kind": c["kind"], "title": c["title"], "prompt": c["prompt"],
           "starter": c["starter"], "sample": {"input": c["tests"][0]["input"], "output": c["tests"][0]["output"]},
           "tests": len(c["tests"]), "passed": bool(state.get("passed")), "fails": fails,
           "hint_taken": bool(state.get("hint_taken"))}
    if fails >= HINT_AFTER or state.get("hint_taken"):
        out["hint"] = c["hint"]
    if fails >= SOLUTION_AFTER or state.get("passed"):
        out["solution"] = c["reference"]
    return out


async def run_one(client: httpx.AsyncClient, code: str, stdin: str) -> Dict[str, Any]:
    r = await client.post(f"{settings.JUDGE0_API_URL.rstrip('/')}/submissions",
                          params={"base64_encoded": "false", "wait": "true"},
                          json={"language_id": PYTHON_ID, "source_code": code, "stdin": stdin,
                                "cpu_time_limit": 3, "wall_time_limit": 8})
    if r.status_code == 429:
        raise RuntimeError("busy")
    r.raise_for_status()
    return r.json()


async def grade(code: str, tests: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    """Run every test; returns per-test verdicts from the real sandbox output."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        results = []
        for t in tests:
            res = await run_one(client, code, t["input"])
            status = (res.get("status") or {}).get("description", "Unknown")
            out = (res.get("stdout") or "").strip()
            ok = status == "Accepted" and out == t["output"].strip()
            results.append({"ok": ok, "status": status if status != "Accepted" else ("Accepted" if ok else "Wrong Answer"),
                            "time": res.get("time"), "error": ((res.get("stderr") or res.get("compile_output") or "")[:400]) or None,
                            "got": out[:200] if not ok else None})
            await asyncio.sleep(0)
    return results
