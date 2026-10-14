"""Token verification, written against PyJWT-signed tokens: the checks hold no matter which library signed them."""
import base64
import json
import time

import jwt as pyjwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from backend.app import security
from backend.app.config import settings
from backend.app.security import AuthError

KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
PRIVATE_PEM = KEY.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
PUBLIC_PEM = KEY.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
PUBLIC_JWK = {**json.loads(pyjwt.algorithms.RSAAlgorithm.to_jwk(KEY.public_key())), "kid": "k1", "alg": "RS256", "use": "sig"}
PROJECT = "demo-proj"


def firebase_token(**over):
    now = int(time.time())
    claims = {"sub": "fbUid1", "aud": PROJECT, "iss": f"https://securetoken.google.com/{PROJECT}", "iat": now, "exp": now + 600,
              "email": "a@b.co", "email_verified": True, **over}
    return pyjwt.encode(claims, PRIVATE_PEM, algorithm="RS256", headers={"kid": "k1"})


@pytest.fixture
def firebase(monkeypatch):
    monkeypatch.setattr(settings, "FIREBASE_PROJECT_ID", PROJECT)
    monkeypatch.setattr(security, "_fb_jwks", {"keys": [PUBLIC_JWK], "fetched": time.time()})


async def test_a_valid_firebase_token_is_accepted(firebase):
    assert (await security.verify_firebase_token(firebase_token()))["sub"] == "fbUid1"


async def test_alg_none_is_rejected(firebase):
    b = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()
    unsigned = f"{b({'alg': 'none', 'typ': 'JWT', 'kid': 'k1'})}.{b({'sub': 'x', 'aud': PROJECT, 'iss': f'https://securetoken.google.com/{PROJECT}'})}."
    with pytest.raises(AuthError):
        await security.verify_firebase_token(unsigned)


async def test_hs256_signed_with_the_public_key_is_rejected(firebase):
    """The classic key-confusion attack: sign with HS256 using the (public) RSA key bytes as the shared secret."""
    now = int(time.time())
    claims = {"sub": "attacker", "aud": PROJECT, "iss": f"https://securetoken.google.com/{PROJECT}", "exp": now + 600}
    forged = pyjwt.encode(claims, PUBLIC_PEM, algorithm="HS256", headers={"kid": "k1"}, ) if _hs_allows(PUBLIC_PEM) else _hand_made_hs256(claims)
    with pytest.raises(AuthError):
        await security.verify_firebase_token(forged)


def _hs_allows(key: bytes) -> bool:
    try:
        pyjwt.encode({"a": 1}, key, algorithm="HS256")
        return True
    except Exception:                                       # recent PyJWT refuses to sign HS256 with a PEM key
        return False


def _hand_made_hs256(claims):
    import hashlib
    import hmac
    b = lambda d: base64.urlsafe_b64encode(d).rstrip(b"=")
    signing = b(json.dumps({"alg": "HS256", "typ": "JWT", "kid": "k1"}).encode()) + b"." + b(json.dumps(claims).encode())
    return (signing + b"." + b(hmac.new(PUBLIC_PEM, signing, hashlib.sha256).digest())).decode()


async def test_wrong_audience_wrong_issuer_and_expired_are_rejected(firebase):
    for bad in (firebase_token(aud="another-project"),
                firebase_token(iss="https://securetoken.google.com/another-project"),
                firebase_token(exp=int(time.time()) - 10)):
        with pytest.raises(AuthError):
            await security.verify_firebase_token(bad)


async def test_missing_subject_and_unknown_key_are_rejected(firebase):
    with pytest.raises(AuthError):
        await security.verify_firebase_token(firebase_token(sub=""))
    unknown = pyjwt.encode({"sub": "x", "aud": PROJECT, "iss": f"https://securetoken.google.com/{PROJECT}", "exp": int(time.time()) + 60},
                           PRIVATE_PEM, algorithm="RS256", headers={"kid": "not-a-known-key"})
    with pytest.raises(AuthError):
        await security.verify_firebase_token(unknown)


async def test_a_token_for_the_wrong_signing_key_is_rejected(firebase):
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = other.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    now = int(time.time())
    forged = pyjwt.encode({"sub": "x", "aud": PROJECT, "iss": f"https://securetoken.google.com/{PROJECT}", "exp": now + 60},
                          pem, algorithm="RS256", headers={"kid": "k1"})
    with pytest.raises(AuthError):
        await security.verify_firebase_token(forged)


SUPABASE = "https://proj.supabase.co"


@pytest.fixture
def supabase(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_URL", SUPABASE)
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", "")
    monkeypatch.setattr(security, "_jwks", {"keys": [PUBLIC_JWK], "fetched": time.time()})


def supabase_token(**over):
    claims = {"sub": "u1", "aud": "authenticated", "iss": f"{SUPABASE}/auth/v1", "exp": int(time.time()) + 300, **over}
    return pyjwt.encode(claims, PRIVATE_PEM, algorithm="RS256", headers={"kid": "k1"})


async def test_supabase_asymmetric_token_is_accepted_and_bad_ones_are_not(supabase):
    assert (await security.verify_supabase_token(supabase_token()))["sub"] == "u1"
    for bad in (supabase_token(aud="anon"), supabase_token(iss="https://evil.example/auth/v1"), supabase_token(exp=int(time.time()) - 10)):
        with pytest.raises(AuthError):
            await security.verify_supabase_token(bad)


async def test_supabase_hs256_is_refused_unless_a_secret_is_configured(supabase):
    hs = pyjwt.encode({"sub": "u1", "aud": "authenticated", "iss": f"{SUPABASE}/auth/v1", "exp": int(time.time()) + 300},
                      "some-shared-secret-of-32-bytes-minimum!!", algorithm="HS256")
    with pytest.raises(AuthError):
        await security.verify_supabase_token(hs)


def test_the_security_module_no_longer_uses_python_jose():
    from pathlib import Path
    source = Path(security.__file__).read_text(encoding="utf-8")
    assert "jose" not in source and "import jwt" in source
