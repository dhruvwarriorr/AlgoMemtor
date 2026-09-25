from __future__ import annotations

from typing import Any

import httpx

from .settings import AiSettings


async def ai_health(settings: AiSettings) -> dict[str, Any]:
    chat_available = False
    embedding_available = False
    search_available = False
    if settings.ai_provider == "local":
        try:
            base = settings.local_ai_base_url.removesuffix("/v1").rstrip("/")
            async with httpx.AsyncClient(timeout=2) as client:
                response = await client.get(f"{base}/api/tags")
                response.raise_for_status()
            names = {
                model.get("name")
                for model in response.json().get("models", [])
                if isinstance(model, dict)
            }
            chat_available = settings.local_ai_model in names
        except httpx.HTTPError, ValueError, TypeError:
            chat_available = False
        try:
            from huggingface_hub import scan_cache_dir

            cached = scan_cache_dir().repos
            embedding_available = any(
                repo.repo_id == settings.local_embedding_model for repo in cached
            )
        except OSError, RuntimeError:
            embedding_available = False
    else:
        configured = bool(settings.openrouter_api_key)
        chat_available = configured
        embedding_available = configured
        search_available = configured
    return {
        "provider": settings.ai_provider,
        "chat": {
            "available": chat_available,
            "fast": settings.model_for_role("fast"),
            "strong": settings.model_for_role("strong"),
            "hugeContext": settings.model_for_role("huge_context"),
            "contextTokens": (
                settings.local_ai_context_tokens
                if settings.ai_provider == "local"
                else None
            ),
        },
        "embeddings": {
            "available": embedding_available,
            "model": settings.active_embedding_model,
            "dimensions": settings.active_embedding_dimensions,
            "version": settings.active_embedding_version,
        },
        "webSearch": {
            "available": search_available,
            "provider": settings.ai_web_search_provider,
            "engine": settings.ai_web_search_engine,
        },
    }
