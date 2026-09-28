from __future__ import annotations

from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from .settings import get_ai_settings


def async_database_url(database_url: str) -> str:
    """Accept the plain URL Supabase shows and select the async psycopg driver."""
    for prefix in ("postgresql://", "postgres://"):
        if database_url.startswith(prefix):
            return "postgresql+psycopg://" + database_url.removeprefix(prefix)
    return database_url


@lru_cache
def shared_engine(database_url: str) -> AsyncEngine:
    """One small connection pool per process for every AI repository.

    Each serverless instance holds its own pool, so the pool stays small to
    fit the Supabase pooler's client limit. Server-side prepared statements
    are disabled because the Supabase transaction pooler (Supavisor, port
    6543) does not support them.
    """
    settings = get_ai_settings()
    return create_async_engine(
        async_database_url(database_url),
        pool_pre_ping=True,
        pool_size=settings.database_pool_size,
        max_overflow=settings.database_max_overflow,
        pool_timeout=settings.database_pool_timeout_seconds,
        pool_recycle=300,
        connect_args={
            "prepare_threshold": None,
            "connect_timeout": settings.database_connect_timeout_seconds,
        },
    )
