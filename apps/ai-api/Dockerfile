# syntax=docker/dockerfile:1.7
# Build from the repository root:
#   docker build -f apps/ai-api/Dockerfile -t algomemtor-ai .
# Default command serves FastAPI; `alembic upgrade head` runs the AI-schema
# migrations with the same image.

FROM ghcr.io/astral-sh/uv:0.12 AS uv

FROM python:3.14-slim-bookworm AS runtime
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PYTHONUNBUFFERED=1 \
    PATH=/app/.venv/bin:$PATH
WORKDIR /app
COPY apps/ai-api/pyproject.toml apps/ai-api/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY apps/ai-api/alembic.ini ./
COPY apps/ai-api/alembic ./alembic
COPY apps/ai-api/app ./app
RUN uv sync --frozen --no-dev \
    && useradd --system --uid 10001 --home /app algomemtor \
    && chown -R algomemtor /app
USER algomemtor
ENV PORT=8000
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import os,urllib.request;urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/health',timeout=4)"
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
