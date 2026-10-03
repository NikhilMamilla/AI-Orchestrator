"""Health, plus the account registry behind "Forgot password".

Firebase's email-enumeration protection (on by default) never says whether an email has an account, so the app keeps
its own record: on sign-in the client calls /auth/seen, and the server stores a keyed hash of the verified token's email
(never the email itself) with the sign-in methods. /auth/account-check answers "is there an account, and how does it
sign in?" for the reset form, rate-limited per client address so it cannot be used to sweep a list of emails.
"""
import hashlib
import hmac
import json
from typing import List, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from backend.app.config import settings
from backend.app.security import RateLimiter, User, get_current_user
from backend.app.services.database import db
from backend.app.services.student_profile_service import StudentProfileService

router = APIRouter()
check_limiter = RateLimiter(5)                       # per client address, per minute
PROVIDERS = {"password", "google.com"}


def email_key(email: str) -> str:
    return hmac.new(settings.verify_secret.encode(), email.strip().lower().encode(), hashlib.sha256).hexdigest()


@router.get("/health")
async def health_check():
    return {"status": "ok"}


class Seen(BaseModel):
    providers: List[Literal["password", "google.com"]] = Field(default_factory=list, max_length=4)


@router.post("/seen")
async def account_seen(req: Seen, user: User = Depends(get_current_user)):
    """Called after sign-in: records that this (token-verified) email has an account, and how it signs in."""
    email = user.get("email")
    if not email or db.pool is None:
        return {"ok": False}
    await StudentProfileService(db).create_profile_safe(user.uid)
    record = {"email_hash": email_key(email), "providers": sorted(set(req.providers) & PROVIDERS)}
    await db.execute("update student_profiles set data = jsonb_set(data, '{patterns,account}', %s::jsonb, true), "
                     "updated_at = now() where user_id = %s", (json.dumps(record), user.uid))
    return {"ok": True}


class AccountCheck(BaseModel):
    email: str = Field(min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@router.post("/account-check")
async def account_check(req: AccountCheck, request: Request):
    """For "Forgot password": whether this email has a Kiddoo account, and whether it can use a password."""
    check_limiter.check(f"ip:{request.client.host if request.client else 'unknown'}")
    if db.pool is None:
        return {"exists": None, "password": None}                   # unknown: the client sends the reset anyway
    row = await db.fetch_one("select data->'patterns'->'account'->'providers' as providers from student_profiles "
                             "where data->'patterns'->'account'->>'email_hash' = %s limit 1", (email_key(req.email),))
    if not row:
        return {"exists": False, "password": False}
    providers = row["providers"] or []
    return {"exists": True, "password": "password" in providers, "google": "google.com" in providers}
