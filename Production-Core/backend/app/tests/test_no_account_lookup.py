"""Nothing may reveal whether an email has an account: the lookup endpoints are gone and nothing stores an email hash."""
import pytest

from backend.app.config import settings


@pytest.mark.parametrize("path", ["/api/v1/auth/account-check", "/api/v1/auth/seen"])
def test_the_account_lookup_endpoints_do_not_exist(client, path):
    assert client.post(path, json={"email": "a@b.co"}).status_code in (404, 405)


def test_auth_health_is_still_there(client):
    assert client.get("/api/v1/auth/health").status_code == 200


def test_no_code_path_stores_or_reads_an_email_hash():
    from pathlib import Path
    root = Path(__file__).resolve().parents[1]
    offenders = [str(p.relative_to(root)) for p in root.rglob("*.py")
                 if "tests" not in p.parts and ("email_hash" in p.read_text(encoding="utf-8") or "account-check" in p.read_text(encoding="utf-8"))]
    assert offenders == []
