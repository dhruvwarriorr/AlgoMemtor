from __future__ import annotations

import math
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
        response = await self.client.embeddings.create(
            model=self.model,
            input=text,
            dimensions=self.dimensions,
            encoding_format="float",
        )
        if not response.data:
            raise EmbeddingError("OpenRouter returned no embedding.")
        return _validate_and_normalize(response.data[0].embedding, self.dimensions)


def create_embedder(settings: AiSettings) -> Embedder:
    from .providers import get_provider

    try:
        return get_provider(settings).embedder()
    except RuntimeError as error:
        raise EmbeddingError(str(error)) from error
