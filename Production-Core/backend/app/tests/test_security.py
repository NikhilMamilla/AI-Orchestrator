import time

import pytest
from fastapi import HTTPException
from jose import jwt

from backend.app import security
from backend.app.config import settings
from backend.app.security import AuthError, RateLimiter, verify_supabase_token

URL = "https://proj.supabase.co"


def _token(secret="s3cret", **over):
    claims = {"sub": "u1", "aud": "authenticated", "iss": f"{URL}/auth/v1",
              "exp": int(time.time()) + 300, **over}
    return jwt.encode(claims, secret, algorithm="HS256")


@pytest.fixture
def hs256(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_URL", URL)
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", "s3cret")


def test_rate_limiter_blocks_then_recovers():
    rl = RateLimiter(limit=3, window=0.2)
    for _ in range(3):
        rl.check("u")
    with pytest.raises(HTTPException) as e:
        rl.check("u")
    assert e.value.status_code == 429 and "Retry-After" in e.value.headers
    rl.check("other")
    time.sleep(0.25)
    rl.check("u")


async def test_valid_token_accepted(hs256):
    assert (await verify_supabase_token(_token()))["sub"] == "u1"


@pytest.mark.parametrize("make", [
    lambda: _token(secret="wrong"),                       # bad signature
    lambda: _token(exp=int(time.time()) - 10),            # expired
    lambda: _token(aud="anon"),                           # wrong audience
    lambda: _token(iss="https://evil.example/auth/v1"),   # wrong issuer
    lambda: _token(sub=""),                               # no subject
    lambda: "",
    lambda: "a.b.c",
])
async def test_bad_tokens_rejected(hs256, make):
    with pytest.raises(AuthError):
        await verify_supabase_token(make())


async def test_alg_none_and_unknown_algs_rejected(hs256):
    import base64, json
    b = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()
    none_tok = f"{b({'alg': 'none', 'typ': 'JWT'})}.{b({'sub': 'x', 'aud': 'authenticated'})}."
    with pytest.raises(AuthError, match="algorithm"):
        await verify_supabase_token(none_tok)


async def test_hs256_refused_when_no_secret_configured(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_URL", URL)
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", "")
    with pytest.raises(AuthError, match="algorithm"):      # cannot be tricked into HS256 with a public key
        await verify_supabase_token(_token())


async def test_auth_not_configured_fails_closed(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_URL", "")
    with pytest.raises(AuthError):
        await verify_supabase_token("x.y.z")


def test_auth_bypass_never_allowed_in_production(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_DISABLED", True)
    monkeypatch.setattr(settings, "ENV", "production")
    assert security._auth_bypass_allowed() is False
    monkeypatch.setattr(settings, "ENV", "development")
    assert security._auth_bypass_allowed() is True


def test_admin_rules(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_EMAILS", "boss@x.com")
    assert security.User(uid="1", email="boss@x.com").is_admin
    assert security.User(uid="1", email="x@y.com", role="admin").is_admin
    assert not security.User(uid="2", email="eve@x.com").is_admin


async def test_forged_kid_cannot_force_a_jwks_refetch_storm(monkeypatch):
    import time
    from backend.app import security
    calls = []

    class R:
        def raise_for_status(self): pass
        def json(self): return {"keys": [{"kid": "real"}]}

    class C:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        async def get(self, url):
            calls.append(url)
            return R()
    monkeypatch.setattr(security.httpx, "AsyncClient", C)
    monkeypatch.setattr(security.settings, "SUPABASE_URL", "https://x.supabase.co")
    security._jwks.update(keys=[], fetched=0.0)
    await security._get_keys()
    for _ in range(5):
        await security._get_keys(force=True)
    assert len(calls) == 1
    security._jwks["fetched"] = time.time() - security.JWKS_MIN_REFETCH - 1
    await security._get_keys(force=True)
    assert len(calls) == 2


def test_every_api_module_imports_and_key_routes_are_registered():
    """A syntax or import error in any router must fail the suite, not only the running server."""
    from backend.app.main import app
    paths = set(app.openapi()["paths"])                  # includes every included router
    for needed in ("/api/v1/rag/ask", "/api/v1/learning/quiz", "/api/v1/learning/plan", "/api/v1/learning/diagnostic/next",
                   "/api/v1/learning/challenges", "/api/v1/learning/journal", "/api/v1/share/view/{token}",
                   "/api/v1/rag/admin/gaps", "/api/v1/code/run/"):
        assert needed in paths, needed


def test_startup_event_runs_without_legacy_settings(monkeypatch):
    """The startup hook once referenced a removed setting and crashed the real server; run it for real."""
    import asyncio
    from backend.app import main

    async def no_db():
        return None
    monkeypatch.setattr(main.db, "connect_to_database", no_db)
    asyncio.run(main.startup_event())


# ---------------------------------------------------------------- Firebase Auth
import time as _time

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwk as _jwk

from backend.app import security as _sec

_FB_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_FB_PEM = _FB_KEY.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
_FB_PUB = _jwk.construct(_FB_KEY.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo), "RS256").to_dict()


def _fb_token(project="demo-proj", kid="k1", **over):
    now = int(_time.time())
    claims = {"sub": "fbUid123", "aud": project, "iss": f"https://securetoken.google.com/{project}", "iat": now, "exp": now + 600,
              "email": "a@b.co", "email_verified": True, **over}
    return jwt.encode(claims, _FB_PEM, algorithm="RS256", headers={"kid": kid})


@pytest.fixture
def firebase(monkeypatch):
    monkeypatch.setattr(settings, "FIREBASE_PROJECT_ID", "demo-proj")
    monkeypatch.setattr(_sec, "_fb_jwks", {"keys": [{**_FB_PUB, "kid": "k1"}], "fetched": _time.time()})


@pytest.mark.asyncio
async def test_firebase_token_accepted_and_uid_mapped_to_a_stable_uuid(firebase):
    user = await _sec._user_from_token(_fb_token())
    assert user.uid == _sec.firebase_uid_to_uuid("fbUid123") == (await _sec._user_from_token(_fb_token())).uid
    assert len(user.uid) == 36 and user["firebase_uid"] == "fbUid123"


@pytest.mark.asyncio
async def test_firebase_wrong_project_expired_or_unknown_key_rejected(firebase):
    for bad in (_fb_token(project="other"), _fb_token(exp=int(_time.time()) - 10), _fb_token(kid="nope")):
        with pytest.raises(AuthError):
            await _sec.verify_firebase_token(bad)


@pytest.mark.asyncio
async def test_firebase_admin_needs_a_verified_email(firebase, monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_EMAILS", "a@b.co")
    assert (await _sec._user_from_token(_fb_token())).is_admin
    assert not (await _sec._user_from_token(_fb_token(email_verified=False))).is_admin


def test_account_registry_hashes_emails_and_checks_case_insensitively():
    from backend.app.api.v1.auth import email_key
    assert email_key("Kid@Example.com ") == email_key("kid@example.com")
    assert "kid" not in email_key("kid@example.com") and len(email_key("a@b.co")) == 64


def test_account_check_validates_and_rate_limits(client, monkeypatch):
    from backend.app.api.v1 import auth
    monkeypatch.setattr(auth.db, "pool", None)
    monkeypatch.setattr(auth, "check_limiter", auth.RateLimiter(2))
    assert client.post("/api/v1/auth/account-check", json={"email": "not-an-email"}).status_code == 422
    assert client.post("/api/v1/auth/account-check", json={"email": "a@b.co"}).json() == {"exists": None, "password": None}
    client.post("/api/v1/auth/account-check", json={"email": "a@b.co"})
    assert client.post("/api/v1/auth/account-check", json={"email": "a@b.co"}).status_code == 429
