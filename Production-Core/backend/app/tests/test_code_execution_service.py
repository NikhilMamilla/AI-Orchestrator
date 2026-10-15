"""The legacy agent code runner: an unknown language is an error (never silently Python), RapidAPI headers go only to RapidAPI,
and settings are read without the deprecated .dict()."""
import asyncio
import inspect

import httpx
import pytest

from backend.app.config import settings
from backend.app.services import code_execution
from backend.app.services.code_execution import CodeExecutionService


def run(coro):
    return asyncio.run(coro)


@pytest.fixture
def captured(monkeypatch):
    seen = {}

    def handler(request: httpx.Request):
        seen["url"], seen["headers"], seen["json"] = str(request.url), dict(request.headers), request.content
        return httpx.Response(201, json={"stdout": "ok\n", "stderr": None, "status": {"description": "Accepted"}, "time": "0.01", "memory": 100})

    real = httpx.AsyncClient
    monkeypatch.setattr(code_execution.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    return seen


def test_an_unknown_language_raises_instead_of_running_python(captured):
    with pytest.raises(ValueError, match="Unsupported language"):
        run(CodeExecutionService().execute_code("print(1)", language="cobol"))
    assert captured == {}                                                    # nothing was sent anywhere


def test_known_languages_still_run(captured):
    r = run(CodeExecutionService().execute_code("print('ok')", language="python"))
    assert r["status"] == "Accepted" and r["stdout"] == "ok\n"


def test_rapidapi_headers_are_sent_only_to_rapidapi(captured, monkeypatch):
    monkeypatch.setattr(settings, "JUDGE0_API_KEY", "secret-key")
    monkeypatch.setattr(settings, "JUDGE0_API_URL", "https://ce.judge0.com")
    run(CodeExecutionService().execute_code("print(1)"))
    assert not any(h.lower().startswith("x-rapidapi") for h in captured["headers"])     # the key never goes to a public instance
    monkeypatch.setattr(settings, "JUDGE0_API_URL", "https://judge0-ce.p.rapidapi.com")
    run(CodeExecutionService().execute_code("print(1)"))
    assert captured["headers"]["x-rapidapi-key"] == "secret-key" and "x-rapidapi-host" in captured["headers"]


def test_settings_are_read_without_the_deprecated_dict():
    assert ".dict()" not in inspect.getsource(code_execution)
