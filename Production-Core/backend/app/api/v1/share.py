"""Student-controlled sharing for teachers and parents (PRD Features 12 and 13).

The student creates a read-only link. Only a SHA-256 hash of the token is stored, links expire (30 days by default)
and can be revoked at any time. The public view contains progress numbers and the Analyst's alerts with suggested
talking points, and nothing the learner typed: no answers, questions or free text.
"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from backend.app.api.v1.learning import service
from backend.app.learning.service import LearningService
from backend.app.security import RateLimiter, User, get_current_user
from backend.app.services.database import Database, get_database

router = APIRouter()
public_limiter = RateLimiter(30)             # per client address: the view is unauthenticated
create_limiter = RateLimiter(10)
DEFAULT_DAYS = 30


class ShareRequest(BaseModel):
    label: str = Field(default="", max_length=60)                   # e.g. "Ms. Rao"
    days: int = Field(default=DEFAULT_DAYS, ge=1, le=90)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@router.post("/")
async def create_share(req: ShareRequest, user: User = Depends(get_current_user), db: Database = Depends(get_database)):
    create_limiter.check(user.uid)
    token = secrets.token_urlsafe(32)                                # 256 bits: not guessable
    expires = datetime.now(timezone.utc) + timedelta(days=req.days)
    row = await db.fetch_one(
        "insert into progress_shares(user_id, token_hash, label, expires_at) values (%s,%s,%s,%s) returning id::text",
        (user.uid, _hash(token), req.label.strip(), expires))
    return {"id": row["id"], "token": token, "expires_at": expires.isoformat(),       # the plain token is shown only now
            "path": f"/shared/{token}"}


@router.get("/")
async def list_shares(user: User = Depends(get_current_user), db: Database = Depends(get_database)):
    rows = await db.fetch_all(
        "select id::text, label, created_at, expires_at, last_viewed_at, views from progress_shares "
        "where user_id = %s and revoked_at is null and expires_at > now() order by created_at desc", (user.uid,))
    return [{**r, "created_at": r["created_at"].isoformat(), "expires_at": r["expires_at"].isoformat(),
             "last_viewed_at": r["last_viewed_at"].isoformat() if r["last_viewed_at"] else None} for r in rows]


@router.delete("/{share_id}")
async def revoke_share(share_id: str, user: User = Depends(get_current_user), db: Database = Depends(get_database)):
    try:
        n = await db.execute("update progress_shares set revoked_at = now() where id = %s and user_id = %s and revoked_at is null",
                             (share_id, user.uid))
    except Exception:
        n = 0
    if n != 1:
        raise HTTPException(404, "Share link not found")
    return {"ok": True}


@router.get("/view/{token}")
async def view_share(token: str, request: Request, db: Database = Depends(get_database),
                     svc: LearningService = Depends(service)):
    """Public read-only summary. Unknown, expired and revoked links are indistinguishable (one generic 404)."""
    public_limiter.check(request.client.host if request.client else "unknown")
    if not (20 <= len(token) <= 80):
        raise HTTPException(404, "This link is not valid")
    row: Optional[dict] = await db.fetch_one(
        "update progress_shares set views = views + 1, last_viewed_at = now() "
        "where token_hash = %s and revoked_at is null and expires_at > now() returning user_id::text, label, expires_at",
        (_hash(token),))
    if not row:
        raise HTTPException(404, "This link is not valid")
    summary = await svc.shared_summary(row["user_id"])
    return {**summary, "shared_with": row["label"], "link_expires_at": row["expires_at"].isoformat()}
