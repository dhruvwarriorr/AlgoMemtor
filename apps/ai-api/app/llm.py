from typing import Literal

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq

from .settings import AiSettings, LlmProvider

ThinkingLevel = Literal["low", "medium", "high"]


def chat_model(
    settings: AiSettings,
    *,
    provider: LlmProvider,
    model: str,
    temperature: float,
    thinking_level: ThinkingLevel,
    max_tokens: int,
    timeout: float,
    max_retries: int,
) -> BaseChatModel:
    """A text-generation model from the configured provider.

    Embeddings and Google-Search grounding are Gemini-only and do not use this.
    """
    if provider == "groq":
        return ChatGroq(
            model=model,
            api_key=settings.groq_api_key,
            temperature=temperature,
            # Reasoning stays out of the answer text and tool arguments.
            reasoning_format="parsed",
            reasoning_effort=thinking_level,
            max_tokens=min(max_tokens, settings.groq_max_completion_tokens),
            timeout=timeout,
            max_retries=max_retries,
        )
    return ChatGoogleGenerativeAI(
        model=model,
        api_key=settings.llm_api_key,
        temperature=temperature,
        thinking_level=thinking_level,
        max_tokens=max_tokens,
        timeout=timeout,
        max_retries=max_retries,
    )


def generation_model(
    settings: AiSettings,
    *,
    temperature: float,
    max_tokens: int,
    timeout: float,
    max_retries: int,
) -> BaseChatModel:
    """Ranking, memory, and roadmap-note calls: LLM_PROVIDER / LLM_MODEL."""
    return chat_model(
        settings,
        provider=settings.llm_provider,
        model=settings.llm_model,
        temperature=temperature,
        thinking_level="low",
        max_tokens=max_tokens,
        timeout=timeout,
        max_retries=max_retries,
    )
