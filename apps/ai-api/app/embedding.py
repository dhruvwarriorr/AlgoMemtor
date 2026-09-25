from __future__ import annotations

import asyncio
import math
import threading
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


# Loaded models are shared by every embedder in the process. Embedders are
# created per request, and loading the weights again each time costs seconds.
_loaded_models: dict[str, object] = {}
_load_lock = threading.Lock()


def _load_sentence_transformer(model_name: str) -> object:
    with _load_lock:
        model = _loaded_models.get(model_name)
        if model is None:
            from sentence_transformers import SentenceTransformer

            model = SentenceTransformer(model_name, trust_remote_code=True)
            _loaded_models[model_name] = model
        return model


def preload_local_embedding_model(settings: AiSettings) -> None:
    """Start loading the local embedding model in the background at startup.

    The first load takes seconds; without this the first question after a
    restart pays it and memory retrieval misses its budget. A daemon thread
    never holds up shutdown, and a failed preload simply retries on first use.
    """
    if settings.ai_provider != "local":
        return

    def load() -> None:
        try:
            _load_sentence_transformer(settings.local_embedding_model)
        except Exception:  # noqa: BLE001 - retried on first use
            return

    threading.Thread(target=load, name="embedding-preload", daemon=True).start()


class LocalSentenceTransformerEmbedder:
    def __init__(self, settings: AiSettings) -> None:
        self.model_name = settings.local_embedding_model
        self.dimensions = settings.local_embedding_dimensions

    async def _get_model(self) -> object:
        model = _loaded_models.get(self.model_name)
        if model is not None:
            return model
        return await asyncio.to_thread(_load_sentence_transformer, self.model_name)

    async def embed(self, text: str, *, task_type: str) -> list[float]:
        model = await self._get_model()
        prompt_name = "query" if task_type in {"retrieval_query", "query"} else None

        def encode() -> list[float]:
            kwargs: dict[str, object] = {
                "normalize_embeddings": True,
                "convert_to_numpy": True,
            }
            if prompt_name:
                prompts = getattr(model, "prompts", {}) or {}
                if prompt_name in prompts:
                    kwargs["prompt_name"] = prompt_name
            result = model.encode(text, **kwargs)  # type: ignore[attr-defined]
            return [float(value) for value in result.tolist()]

        vector = await asyncio.to_thread(encode)
        return _validate_and_normalize(vector, self.dimensions)


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
