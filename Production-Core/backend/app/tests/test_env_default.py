"""Forgetting ENV must fail safe: the default is production (no API docs, admin privacy threshold on, no dev shortcuts)."""
import pytest

from backend.app.config import Settings


def test_env_defaults_to_production(monkeypatch):
    monkeypatch.delenv("ENV", raising=False)
    s = Settings(_env_file=None)
    assert s.is_production and s.admin_min_group == 5


def test_development_is_an_explicit_opt_in(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    s = Settings(_env_file=None)
    assert not s.is_production and s.admin_min_group == 1


def test_auth_bypass_is_refused_by_the_default(monkeypatch):
    from backend.app import security
    monkeypatch.delenv("ENV", raising=False)
    s = Settings(_env_file=None, AUTH_DISABLED=True)
    monkeypatch.setattr(security, "settings", s)
    assert security._auth_bypass_allowed() is False
