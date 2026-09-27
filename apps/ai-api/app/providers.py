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


# Reasoning tokens allowed per thinking level (OpenRouter `reasoning`).
REASONING_TOKENS: dict[str, int] = {
    "none": 0,
    "low": 1_024,
    "medium": 2_048,
    "high": 4_096,
}


FAST_MINIMUM_REASONING_TOKENS = 1_024


def reasoning_budget(settings: AiSettings, thinking_level: str) -> int:
    if not settings.ai_reasoning_enabled:
        return 0
    return REASONING_TOKENS.get(thinking_level, 0)


def reasoning_config(budget: int) -> dict[str, object]:
    if budget == 0:
        return {"enabled": False}
    # The reasoning itself is not needed in the reply.
    return {"max_tokens": budget, "exclude": True}


def provider_routing(settings: AiSettings, role: ModelRole) -> dict[str, object]:
    return {
        # Strong-model hosts must honour every parameter sent (tools, response
        # format, reasoning); some silently dropped structured output. No
        # GPT-OSS host declares all of them, so the fast model is not filtered.
        "require_parameters": role == "strong",
        "sort": settings.ai_provider_sort,
        "max_price": {
            "prompt": float(settings.ai_max_input_price_per_million_usd),
            "completion": float(settings.ai_max_output_price_per_million_usd),
        },
    }


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
        # Hidden reasoning counts against max_tokens. With only an effort
        # level, DeepSeek can spend the whole budget thinking and return an
        # empty answer, so reasoning gets its own capped budget on top of
        # the answer's.
        budget = reasoning_budget(self.settings, thinking_level)
        reasoning = reasoning_config(budget)
        if budget == 0 and role == "fast":
            # GPT-OSS cannot turn reasoning off ("reasoning is mandatory"); it
            # reasons at the lowest effort, with headroom so it cannot eat the
            # answer's budget.
            budget = FAST_MINIMUM_REASONING_TOKENS
            reasoning = {"effort": "low", "exclude": True}
        return ChatOpenAI(
            model=model,
            base_url=self.settings.openrouter_base_url,
            api_key=self.settings.openrouter_api_key,
            default_headers=self.headers,
            temperature=temperature,
            max_tokens=max_tokens + budget,
            timeout=timeout,
            max_retries=max_retries,
            extra_body={
                "reasoning": reasoning,
                "provider": provider_routing(self.settings, role),
            },
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
    return OpenRouterProvider(settings)
