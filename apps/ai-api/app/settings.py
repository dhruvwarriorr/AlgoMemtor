from decimal import Decimal
from functools import lru_cache
from typing import Literal

from pydantic import Field, ValidationInfo, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

LlmProvider = Literal["gemini", "groq"]


class AiSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str | None = None
    internal_service_token: str = ""
    # Base URL of the core API, used by the coach to request a live refresh of
    # a learner's platform data. Blank disables the refresh tool.
    core_api_url: str = ""
    coach_live_refresh_timeout_seconds: float = Field(default=30, gt=0, le=60)
    # Time the tool-using coach agent may spend before a faster, single-call
    # answer is used instead. Must leave room within the response timeout.
    coach_agent_timeout_seconds: float = Field(default=75, gt=0, le=240)
    # Text generation (ranking, memory, roadmap notes, and the coach unless
    # COACH_LLM_PROVIDER overrides it). "groq" uses GROQ_API_KEY and a Groq
    # LLM_MODEL such as qwen/qwen3.8-27b. Embeddings and web grounding always
    # use Gemini with LLM_API_KEY.
    llm_provider: LlmProvider = "gemini"
    # The Gemini key; also used for embeddings and web grounding.
    llm_api_key: str = ""
    llm_model: str = "gemini-3.5-flash-lite"
    llm_timeout_seconds: float = Field(default=90, gt=0, le=120)
    ai_audit_timeout_seconds: float = Field(default=0.5, gt=0, le=5)
    llm_max_output_tokens: int = Field(default=4096, gt=0, le=8192)
    coach_thinking_level: Literal["low", "medium", "high"] = "high"
    # Thinking tokens count against the output budget, so the coach needs far
    # more room than ranking or memory calls. Kept separate from
    # LLM_MAX_OUTPUT_TOKENS so a small shared budget cannot truncate answers.
    coach_max_output_tokens: int = Field(default=24_576, ge=2_048, le=65_536)
    coach_agent_enabled: bool = True
    # Four tool rounds cover almost every question; each extra round is one
    # more billable request against per-minute and per-day quotas.
    coach_agent_max_steps: int = Field(default=4, ge=1, le=12)
    # Optional coach-only model (e.g. a stronger model for chat while ranking
    # and memory stay on LLM_MODEL). Blank means LLM_MODEL. Prices apply to
    # the coach model and fall back to the LLM_* prices when unset.
    coach_llm_model: str = ""
    # Coach provider; blank follows LLM_PROVIDER. With "groq",
    # COACH_LLM_MODEL (or LLM_MODEL) names a Groq model.
    coach_llm_provider: LlmProvider | None = None
    # Opt-in coach router: use Qwen for concise text and Gemini for context-
    # heavy or multimodal turns, with one cross-provider retry on failure.
    coach_hybrid_enabled: bool = False
    coach_gemini_model: str = "gemini-3.5-flash-lite"
    coach_groq_model: str = "qwen/qwen3.8-27b"
    groq_api_key: str = ""
    # Default below the current on-demand Groq account's 1,000 OTPM limit.
    # Higher-tier deployments can raise this after checking their quota.
    groq_max_completion_tokens: int = Field(default=900, ge=512, le=16_384)
    coach_input_price_per_million_usd: Decimal | None = Field(default=None, ge=0)
    coach_output_price_per_million_usd: Decimal | None = Field(default=None, ge=0)
    # Process-local cap on coach model requests per minute. 0 disables it.
    # Set it to the project's RPM quota so turns wait for a free slot
    # instead of failing with provider 429s.
    coach_model_requests_per_minute: int = Field(default=0, ge=0, le=10_000)
    # End-to-end model budget for one coach turn (all agent steps). Express
    # waits a little longer than this plus web grounding before giving up.
    coach_response_timeout_seconds: float = Field(default=140, gt=0, le=300)
    llm_input_price_per_million_usd: Decimal = Field(default=Decimal("0.30"), ge=0)
    llm_output_price_per_million_usd: Decimal = Field(default=Decimal("2.50"), ge=0)
    llm_pricing_version: str = "gemini-3.5-flash-lite-standard-2026-09"
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

    @field_validator("coach_llm_provider", mode="before")
    @classmethod
    def blank_coach_provider_follows_llm_provider(cls, value: object) -> object:
        return None if isinstance(value, str) and not value.strip() else value

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
            "llm_model": "gemini-3.5-flash-lite",
            "llm_pricing_version": "gemini-3.5-flash-lite-standard-2026-09",
            "ai_ranking_version": "ai-gemini-rag-v2",
            "coach_version": "coach-gemini-rag-v2",
            "embedding_model": "gemini-embedding-001",
            "memory_generation_version": "memory-gemini-v1",
            "consent_policy_version": "personalized-coaching-rag-v2",
        }
        return defaults[info.field_name]

    @property
    def effective_coach_model(self) -> str:
        return self.coach_llm_model.strip() or self.llm_model

    @property
    def effective_coach_provider(self) -> LlmProvider:
        return self.coach_llm_provider or self.llm_provider

    @property
    def generation_api_key(self) -> str:
        """Key for ranking, memory, and roadmap-note generation."""
        return self.groq_api_key if self.llm_provider == "groq" else self.llm_api_key

    @property
    def coach_api_key(self) -> str:
        return (
            self.groq_api_key
            if self.effective_coach_provider == "groq"
            else self.llm_api_key
        )

    @property
    def effective_coach_max_output_tokens(self) -> int:
        if self.effective_coach_provider == "groq":
            return min(self.coach_max_output_tokens, self.groq_max_completion_tokens)
        return self.coach_max_output_tokens

    @property
    def effective_coach_prices(self) -> tuple[Decimal, Decimal]:
        return (
            self.coach_input_price_per_million_usd
            if self.coach_input_price_per_million_usd is not None
            else self.llm_input_price_per_million_usd,
            self.coach_output_price_per_million_usd
            if self.coach_output_price_per_million_usd is not None
            else self.llm_output_price_per_million_usd,
        )


@lru_cache
def get_ai_settings() -> AiSettings:
    return AiSettings()
