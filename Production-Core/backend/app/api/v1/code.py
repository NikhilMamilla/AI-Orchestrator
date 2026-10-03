"""
Code execution API: proxy to Judge0 CE (free public instance, or any self-hosted Judge0).

The public Piston instance became whitelist-only on 2026-02-15, so Judge0 CE is used instead. It returns
real wall time and memory, and its status ids are what the frontend already understands
(3 Accepted, 5 Time Limit, 6 Compilation Error, 7-12 Runtime Error).
"""
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.app.api.v1.code_languages import LANGUAGES
from backend.app.config import settings
from backend.app.security import RateLimiter, User, get_current_user
from backend.app.services.database import db, get_database

logger = logging.getLogger(__name__)
router = APIRouter()
run_limiter = RateLimiter(30)

class RunCodeRequest(BaseModel):
    source_code: str = Field(min_length=1, max_length=50_000)
    language: str = Field(max_length=32)
    stdin: Optional[str] = Field(default="", max_length=10_000)


class RunCodeResponse(BaseModel):
    stdout: Optional[str] = None
    stderr: Optional[str] = None
    compile_output: Optional[str] = None
    status: str
    status_id: int                      # Judge0 status id (3 = accepted)
    time: Optional[str] = None
    memory: Optional[int] = None


@router.get("/languages/")
async def get_languages():
    """Supported languages with their editor metadata."""
    return [{"key": k, "id": v["id"], "name": v["name"], "monaco": v["monaco"], "template": v["template"]}
            for k, v in LANGUAGES.items()]


def _judge0_headers() -> dict:
    headers = {"Content-Type": "application/json"}
    if "rapidapi" in settings.JUDGE0_API_URL and settings.JUDGE0_API_KEY:
        headers["X-RapidAPI-Key"] = settings.JUDGE0_API_KEY
        headers["X-RapidAPI-Host"] = settings.JUDGE0_API_URL.split("//")[-1].split("/")[0]
    return headers


@router.post("/run/")
async def run_code(request: RunCodeRequest, user: User = Depends(get_current_user)):
    """Run code in the Judge0 sandbox. Only values the engine returns are reported."""
    run_limiter.check(user.uid)
    lang = LANGUAGES.get(request.language)
    if not lang:
        raise HTTPException(status_code=400, detail="Unsupported language")
    payload = {"language_id": lang["id"], "source_code": request.source_code, "stdin": request.stdin or "",
               "cpu_time_limit": 5, "wall_time_limit": 10}
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            r = await client.post(f"{settings.JUDGE0_API_URL.rstrip('/')}/submissions",
                                  params={"base64_encoded": "false", "wait": "true"},
                                  json=payload, headers=_judge0_headers())
            if r.status_code == 429:
                raise HTTPException(status_code=429, detail="The code runner is busy. Try again in a few seconds.")
            r.raise_for_status()
            result = r.json()
    except HTTPException:
        raise
    except httpx.HTTPStatusError as e:
        logger.warning("code runner returned %s", e.response.status_code)
        raise HTTPException(status_code=502, detail="The code execution service rejected the request")
    except httpx.HTTPError:
        raise HTTPException(status_code=503, detail="The code execution service is unreachable")

    status = result.get("status") or {}
    output = RunCodeResponse(
        stdout=result.get("stdout"), stderr=result.get("stderr") or result.get("message"),
        compile_output=result.get("compile_output"), status=status.get("description", "Unknown"),
        status_id=int(status.get("id", 13)),
        time=result.get("time"), memory=result.get("memory"))      # engine-reported, or null

    try:
        await db.execute(
            "insert into code_submissions(user_id, language, source_code, stdin, stdout, stderr, status, status_id) "
            "values (%s,%s,%s,%s,%s,%s,%s,%s)",
            (user.uid, request.language, request.source_code, request.stdin,
             (output.stdout or "")[:20000], (output.stderr or "")[:20000], output.status, output.status_id))
    except Exception:       # saving history must never fail the run itself
        logger.warning("could not persist code submission", exc_info=True)
    return output


@router.get("/submissions/")
async def get_submissions(limit: int = 20, user: User = Depends(get_current_user)):
    """The caller's own recent submissions."""
    rows = await get_database().fetch_all(
        "select id, language, source_code, stdin, stdout, stderr, status, status_id, created_at "
        "from code_submissions where user_id = %s order by created_at desc limit %s",
        (user.uid, max(1, min(limit, 100))))
    return [{**r, "_id": str(r["id"])} for r in rows]
