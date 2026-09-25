from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol

import httpx
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_openai import ChatOpenAI

from .settings import AiSettings, ModelRole

if TYPE_CHECKING:
    from .embedding import Embedder
    from .llm import ThinkingLevel


class AIProvider(Protocol):
    name: str

    def chat(
        self,
        *,
        model: str,
        role: ModelRole,
        temperature: float,
        thinking_level: ThinkingLevel,
        max_tokens: int,
        timeout: float,
        max_retries: int,
    ) -> BaseChatModel: ...

    def embedder(self) -> Embedder: ...

    async def web_search(self, payload: dict[str, Any]) -> dict[str, Any] | None: ...


class LocalProvider:
    name = "local"

    def __init__(self, settings: AiSettings) -> None:
        self.settings = settings

    def chat(
        self,
        *,
        model: str,
        role: ModelRole,
        temperature: float,
        thinking_level: ThinkingLevel,
        max_tokens: int,
        timeout: float,
        max_retries: int,
    ) -> BaseChatModel:
        del role
        think = self.settings.local_ai_thinking == "deep" and thinking_level == "high"
        return ChatOpenAI(
            model=model,
            base_url=self.settings.local_ai_base_url,
            api_key="ollama",
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=timeout,
            max_retries=max_retries,
            extra_body={
                "options": {"num_ctx": self.settings.local_ai_context_tokens},
                # Ollama's OpenAI endpoint maps "none" to think=false.
                "reasoning_effort": "high" if think else "none",
            },
        )

    def embedder(self) -> Embedder:
        from .embedding import LocalSentenceTransformerEmbedder

        return LocalSentenceTransformerEmbedder(self.settings)

    async def web_search(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        del payload
        return None


class OpenRouterProvider:
    name = "openrouter"

    def __init__(self, settings: AiSettings) -> None:
        self.settings = settings
        self.headers = {"X-Title": settings.openrouter_app_name}
        if settings.openrouter_app_url:
            self.headers["HTTP-Referer"] = settings.openrouter_app_url

    def chat(
        self,
        *,
        model: str,
        role: ModelRole,
        temperature: float,
        thinking_level: ThinkingLevel,
        max_tokens: int,
        timeout: float,
        max_retries: int,
    ) -> BaseChatModel:
        kwargs: dict[str, object] = {}
        if thinking_level != "none" and role in {"fast", "strong"}:
            kwargs["reasoning_effort"] = thinking_level
        return ChatOpenAI(
            model=model,
            base_url=self.settings.openrouter_base_url,
            api_key=self.settings.openrouter_api_key,
            default_headers=self.headers,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=timeout,
            max_retries=max_retries,
            **kwargs,
        )

    def embedder(self) -> Embedder:
        from .embedding import OpenRouterEmbedder

        if not self.settings.openrouter_api_key:
            raise RuntimeError("OPENROUTER_API_KEY is required in production mode.")
        return OpenRouterEmbedder(self.settings)

    async def web_search(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        if not self.settings.openrouter_api_key:
            return None
        headers = {
            **self.headers,
            "Authorization": f"Bearer {self.settings.openrouter_api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(
            timeout=self.settings.web_search_timeout_seconds,
            headers=headers,
        ) as client:
            response = await client.post(
                f"{self.settings.openrouter_base_url.rstrip('/')}/chat/completions",
                json=payload,
            )
            response.raise_for_status()
        body = response.json()
        return body if isinstance(body, dict) else None


def get_provider(settings: AiSettings) -> AIProvider:
    if settings.ai_provider == "local":
        return LocalProvider(settings)
    return OpenRouterProvider(settings)


async def keep_local_model_warm(settings: AiSettings) -> None:
    """Keep the local chat model loaded; Ollama's OpenAI endpoint cannot."""
    import asyncio

    if settings.ai_provider != "local" or settings.local_ai_keep_alive_minutes == 0:
        return
    url = settings.local_ai_base_url.rstrip("/").removesuffix("/v1") + "/api/generate"
    payload = {
        "model": settings.local_ai_model,
        "keep_alive": f"{settings.local_ai_keep_alive_minutes}m",
        "options": {"num_ctx": settings.local_ai_context_tokens},
    }
    while True:
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                await client.post(url, json=payload)
        except httpx.HTTPError:
            pass
        # Every OpenAI-endpoint request resets the unload timer to Ollama's
        # 5-minute default, so refresh the longer keep-alive regularly.
        await asyncio.sleep(240)
