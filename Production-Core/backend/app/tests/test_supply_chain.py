"""Reproducible installs and CI checks: every direct dependency is pinned, and CI lints, audits and caches on all requirement files."""
import re
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
REPO = BACKEND.parents[1]


def requirement_lines(name):
    for line in (BACKEND / name).read_text(encoding="utf-8").splitlines():
        line = line.split("#")[0].strip()
        if line and not line.startswith("-r"):
            yield line


def test_every_direct_python_dependency_is_pinned_to_an_exact_version():
    for name in ("requirements-server.txt", "requirements.txt", "requirements-dev.txt"):
        lines = list(requirement_lines(name))
        assert lines, name
        loose = [l for l in lines if not re.search(r"==\d", l)]
        assert loose == [], f"{name}: {loose}"


def test_python_jose_is_only_a_test_dependency():
    assert not any("jose" in l.lower() for l in requirement_lines("requirements-server.txt"))
    assert any("jose" in l.lower() for l in requirement_lines("requirements-dev.txt"))


def test_backend_ci_lints_audits_and_caches_on_every_requirements_file():
    ci = (REPO / ".github" / "workflows" / "ci-backend.yml").read_text(encoding="utf-8")
    assert "ruff check" in ci and "E9,F63,F7,F82" in ci                       # errors only: syntax errors, undefined names
    assert "pip-audit" in ci and "requirements-server.txt" in ci
    assert "requirements-dev.txt" in ci.split("cache-dependency-path")[1].split("steps:")[0] if "cache-dependency-path" in ci else False


def test_frontend_ci_reports_production_dependency_advisories():
    ci = (REPO / ".github" / "workflows" / "ci-frontend.yml").read_text(encoding="utf-8")
    assert "npm audit --omit=dev" in ci
