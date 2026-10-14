"""The per-address rate limits (account check, public share view) must not be bypassable with a forged X-Forwarded-For.
The images set FORWARDED_ALLOW_IPS; this test reads that value from the Dockerfiles and runs uvicorn's own middleware with it."""
import asyncio
import re
from pathlib import Path

import pytest
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

BACKEND = Path(__file__).resolve().parents[2]
DOCKERFILES = [BACKEND / "Dockerfile", BACKEND / "Dockerfile.server"]


def allowed_ips(path: Path) -> str:
    m = re.search(r'^ENV FORWARDED_ALLOW_IPS="([^"]*)"', path.read_text(encoding="utf-8"), re.M)
    assert m, f"{path.name} must set FORWARDED_ALLOW_IPS"
    return m.group(1)


def client_seen_by_app(trusted: str, peer: str, forwarded_for: str) -> str:
    seen = {}

    async def app(scope, receive, send):
        seen["client"] = scope["client"][0]

    mw = ProxyHeadersMiddleware(app, trusted_hosts=trusted)
    scope = {"type": "http", "client": (peer, 5000), "headers": [(b"x-forwarded-for", forwarded_for.encode())]}
    asyncio.run(mw(scope, None, None))
    return seen["client"]


@pytest.mark.parametrize("path", DOCKERFILES, ids=lambda p: p.name)
def test_images_do_not_trust_every_proxy_header(path):
    assert allowed_ips(path).strip() != "*"


@pytest.mark.parametrize("path", DOCKERFILES, ids=lambda p: p.name)
def test_a_forged_leftmost_address_is_ignored_behind_the_hosts_proxy(path):
    trusted = allowed_ips(path)
    # client -> the host's proxy (appends the real client) -> this container; the client forged the first entry
    assert client_seen_by_app(trusted, peer="10.1.2.3", forwarded_for="6.6.6.6, 203.0.113.9") == "203.0.113.9"


@pytest.mark.parametrize("path", DOCKERFILES, ids=lambda p: p.name)
def test_headers_from_a_direct_public_connection_are_ignored(path):
    trusted = allowed_ips(path)
    assert client_seen_by_app(trusted, peer="198.51.100.7", forwarded_for="6.6.6.6") == "198.51.100.7"
