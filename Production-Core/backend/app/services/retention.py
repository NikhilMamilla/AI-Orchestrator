"""Retention: operational data that only grows is deleted after a fixed time, by the app itself (no external scheduler).

* rag_requests (one anonymous row per answer, for the admin quality charts): 90 days
* code_submissions (what a learner ran in the playground): 180 days
* content_gaps (refused questions, stored with no user): 90 days

It runs once when the server starts and then every 24 hours while it is up, and an admin can run it at once (System page).
A failure is logged and never stops the server or the loop.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Dict

from backend.app.rag.gaps import RETENTION_DAYS as GAPS_DAYS

logger = logging.getLogger(__name__)

RETENTION_DAYS: Dict[str, int] = {"rag_requests": 90, "code_submissions": 180, "content_gaps": GAPS_DAYS}
DAY_SECONDS = 24 * 60 * 60


async def prune(db) -> Dict[str, int]:
    """Delete the rows older than each table's window; returns how many were removed per table ({} without a database)."""
    if db.pool is None:
        return {}
    removed: Dict[str, int] = {}
    for table, days in RETENTION_DAYS.items():      # table names come from the constant above, never from a request
        removed[table] = await db.execute(f"delete from {table} where created_at < now() - make_interval(days => %s)", (days,))  # noqa: S608
    return removed


async def safe_prune(db) -> Dict[str, int]:
    try:
        removed = await prune(db)
        if any(removed.values()):
            logger.info("retention removed %s", removed)
        return removed
    except Exception:
        logger.exception("retention could not run; it will try again in a day")
        return {}


async def retention_loop(db, interval_s: float = DAY_SECONDS) -> None:
    """Prune every `interval_s` seconds until cancelled."""
    while True:
        await asyncio.sleep(interval_s)
        await safe_prune(db)
