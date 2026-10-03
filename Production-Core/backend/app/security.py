"""Authentication, authorization and rate limiting.

Sign-in is Firebase Auth when FIREBASE_PROJECT_ID is set (the app's data stays in Supabase Postgres). Firebase ID
tokens are verified here: RS256 only, signature against Google's published keys (cached, refreshed on an unknown
`kid`), audience = the project id, issuer = https://securetoken.google.com/<project id>, expiry and subject. The
Firebase uid is mapped to a stable UUID (uuid5), so the Postgres `user_id uuid` columns stay as they are.

Without FIREBASE_PROJECT_ID, Supabase Auth JWTs are accepted instead. We verify them server-side: signature,
issuer (`<SUPABASE_URL>/auth/v1`), audience (`authenticated`), expiry and subject.
Two signing modes are supported:
  * asymmetric (ES256/RS256) - current Supabase default; public keys come from the project's JWKS
    endpoint and are cached (with refresh on unknown `kid`, i.e. key rotation);
  * legacy HS256 - only if SUPABASE_JWT_SECRET is configured.
The algorithm is chosen from an allow-list per mode, never taken blindly from the token, which
blocks `alg=none` and HS256-with-public-key confusion attacks.
"""
from __future__ import annotations

import time
import uuid
from collections import defaultdict, deque
from typing import Deque, Dict, Optional

import httpx
from fastapi import Depends, HTTPException, Request, WebSocket, status
from jose import JWTError, jwt

from backend.app.config import settings

_jwks: Dict = {"keys": [], "fetched": 0.0}
JWKS_TTL = 3600
JWKS_MIN_REFETCH = 60            # a forged `kid` must not turn every request into an outbound call
ASYMMETRIC = {"ES256", "RS256"}


class AuthError(Exception):
    pass


# ---------------------------------------------------------------- Firebase Auth
FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
_fb_jwks: Dict = {"keys": [], "fetched": 0.0}
# a fixed namespace: the same Firebase uid always maps to the same database UUID
FIREBASE_UID_NAMESPACE = uuid.UUID("6f2b1c1e-6b9a-4e7d-9a51-4b1d6c0f9e21")


def firebase_uid_to_uuid(firebase_uid: str) -> str:
    return str(uuid.uuid5(FIREBASE_UID_NAMESPACE, f"firebase:{firebase_uid}"))


async def _get_firebase_keys(force: bool = False) -> list:
    age = time.time() - _fb_jwks["fetched"]
    if (force and age > JWKS_MIN_REFETCH) or not _fb_jwks["keys"] or age > JWKS_TTL:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(FIREBASE_JWKS_URL)
            r.raise_for_status()
            _fb_jwks["keys"], _fb_jwks["fetched"] = r.json().get("keys", []), time.time()
    return _fb_jwks["keys"]


async def verify_firebase_token(token: str) -> Dict:
    project = settings.FIREBASE_PROJECT_ID
    if not project:
        raise AuthError("server auth is not configured")
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as e:
        raise AuthError("malformed token") from e
    if header.get("alg") != "RS256":                          # Firebase signs with RS256 only
        raise AuthError("unexpected token algorithm")
    kid = header.get("kid")
    try:
        key = next((k for k in await _get_firebase_keys() if k.get("kid") == kid), None)
        if key is None:                                       # key rotation
            key = next((k for k in await _get_firebase_keys(force=True) if k.get("kid") == kid), None)
    except httpx.HTTPError as e:
        raise AuthError("could not fetch signing keys") from e
    if key is None:
        raise AuthError("unknown signing key")
    try:
        claims = jwt.decode(token, key, algorithms=["RS256"], audience=project,
                            issuer=f"https://securetoken.google.com/{project}", options={"verify_at_hash": False})
    except JWTError as e:
        raise AuthError("invalid or expired token") from e
    if not claims.get("sub"):
        raise AuthError("token has no subject")
    return claims


async def _get_keys(force: bool = False) -> list:
    age = time.time() - _jwks["fetched"]
    if (force and age > JWKS_MIN_REFETCH) or not _jwks["keys"] or age > JWKS_TTL:
        url = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(url)
            r.raise_for_status()
            _jwks["keys"], _jwks["fetched"] = r.json().get("keys", []), time.time()
    return _jwks["keys"]


