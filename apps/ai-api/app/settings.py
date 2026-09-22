from decimal import Decimal
from functools import lru_cache
from typing import Literal

from pydantic import Field, ValidationInfo, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class AiSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str | None = None
    internal_service_token: str = ""
    llm_api_key: str = ""
    llm_model: str = "gemini-3.5-flash"
    llm_timeout_seconds: float = Field(default=90, gt=0, le=120)
    ai_audit_timeout_seconds: float = Field(default=0.5, gt=0, le=5)
    llm_max_output_tokens: int = Field(default=4096, gt=0, le=8192)
    coach_thinking_level: Literal["low", "medium", "high"] = "high"
    llm_input_price_per_million_usd: Decimal = Field(default=Decimal("1.50"), ge=0)
    llm_output_price_per_million_usd: Decimal = Field(default=Decimal("9.00"), ge=0)
    llm_pricing_version: str = "gemini-3.5-flash-standard-2026-09"
    ai_ranking_version: str = "ai-gemini-rag-v2"
    coach_version: str = "coach-gemini-rag-v2"
    embedding_model: str = "gemini-embedding-001"
    embedding_dimensions: int = Field(default=768, ge=256, le=3072)
    embedding_timeout_seconds: float = Field(default=4, gt=0, le=30)
    memory_generation_version: str = "memory-gemini-v1"
    memory_prompt_version: str = "memory-prompt-v1"
    consent_policy_version: str = "personalized-coaching-rag-v2"
    memory_min_confidence: float = Field(default=0.75, ge=0, le=1)
    memory_proposed_min_confidence: float = Field(default=0.50, ge=0, le=1)
    memory_min_evidence_strength: float = Field(default=0.75, ge=0, le=1)
    memory_similarity_threshold: float = Field(default=0.75, ge=0, le=1)
    memory_retrieval_limit: int = Field(default=15, ge=1, le=20)
    memory_audit_timeout_seconds: float = Field(default=0.5, gt=0, le=5)
    memory_generation_enabled: bool = True
    memory_rag_enabled: bool = True
    coach_knowledge_rag_enabled: bool = True
    coach_web_grounding_enabled: bool = True
    coach_web_grounding_timeout_seconds: float = Field(default=20, ge=10, le=60)
    internal_rate_limit_per_minute: int = Field(default=120, ge=10, le=2_000)

    @field_validator(
        "llm_model",
        "llm_pricing_version",
        "ai_ranking_version",
        "coach_version",
        "embedding_model",
        "memory_generation_version",
        "consent_policy_version",
        mode="before",
    )
    @classmethod
    def use_versioned_default_when_blank(
        cls, value: object, info: ValidationInfo
    ) -> object:
        if not isinstance(value, str) or value.strip():
            return value
        defaults = {
            "llm_model": "gemini-3.5-flash",
            "llm_pricing_version": "gemini-3.5-flash-standard-2026-09",
            "ai_ranking_version": "ai-gemini-rag-v2",
            "coach_version": "coach-gemini-rag-v2",
            "embedding_model": "gemini-embedding-001",
            "memory_generation_version": "memory-gemini-v1",
            "consent_policy_version": "personalized-coaching-rag-v2",
        }
        return defaults[info.field_name]


@lru_cache
def get_ai_settings() -> AiSettings:
    return AiSettings()
