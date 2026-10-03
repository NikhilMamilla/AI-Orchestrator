"""Supabase Postgres access (psycopg3 *sync* pool, called from worker threads).

Why not psycopg's async pool: it cannot run on the Windows default (Proactor) event loop, and uvicorn
does not guarantee another loop policy. A sync pool + `asyncio.to_thread` behaves identically on every
platform and keeps the event loop free.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional, Sequence

from fastapi import HTTPException
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from backend.app.config import settings

logger = logging.getLogger(__name__)


class DatabaseUnavailable(RuntimeError):
    """No database is configured or reachable; the API answers 503 (see main.py)."""


class Database:
    def __init__(self) -> None:
        self.pool: Optional[ConnectionPool] = None

    async def connect_to_database(self) -> None:
        if not settings.DATABASE_URL:
            logger.warning("DATABASE_URL not set: profile, session and dashboard features are disabled")
            return

        def open_pool() -> ConnectionPool:
            # prepare_threshold=None: the Supabase pooler (pgbouncer) does not support prepared statements
            pool = ConnectionPool(settings.DATABASE_URL, min_size=1, max_size=5, open=False,
                                  kwargs={"row_factory": dict_row, "prepare_threshold": None})
            pool.open(wait=True, timeout=20)
            return pool

        self.pool = await asyncio.to_thread(open_pool)
        logger.info("Connected to Postgres")

    async def close_database_connection(self) -> None:
        if self.pool:
            await asyncio.to_thread(self.pool.close)

    def _pool(self) -> ConnectionPool:
        if self.pool is None:
            raise DatabaseUnavailable("database is not configured")
        return self.pool

    def _fetch_all(self, sql: str, params: Sequence[Any]) -> list[dict]:
        with self._pool().connection() as c:
            return c.execute(sql, params).fetchall()

    def _fetch_one(self, sql: str, params: Sequence[Any]) -> Optional[dict]:
        with self._pool().connection() as c:
            return c.execute(sql, params).fetchone()

    def _execute(self, sql: str, params: Sequence[Any]) -> int:
        with self._pool().connection() as c:
            return c.execute(sql, params).rowcount

    def _execute_many(self, statements: Sequence[tuple[str, Sequence[Any]]]) -> int:
        with self._pool().connection() as c, c.transaction():          # all or nothing
            return sum(c.execute(sql, params).rowcount for sql, params in statements)

    async def fetch_all(self, sql: str, params: Sequence[Any] = ()) -> list[dict]:
        return await asyncio.to_thread(self._fetch_all, sql, params)

    async def fetch_one(self, sql: str, params: Sequence[Any] = ()) -> Optional[dict]:
        return await asyncio.to_thread(self._fetch_one, sql, params)

    async def execute(self, sql: str, params: Sequence[Any] = ()) -> int:
        return await asyncio.to_thread(self._execute, sql, params)

    async def execute_many(self, statements: Sequence[tuple[str, Sequence[Any]]]) -> int:
        """Run several statements in one transaction: either every one applies or none does."""
        return await asyncio.to_thread(self._execute_many, statements)


db = Database()
json_param = Jsonb


def get_database() -> Database:
    if db.pool is None:
        raise HTTPException(503, "Database is not configured")
    return db
