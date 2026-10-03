"""Audit log of admin actions (uploads, tools, announcements). Best effort: an audit write never blocks the action,
and before migration 0009 is applied the log is simply empty."""
from __future__ import annotations

import json
import logging
from typing import Any, Mapping, Optional

logger = logging.getLogger(__name__)


async def record(db, actor: Optional[str], action: str, detail: Optional[Mapping[str, Any]] = None) -> None:
    if db.pool is None:
        return
    try:
        await db.execute("insert into admin_audit(actor, action, detail) values (%s, %s, %s::jsonb)",
                         ((actor or "unknown")[:200], action[:80], json.dumps(dict(detail or {}), default=str)))
    except Exception as e:                                   # table missing (0009 not applied) or a blip
        logger.info("admin audit not recorded (%s): %s", type(e).__name__, action)
