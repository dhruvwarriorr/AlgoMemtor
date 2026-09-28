from __future__ import annotations

import hashlib
import math
import time
from collections import OrderedDict
from typing import Protocol

from openai import AsyncOpenAI

from .settings import AiSettings


class EmbeddingError(RuntimeError):
    pass


class Embedder(Protocol):
    async def embed(self, text: str, *, task_type: str) -> list[float]: ...


def _validate_and_normalize(vector: list[float], dimensions: int) -> list[float]:
    if len(vector) != dimensions:
        raise EmbeddingError("Embedding dimension did not match the 1024-d contract.")
    if not all(
        isinstance(value, (int, float)) and math.isfinite(value) for value in vector
    ):
        raise EmbeddingError("Embedding contained a non-finite value.")
    norm = math.sqrt(sum(float(value) ** 2 for value in vector))
    if norm == 0:
        raise EmbeddingError("Embedding had zero magnitude.")
    return [float(value) / norm for value in vector]


# Recent embeddings, reused within this process. The same question is often
# embedded twice in one coach turn (memory search and knowledge search), and
# the vector for a text never changes for a given model, so a repeat costs
# neither a model call nor its latency. Keys are hashes: no text is kept.
_CACHE_LIMIT = 512
_CACHE_TTL_SECONDS = 3_600
_cache: OrderedDict[str, tuple[float, list[float]]] = OrderedDict()


def _cache_key(model: str, dimensions: int, text: str) -> str:
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return f"{model}:{dimensions}:{digest}"


def _cached(key: str) -> list[float] | None:
    entry = _cache.get(key)
    if entry is None:
        return None
    stored_at, vector = entry
    if time.monotonic() - stored_at > _CACHE_TTL_SECONDS:
        _cache.pop(key, None)
        return None
    _cache.move_to_end(key)
    return list(vector)


def _remember(key: str, vector: list[float]) -> None:
    _cache[key] = (time.monotonic(), list(vector))
    _cache.move_to_end(key)
    while len(_cache) > _CACHE_LIMIT:
        _cache.popitem(last=False)


class OpenRouterEmbedder:
    def __init__(self, settings: AiSettings) -> None:
        headers = {"X-Title": settings.openrouter_app_name}
        if settings.openrouter_app_url:
            headers["HTTP-Referer"] = settings.openrouter_app_url
        self.client = AsyncOpenAI(
            api_key=settings.openrouter_api_key,
            base_url=settings.openrouter_base_url,
            default_headers=headers,
            timeout=settings.embedding_timeout_seconds,
            max_retries=settings.ai_max_retries,
        )
        self.model = settings.ai_embedding_model
        self.dimensions = settings.ai_embedding_dimensions

    async def embed(self, text: str, *, task_type: str) -> list[float]:
        del task_type
        key = _cache_key(self.model, self.dimensions, text)
        cached = _cached(key)
        if cached is not None:
            return cached
        response = await self.client.embeddings.create(
            model=self.model,
            input=text,
            dimensions=self.dimensions,
            encoding_format="float",
        )
        if not response.data:
            raise EmbeddingError("OpenRouter returned no embedding.")
        vector = _validate_and_normalize(response.data[0].embedding, self.dimensions)
        _remember(key, vector)
        return vector


def create_embedder(settings: AiSettings) -> Embedder:
    from .providers import get_provider

    try:
        return get_provider(settings).embedder()
    except RuntimeError as error:
        raise EmbeddingError(str(error)) from error