async def verify_supabase_token(token: str) -> Dict:
    if not settings.SUPABASE_URL:
        raise AuthError("server auth is not configured")
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as e:
        raise AuthError("malformed token") from e
    alg = header.get("alg")
    if alg == "HS256" and settings.SUPABASE_JWT_SECRET:
        key, algs = settings.SUPABASE_JWT_SECRET, ["HS256"]
    elif alg in ASYMMETRIC:
        kid = header.get("kid")
        try:
            key = next((k for k in await _get_keys() if k.get("kid") == kid), None)
            if key is None:                                   # key rotation
                key = next((k for k in await _get_keys(force=True) if k.get("kid") == kid), None)
        except httpx.HTTPError as e:
            raise AuthError("could not fetch signing keys") from e
        if key is None:
            raise AuthError("unknown signing key")
        algs = [alg]
    else:
        raise AuthError("unexpected token algorithm")
    try:
        claims = jwt.decode(token, key, algorithms=algs, audience="authenticated",
                            issuer=f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1")
    except JWTError as e:
        raise AuthError("invalid or expired token") from e
    if not claims.get("sub"):
        raise AuthError("token has no subject")
    return claims


class User(dict):
    @property
    def uid(self) -> str:
        return self["uid"]

    @property
    def is_admin(self) -> bool:
        if self.get("role") == "admin":                        # app_metadata is writable only server-side
            return True
        if self.get("firebase_uid") and not self.get("email_verified"):
            return False                                       # an admin email counts only once its owner has proved it
        return bool(self.get("email")) and self["email"].lower() in settings.admin_emails


def _dev_user() -> User:
    return User(uid="00000000-0000-0000-0000-000000000000", email="dev@localhost", dev=True)


def _auth_bypass_allowed() -> bool:
    return settings.AUTH_DISABLED and not settings.is_production


async def _user_from_token(token: Optional[str]) -> User:
    if _auth_bypass_allowed():
        return _dev_user()
    if not token:
        raise AuthError("missing credentials")
    if settings.FIREBASE_PROJECT_ID:
        claims = await verify_firebase_token(token)
        return User(uid=firebase_uid_to_uuid(claims["sub"]), email=claims.get("email"),
                    email_verified=bool(claims.get("email_verified")), firebase_uid=claims["sub"])
    claims = await verify_supabase_token(token)
    return User(uid=claims["sub"], email=claims.get("email"),
                role=(claims.get("app_metadata") or {}).get("role"))


async def get_current_user(request: Request) -> User:
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else None
    try:
        return await _user_from_token(token)
    except AuthError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e), headers={"WWW-Authenticate": "Bearer"})


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin and not user.get("dev"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin access required")
    return user


async def authenticate_websocket(websocket: WebSocket) -> User:
    """Browsers cannot set headers on WebSockets, so the token is sent as the first message
    ({"type":"auth","token":...}) rather than in the URL, where it would end up in logs."""
    import json
    if _auth_bypass_allowed():
        return _dev_user()
    try:
        raw = await websocket.receive_text()
        msg = json.loads(raw)
        if msg.get("type") != "auth":
            raise AuthError("first message must be auth")
        return await _user_from_token(msg.get("token"))
    except (AuthError, ValueError) as e:
        await websocket.close(code=4401, reason=str(e)[:100])
        raise AuthError(str(e))


class RateLimiter:
    """Sliding-window limiter keyed by user id (falls back to client IP)."""

    def __init__(self, limit: int, window: float = 60.0):
        self.limit, self.window = limit, window
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        q = self._hits[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.limit:
            retry = int(self.window - (now - q[0])) + 1
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "rate limit exceeded",
                                headers={"Retry-After": str(retry)})
        q.append(now)
        if len(self._hits) > 10_000:                          # bound memory
            for k in [k for k, v in self._hits.items() if not v][:5000]:
                self._hits.pop(k, None)


ask_limiter = RateLimiter(settings.RAG_RATE_LIMIT_PER_MIN)
upload_limiter = RateLimiter(5)
