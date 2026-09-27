from decimal import Decimal
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

AiProvider = Literal["openrouter"]
ModelRole = Literal["fast", "strong"]


class AiSettings(BaseSettings):
    """AI runtime configuration. Every environment calls OpenRouter.

    Two chat models with clearly different jobs and one embedding model:
    `fast` (GPT-OSS-20B) for cheap structured work, `strong` (DeepSeek V4
    Flash) for reasoning, code and long context, and Qwen3 Embedding 8B for
    memory and knowledge retrieval.
    """

    model_config = SettingsConfigDict(
        env_file=".env", extra="ignore", populate_by_name=True
    )

    app_environment: Literal["development", "test", "production"] = Field(
        default="development", validation_alias="APP_ENV"
    )
    ai_provider: AiProvider = "openrouter"
    database_url: str | None = None
    # Connections per process. Serverless instances each hold their own
    # pool, so the defaults stay small for Neon's free compute.
    database_pool_size: int = Field(default=2, ge=1, le=20)
    database_max_overflow: int = Field(default=1, ge=0, le=20)
    internal_service_token: str = ""
    core_api_url: str = ""

    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_app_name: str = "AlgoMemtor"
    openrouter_app_url: str = ""
    ai_fast_model: str = "openai/gpt-oss-20b"
    # Also the long-context model: it accepts over a million tokens.
    ai_strong_model: str = "deepseek/deepseek-v4-flash-0731"
    ai_embedding_model: str = "qwen/qwen3-embedding-8b"
    ai_embedding_dimensions: int = Field(default=1_024, ge=1_024, le=1_024)
    ai_embedding_version: str = "qwen3-embedding-8b-1024-v1"
    ai_web_search_provider: Literal["openrouter"] = "openrouter"
    ai_web_search_engine: Literal["parallel"] = "parallel"
    ai_web_search_model: str = "openai/gpt-oss-20b"

    ai_request_timeout_seconds: float = Field(default=110, gt=0, le=900)
    ai_max_retries: int = Field(default=2, ge=0, le=4)
    ai_model_escalation_enabled: bool = True
    ai_model_escalation_max_attempts: int = Field(default=1, ge=0, le=1)
    ai_audit_timeout_seconds: float = Field(default=0.5, gt=0, le=5)
    ai_budget_tracking_enabled: bool = True
    ai_monthly_soft_budget_usd: Decimal = Field(default=Decimal("5.00"), ge=0)
    ai_budget_warning_percent: int = Field(default=80, ge=1, le=100)

    ranking_max_output_tokens: int = Field(default=2_048, ge=512, le=8_192)
    memory_max_output_tokens: int = Field(default=2_048, ge=512, le=8_192)
    upsolve_max_output_tokens: int = Field(default=2_048, ge=512, le=8_192)
    report_max_output_tokens: int = Field(default=4_096, ge=1_024, le=16_384)
    coach_max_output_tokens: int = Field(default=4_096, ge=2_048, le=32_768)
    doubt_helper_max_output_tokens: int = Field(default=8_192, ge=2_048, le=32_768)
    solution_max_output_tokens: int = Field(default=16_384, ge=4_096, le=65_536)
    mentor_max_output_tokens: int = Field(default=16_384, ge=2_048, le=65_536)
    coach_thinking_level: Literal["low", "medium", "high"] = "high"
    mentor_thinking_level: Literal["low", "medium", "high"] = "low"
    solution_thinking_level: Literal["low", "medium", "high"] = "medium"
    coach_model_requests_per_minute: int = Field(default=0, ge=0, le=10_000)
    coach_response_timeout_seconds: float = Field(default=140, gt=0, le=900)
    coach_agent_enabled: bool = True
    # One call over prefetched workspace data instead of the tool agent:
    # cheaper, at some cost in answer quality.
    coach_single_call: bool = False
    coach_agent_max_steps: int = Field(default=4, ge=1, le=12)
    coach_agent_timeout_seconds: float = Field(default=75, gt=0, le=240)
    coach_live_refresh_timeout_seconds: float = Field(default=30, gt=0, le=60)
    mentor_timeout_seconds: float = Field(default=110, gt=0, le=900)

    # Configurable list-price defaults for request cost observability.
    ai_fast_input_price_per_million_usd: Decimal = Field(default=Decimal("0.018"), ge=0)
    ai_fast_output_price_per_million_usd: Decimal = Field(default=Decimal("0.09"), ge=0)
    ai_strong_input_price_per_million_usd: Decimal = Field(
        default=Decimal("0.021"), ge=0
    )
    ai_strong_output_price_per_million_usd: Decimal = Field(
        default=Decimal("0.32"), ge=0
    )
    ai_embedding_price_per_million_usd: Decimal = Field(default=Decimal("0.01"), ge=0)
    ai_web_search_price_per_request_usd: Decimal = Field(default=Decimal("0.005"), ge=0)
    ai_pricing_version: str = "openrouter-public-2026-09-27"

    ai_ranking_version: str = "ai-provider-router-v4"
    coach_version: str = "coach-provider-router-v4"
    memory_generation_version: str = "memory-provider-router-v2"
    memory_prompt_version: str = "memory-prompt-v1"
    consent_policy_version: str = "personalized-coaching-rag-v2"
    embedding_timeout_seconds: float = Field(default=30, gt=0, le=120)
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

    web_reader_proxy_url: str = "https://r.jina.ai/"
    web_reader_proxy_api_key: str = ""
    web_reader_timeout_seconds: float = Field(default=10, gt=0, le=60)
    web_reader_cache_seconds: float = Field(default=1_800, ge=0, le=86_400)
    web_search_timeout_seconds: float = Field(default=40, ge=5, le=120)

    @field_validator(
        "ai_fast_model",
        "ai_strong_model",
        "ai_embedding_model",
        mode="before",
    )
    @classmethod
    def model_names_must_not_be_blank(cls, value: object) -> object:
        if isinstance(value, str) and value.strip():
            return value.strip()
        raise ValueError("AI model names cannot be blank.")

    @property
    def generation_api_key(self) -> str:
        return self.openrouter_api_key

    @property
    def llm_model(self) -> str:
        return self.model_for_role("fast")

    @property
    def llm_timeout_seconds(self) -> float:
        return self.ai_request_timeout_seconds

    @property
    def llm_max_output_tokens(self) -> int:
        return self.ranking_max_output_tokens

    @property
    def llm_input_price_per_million_usd(self) -> Decimal:
        return self.prices_for_role("fast")[0]

    @property
    def llm_output_price_per_million_usd(self) -> Decimal:
        return self.prices_for_role("fast")[1]

    @property
    def llm_pricing_version(self) -> str:
        return self.ai_pricing_version

    @property
    def embedding_model(self) -> str:
        return self.active_embedding_model

    @property
    def embedding_dimensions(self) -> int:
        return self.active_embedding_dimensions

    @property
    def effective_coach_provider(self) -> AiProvider:
        return self.ai_provider

    @property
    def effective_coach_model(self) -> str:
        return self.model_for_role("fast")

    @property
    def coach_api_key(self) -> str:
        return self.generation_api_key

    @property
    def effective_coach_max_output_tokens(self) -> int:
        return self.coach_max_output_tokens

    @property
    def effective_coach_prices(self) -> tuple[Decimal, Decimal]:
        return self.prices_for_role("fast")

    @property
    def active_embedding_model(self) -> str:
        return self.ai_embedding_model

    @property
    def active_embedding_dimensions(self) -> int:
        return self.ai_embedding_dimensions

    @property
    def active_embedding_version(self) -> str:
        return self.ai_embedding_version

    def model_for_role(self, role: ModelRole) -> str:
        return self.ai_strong_model if role == "strong" else self.ai_fast_model

    def prices_for_role(self, role: ModelRole) -> tuple[Decimal, Decimal]:
        if role == "strong":
            return (
                self.ai_strong_input_price_per_million_usd,
                self.ai_strong_output_price_per_million_usd,
            )
        return (
            self.ai_fast_input_price_per_million_usd,
            self.ai_fast_output_price_per_million_usd,
        )


@lru_cache
def get_ai_settings() -> AiSettings:
    return AiSettings()
