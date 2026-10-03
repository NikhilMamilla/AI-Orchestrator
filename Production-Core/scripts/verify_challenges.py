"""Verifies every challenge in the real Judge0 sandbox: the reference must pass all tests, the starter must not.

    python scripts/verify_challenges.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app.learning import challenges  # noqa: E402


async def main() -> int:
    bad = 0
    for c in challenges.load():
        ref = await challenges.grade(c["reference"], c["tests"])
        start = await challenges.grade(c["starter"], c["tests"])
        ref_ok, start_ok = all(r["ok"] for r in ref), all(r["ok"] for r in start)
        flag = "OK " if (ref_ok and not start_ok) else "BAD"
        bad += flag == "BAD"
        print(f"{flag} {c['id']:26s} reference {sum(r['ok'] for r in ref)}/{len(ref)}  starter {sum(r['ok'] for r in start)}/{len(start)}", flush=True)
    print("all challenges verified" if not bad else f"{bad} challenge(s) failed verification")
    return 1 if bad else 0


raise SystemExit(asyncio.run(main()))
