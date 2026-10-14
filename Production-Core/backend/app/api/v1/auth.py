"""Auth-related routes: a health check only.

Sign-in is Firebase's. The server deliberately offers no way to ask whether an email has an account (there is no lookup
endpoint and no stored email hash): "Forgot password" always sends the Firebase reset email and shows one neutral message.
"""
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check():
    return {"status": "ok"}
