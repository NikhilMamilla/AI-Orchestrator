# Build context is Production-Core/ (so the image contains backend/ and data/).
FROM python:3.11-slim

WORKDIR /app
ENV PYTHONPATH=/app PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

# CPU-only torch keeps the image small (~200MB vs ~2GB with CUDA wheels).
RUN pip install --extra-index-url https://download.pytorch.org/whl/cpu torch
COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt

COPY backend backend
COPY data data

# Run as an unprivileged user.
RUN useradd -m app && chown -R app /app
USER app

# Behind the host's reverse proxy (HF Spaces, Render, ...) the TCP peer is the proxy: trust its X-Forwarded-For so
# per-client rate limits (account check, public share view) see real client addresses. Only expose this image behind
# such a proxy; set FORWARDED_ALLOW_IPS to the proxy's address if your host publishes it.
ENV FORWARDED_ALLOW_IPS="*"
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/api/v1/health')"
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
