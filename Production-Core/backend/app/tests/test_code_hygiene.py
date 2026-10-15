"""Request paths log instead of printing, use timezone-aware time and the modern start-up hook, and warnings are not blanket-hidden."""
import re
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
PRODUCTION = APP.parents[1]
REQUEST_CODE = [p for sub in ("api", "services", "agents", "admin", "models") for p in (APP / sub).rglob("*.py")]


def test_request_paths_do_not_print_or_dump_tracebacks():
    offenders = [f"{p.relative_to(APP)}:{i}" for p in REQUEST_CODE for i, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1)
                 if re.search(r"(?<![\w.\"'])print\(|traceback\.print_exc", line) and "Hello from" not in line]
    assert offenders == []


def test_no_naive_utc_datetimes():
    offenders = [str(p.relative_to(APP)) for p in APP.rglob("*.py") if "tests" not in p.parts and "utcnow" in p.read_text(encoding="utf-8")]
    assert offenders == []


def test_the_app_uses_a_lifespan_not_the_deprecated_on_event_hooks():
    src = (APP / "main.py").read_text(encoding="utf-8")
    assert "on_event" not in src and "lifespan" in src


def test_the_app_still_starts_and_stops_through_the_lifespan(monkeypatch):
    from fastapi.testclient import TestClient
    from backend.app import main
    calls = []

    async def connect():
        calls.append("connect")

    async def close():
        calls.append("close")
    monkeypatch.setattr(main.db, "connect_to_database", connect)
    monkeypatch.setattr(main.db, "close_database_connection", close)
    with TestClient(main.app):
        assert calls == ["connect"]
    assert calls == ["connect", "close"]


def test_pytest_does_not_hide_every_deprecation_warning():
    ini = (PRODUCTION / "pytest.ini").read_text(encoding="utf-8")
    assert not re.search(r"^\s*ignore::DeprecationWarning\s*$", ini, re.M)
