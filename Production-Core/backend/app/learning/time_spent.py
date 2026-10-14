"""Estimated study time, from the answers that were timed.

Nothing in the app runs a stopwatch, so the honest figure is an estimate: the seconds each timed answer took (from the moment
the question was shown to the moment it was answered), with a cap per answer so a question left open overnight does not count
as hours of study. Only the recent attempt log (the last 300 answers) is kept, so this covers that window.
"""
from __future__ import annotations

from typing import Any, Mapping, Sequence

ATTEMPT_CAP_SECONDS = 300


def estimated_minutes(attempts: Sequence[Mapping[str, Any]]) -> int:
    seconds = sum(min(float(a["s"]), ATTEMPT_CAP_SECONDS) for a in attempts if a.get("s") and float(a["s"]) > 0)
    return round(seconds / 60)
