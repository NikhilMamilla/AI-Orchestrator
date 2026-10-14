"""After a free host sleeps, pooled connections are dead; every pool must test a connection before handing it out."""
import asyncio

from backend.app.services import database


class FakePool:
    created = []

    def __init__(self, conninfo, **kw):
        self.kw = kw
        FakePool.created.append(self)

    @staticmethod
    def check_connection(conn):
        return None

    def open(self, **_kw):
        return None

    def close(self):
        return None


def test_every_database_pool_checks_connections_before_use(monkeypatch):
    FakePool.created = []
    monkeypatch.setattr(database, "ConnectionPool", FakePool)
    monkeypatch.setattr(database.settings, "DATABASE_URL", "postgresql://x")
    asyncio.run(database.Database().connect_to_database())
    assert len(FakePool.created) == 2                                   # the main pool and the advisory-lock pool
    assert all(p.kw.get("check") is FakePool.check_connection for p in FakePool.created)


def test_pool_options_are_empty_when_the_library_has_no_connection_check(monkeypatch):
    class Old:
        pass
    monkeypatch.setattr(database, "ConnectionPool", Old)
    assert database.pool_options() == {}
