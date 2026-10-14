"""Supabase Postgres access (psycopg3 *sync* pool, called from worker threads).

Why not psycopg's async pool: it cannot run on the Windows default (Proactor) event loop, and uvicorn
does not guarantee another loop policy. A sync pool + `asyncio.to_thread` behaves identically on every
platform and keeps the event loop free.
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
from typing import Any, Optional, Sequence

from fastapi import HTTPException
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from backend.app.config import settings

logger = logging.getLogger(__name__)


def pool_options() -> dict:
    """A free host sleeps, and its pooled connections die with it: have the pool test a connection before handing it out
    (psycopg_pool 3.2 and later), so the first request after a quiet spell does not fail on a dead one."""
    check = getattr(ConnectionPool, "check_connection", None)
    return {"check": check} if check is not None else {}


class DatabaseUnavailable(RuntimeError):
    """No database is configured or reachable; the API answers 503 (see main.py)."""


class Database:
    def __init__(self) -> None:
        self.pool: Optional[ConnectionPool] = None
        self.lock_pool: Optional[ConnectionPool] = None   # only for advisory locks, so a held lock can never starve the main pool

    async def connect_to_database(self) -> None:
        if not settings.DATABASE_URL:
            logger.warning("DATABASE_URL not set: profile, session and dashboard features are disabled")
            return

        def open_pool() -> ConnectionPool:
            # prepare_threshold=None: the Supabase pooler (pgbouncer) does not support prepared statements
            pool = ConnectionPool(settings.DATABASE_URL, min_size=1, max_size=5, open=False,
                                  kwargs={"row_factory": dict_row, "prepare_threshold": None}, **pool_options())
            pool.open(wait=True, timeout=20)
            return pool

        self.pool = await asyncio.to_thread(open_pool)

        def open_lock_pool() -> ConnectionPool:
            pool = ConnectionPool(settings.DATABASE_URL, min_size=0, max_size=3, open=False,
                                  kwargs={"row_factory": dict_row, "prepare_threshold": None}, **pool_options())
            pool.open(wait=False)
            return pool

        self.lock_pool = await asyncio.to_thread(open_lock_pool)
        logger.info("Connected to Postgres")

    async def close_database_connection(self) -> None:
        if self.lock_pool:
            await asyncio.to_thread(self.lock_pool.close)
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

    @contextlib.asynccontextmanager
    async def advisory_lock(self, key: str):
        """Hold a Postgres transaction-level advisory lock on `key` for the block. Every process that takes the same key
        waits its turn, so a read-modify-write of one learner's profile cannot be interleaved by another worker. It is a
        transaction lock, so it also works behind a transaction pooler, and it is released even if the block fails.
        Without a database (tests, offline development) there is nothing to lock across processes."""
        pool = self.lock_pool
        if pool is None:
            yield
            return
        conn = await asyncio.to_thread(pool.getconn)
        try:
            await asyncio.to_thread(conn.execute, "select pg_advisory_xact_lock(hashtextextended(%s, 0))", (key,))
            yield
        finally:
            await asyncio.shield(asyncio.to_thread(self._release_lock, pool, conn))

    @staticmethod
    def _release_lock(pool: ConnectionPool, conn: Any) -> None:
        try:
            conn.rollback()                                 # ends the transaction, which releases the lock
        finally:
            pool.putconn(conn)

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
