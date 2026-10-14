"""The learner's own clock. The browser sends its UTC offset with every answer (JavaScript's getTimezoneOffset(): minutes,
UTC minus local); the last one is kept in the profile so that streaks, goal deadlines and the activity rhythm count days where
the learner lives, not in UTC. With no offset known (an older client, a learner who has not answered yet) it stays UTC."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Mapping, Optional


def valid_offset(value: Any) -> Optional[int]:
    """The offset if it is a plausible number of minutes (UTC-14 to UTC+14), else None."""
    try:
        v = int(value)
    except (TypeError, ValueError):
        return None
    return v if -14 * 60 <= v <= 14 * 60 and not isinstance(value, bool) else None


def learner_offset(patterns: Mapping[str, Any]) -> int:
    return valid_offset(patterns.get("tz_offset_min")) or 0


def to_local(moment: datetime, offset_min: int) -> datetime:
    return moment - timedelta(minutes=offset_min)


def local_today(patterns: Mapping[str, Any], now: Optional[datetime] = None) -> date:
    return to_local(now or datetime.now(timezone.utc), learner_offset(patterns)).date()
