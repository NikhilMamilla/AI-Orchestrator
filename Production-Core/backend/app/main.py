from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from backend.app.api.v1 import admin, auth, sessions, concepts, websocket, agents, dashboard, code, rag, learning, share
from backend.app.config import settings
from backend.app.security import get_current_user
from backend.app.services.database import DatabaseUnavailable, db
from backend.app.utils.logger import logger


class SecurityHeaders(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        resp = await call_next(request)
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("Referrer-Policy", "no-referrer")
        resp.headers.setdefault("Cache-Control", "no-store")
        return resp


MAX_BODY_BYTES = 1_000_000              # every JSON route; the document upload has its own, larger cap
MAX_UPLOAD_BODY_BYTES = 3_000_000      # the upload route accepts files up to 2 MB plus multipart overhead


class BodySizeLimit(BaseHTTPMiddleware):
    """Refuse a request whose declared body is too large before FastAPI parses it."""

    async def dispatch(self, request, call_next):
        try:
            size = int(request.headers.get("content-length") or 0)
        except ValueError:
            size = 0
        limit = MAX_UPLOAD_BODY_BYTES if request.url.path.endswith("/rag/documents") else MAX_BODY_BYTES
        if size > limit:
            return JSONResponse(status_code=413, content={"detail": "Request body too large."})
        return await call_next(request)


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=None if settings.is_production else f"{settings.API_V1_STR}/openapi.json",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
)

app.add_middleware(SecurityHeaders)
app.add_middleware(BodySizeLimit)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,          # explicit origins only; never "*" with credentials
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

P = settings.API_V1_STR
protected = [Depends(get_current_user)]
app.include_router(auth.router, prefix=f"{P}/auth", tags=["auth"])
app.include_router(rag.router, prefix=f"{P}/rag", tags=["rag"])             # per-route auth/admin deps
app.include_router(learning.router, prefix=f"{P}/learning", tags=["learning"])      # per-route auth
app.include_router(admin.router, prefix=f"{P}/admin", tags=["admin"])                 # every route requires an admin
app.include_router(share.router, prefix=f"{P}/share", tags=["share"])      # owner routes authenticate; /view/{token} is public
app.include_router(sessions.router, prefix=f"{P}/sessions", tags=["sessions"], dependencies=protected)
app.include_router(concepts.router, prefix=f"{P}/concepts", tags=["concepts"], dependencies=protected)
app.include_router(agents.router, prefix=f"{P}/agents", tags=["agents"], dependencies=protected)
app.include_router(dashboard.router, prefix=f"{P}/dashboard", tags=["dashboard"], dependencies=protected)
app.include_router(code.router, prefix=f"{P}/code", tags=["code"], dependencies=protected)
app.include_router(websocket.router, prefix=f"{P}/ws", tags=["WebSocket"])  # authenticates on first message


@app.exception_handler(DatabaseUnavailable)
async def database_unavailable(_: Request, exc: DatabaseUnavailable):
    return JSONResponse(status_code=503, content={"detail": "The database is unavailable. Please try again shortly."})


@app.on_event("startup")
async def startup_event():
    if settings.AUTH_DISABLED and settings.is_production:
        raise RuntimeError("AUTH_DISABLED must not be set in production")
    if settings.is_production and not settings.APP_SECRET:
        logger.warning("APP_SECRET is not set: verification codes, the account-lookup hash and the export salt fall back to "
                       "weaker derived values. Set a long random APP_SECRET (see .env.example).")
    if settings.AUTH_DISABLED:
        logger.warning("AUTH_DISABLED is on: every request is treated as 'dev-user' (development only)")
    if not settings.AUTH_DISABLED and not settings.SUPABASE_URL and not settings.FIREBASE_PROJECT_ID:
        logger.error("SUPABASE_URL is not set: token verification is impossible, so authenticated routes will return 401")
    await db.connect_to_database()
    from backend.app.services import rag_service
    rag_service.warm_up()                                  # models load in the background; pages that only read the store never wait


@app.on_event("shutdown")
async def shutdown_event():
    await db.close_database_connection()


@app.get("/")
async def root():
    return {"message": "Kiddoo API is live"}


@app.get(f"{P}/health")
async def health_check():
    return {"status": "ok", "service": "backend"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=True)
