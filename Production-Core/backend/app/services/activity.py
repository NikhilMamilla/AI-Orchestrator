"""Agent activity feed: real orchestrator/analyst decisions persisted to `agent_events`."""
from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable, Dict, Optional

from backend.app.services.database import Database, json_param

logger = logging.getLogger(__name__)
EventSink = Callable[[str, str, Dict[str, Any]], Awaitable[None]]


async def record_event(db: Database, user_id: str, agent: str, message: str,
                       meta: Optional[Dict[str, Any]] = None) -> None:
    """Best effort: logging an event must never break the learning flow."""
    try:
        await db.execute(
            "insert into agent_events(user_id, agent, message, meta) values (%s, %s, %s, %s)",
            (user_id, agent, message[:500], json_param(meta or {})))
    except Exception:
        logger.warning("could not record agent event", exc_info=True)


def make_sink(db: Database, user_id: str) -> EventSink:
    async def sink(agent: str, message: str, meta: Dict[str, Any]) -> None:
        await record_event(db, user_id, agent, message, meta)
    return sink
