"""The Redis agent message queue had a publisher and no consumer, so it is gone. The app needs no Redis at all."""
import importlib.util
import inspect
from pathlib import Path

from backend.app.agents.orchestrator.agent import OrchestratorAgent
from backend.app.config import Settings

BACKEND = Path(__file__).resolve().parents[2]
PRODUCTION = BACKEND.parent


def test_the_message_queue_module_is_gone():
    assert importlib.util.find_spec("backend.app.services.message_queue") is None


def test_the_orchestrator_takes_no_message_queue():
    assert "message_queue" not in inspect.signature(OrchestratorAgent.__init__).parameters


def test_nothing_in_the_app_mentions_redis():
    app = BACKEND / "app"
    offenders = [str(p.relative_to(app)) for p in app.rglob("*.py")
                 if "tests" not in p.parts and "redis" in p.read_text(encoding="utf-8").lower()]
    assert offenders == []


def test_no_redis_setting_requirement_or_compose_service():
    assert "REDIS_URL" not in Settings.model_fields
    assert "redis" not in (BACKEND / "requirements-server.txt").read_text(encoding="utf-8").lower()
    assert "redis" not in (PRODUCTION / "infrastructure" / "docker-compose.yml").read_text(encoding="utf-8").lower()
    assert "REDIS_URL" not in (PRODUCTION / ".env.example").read_text(encoding="utf-8")
