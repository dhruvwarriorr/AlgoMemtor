from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from langchain_core.language_models.chat_models import BaseChatModel

from .providers import get_provider
from .settings import AiSettings, ModelRole

ThinkingLevel = Literal["none", "low", "medium", "high"]
Workload = Literal[
    "ranking",
    "memory_generation",
    "upsolve_picker",
    "reports",
    "simple_coach",
    "doubt_helper",
    "solution_explorer",
    "deep_coach",
    "code_debugging",
    "algorithm_derivation",
    "correctness_reasoning",
    "contest_analysis",
]

# Work where reasoning or coding quality changes the answer goes to the
# strong model; everything else (ranking, memory extraction, classification,
# short summaries, simple Coach turns) is structured work for the fast one.
STRONG_WORKLOADS: frozenset[Workload] = frozenset(
    {
        "doubt_helper",
        "solution_explorer",
        "deep_coach",
        "code_debugging",
        "algorithm_derivation",
        "correctness_reasoning",
        "contest_analysis",
    }
)


@dataclass(frozen=True)
class ModelRoute:
    provider: Literal["openrouter"]
    role: ModelRole
    model: str
    workload: Workload


def route_model(settings: AiSettings, workload: Workload) -> ModelRoute:
    role: ModelRole = "strong" if workload in STRONG_WORKLOADS else "fast"
    return ModelRoute(
        provider=settings.ai_provider,
        role=role,
        model=settings.model_for_role(role),
        workload=workload,
    )


def chat_model(
    settings: AiSettings,
    *,
    workload: Workload,
    temperature: float,
    thinking_level: ThinkingLevel,
    max_tokens: int,
    timeout: float,
    max_retries: int,
    force_role: ModelRole | None = None,
) -> BaseChatModel:
    role = force_role or route_model(settings, workload).role
    return get_provider(settings).chat(
        model=settings.model_for_role(role),
        role=role,
        temperature=temperature,
        thinking_level=thinking_level,
        max_tokens=max_tokens,
        timeout=timeout,
        max_retries=max_retries,
    )


def generation_model(
    settings: AiSettings,
    *,
    workload: Workload,
    temperature: float,
    max_tokens: int,
    timeout: float,
    max_retries: int,
) -> BaseChatModel:
    return chat_model(
        settings,
        workload=workload,
        temperature=temperature,
        thinking_level="low",
        max_tokens=max_tokens,
        timeout=timeout,
        max_retries=max_retries,
    )
