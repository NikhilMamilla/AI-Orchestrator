# Full image with the three models baked in (needs ~1.5 GB RAM); used by infrastructure/docker-compose.yml.
# Small hosts use backend/Dockerfile.server instead. Build context is Production-Core/ (so the image contains backend/ and data/).
FROM python:3.11-slim

WORKDIR /app
ENV PYTHONPATH=/app PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

# CPU-only torch keeps the image small (~200MB vs ~2GB with CUDA wheels).
RUN pip install --extra-index-url https://download.pytorch.org/whl/cpu torch
COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt

COPY backend backend
COPY data data

# The three models are part of the image, so a (re)started container never downloads them: it answers sooner after waking.
ENV HF_HOME=/app/.hf-cache
RUN python -c "from sentence_transformers import SentenceTransformer, CrossEncoder; SentenceTransformer('BAAI/bge-small-en-v1.5'); CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2'); CrossEncoder('cross-encoder/nli-deberta-v3-xsmall')"

# Run as an unprivileged user.
RUN useradd -m app && chown -R app /app
USER app

# Behind the host's reverse proxy (HF Spaces, Render, ...) the TCP peer is the proxy: trust its X-Forwarded-For so
# per-client rate limits (account check, public share view) see real client addresses. Only proxies on private
# addresses are trusted, and uvicorn then reads X-Forwarded-For from the right, so a value the client forged in front of
# it is ignored ("*" would trust the left-most entry, which the client controls). If your host's proxy connects from a
# public address, set FORWARDED_ALLOW_IPS to that address or range (see docs/SETUP.md).
ENV FORWARDED_ALLOW_IPS="127.0.0.1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/api/v1/health')"
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
