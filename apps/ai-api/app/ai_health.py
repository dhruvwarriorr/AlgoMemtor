from __future__ import annotations

from typing import Any

from .settings import AiSettings


async def ai_health(settings: AiSettings) -> dict[str, Any]:
    configured = bool(settings.openrouter_api_key)
    return {
        "provider": settings.ai_provider,
        "chat": {
            "available": configured,
            "fast": settings.model_for_role("fast"),
            "strong": settings.model_for_role("strong"),
        },
        "embeddings": {
            "available": configured,
            "model": settings.active_embedding_model,
            "dimensions": settings.active_embedding_dimensions,
            "version": settings.active_embedding_version,
        },
        "webSearch": {
            "available": configured,
            "provider": settings.ai_web_search_provider,
            "engine": settings.ai_web_search_engine,
        },
    }
