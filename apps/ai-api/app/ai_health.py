from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx
import sqlalchemy as sa

from .database import shared_engine
from .settings import AiSettings

_cached_at = 0.0
_cached_result: dict[str, Any] | None = None
_cache_lock = asyncio.Lock()


async def _provider_ready(settings: AiSettings) -> bool:
    if not settings.openrouter_api_key:
        return False
    headers = {"Authorization": f"Bearer {settings.openrouter_api_key}"}
    try:
        async with httpx.AsyncClient(
            timeout=settings.health_probe_timeout_seconds,
            headers=headers,
        ) as client:
            response = await client.get(
                f"{settings.openrouter_base_url.rstrip('/')}/auth/key"
            )
        return response.status_code == 200
    except httpx.HTTPError, TimeoutError:
        return False


async def _database_ready(settings: AiSettings) -> bool:
    if not settings.database_url:
        return False
    try:
        async with asyncio.timeout(settings.health_probe_timeout_seconds):
            async with shared_engine(settings.database_url).connect() as connection:
                return (await connection.scalar(sa.text("SELECT 1"))) == 1
    except OSError, RuntimeError, TimeoutError, sa.exc.SQLAlchemyError:
        return False


async def _fresh_health(settings: AiSettings) -> dict[str, Any]:
    provider_ready, database_ready = await asyncio.gather(
        _provider_ready(settings),
        _database_ready(settings),
    )
    configured = bool(settings.openrouter_api_key and settings.database_url)
    ready = configured and provider_ready and database_ready
    return {
        "ready": ready,
        "provider": settings.ai_provider,
        "chat": {
            "available": provider_ready,
            "fast": settings.model_for_role("fast"),
            "strong": settings.model_for_role("strong"),
        },
        "embeddings": {
            "available": provider_ready,
            "model": settings.active_embedding_model,
            "dimensions": settings.active_embedding_dimensions,
            "version": settings.active_embedding_version,
        },
        "database": {"available": database_ready},
        "webSearch": {
            "available": provider_ready,
            "provider": settings.ai_web_search_provider,
            "engine": settings.ai_web_search_engine,
        },
    }


async def ai_health(settings: AiSettings) -> dict[str, Any]:
    global _cached_at, _cached_result
    now = time.monotonic()
    if _cached_result is not None and now - _cached_at <= settings.health_cache_seconds:
        return _cached_result
    async with _cache_lock:
        now = time.monotonic()
        if (
            _cached_result is not None
            and now - _cached_at <= settings.health_cache_seconds
        ):
            return _cached_result
        result = await _fresh_health(settings)
        _cached_result = result
        _cached_at = time.monotonic()
        return result
