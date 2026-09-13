from decimal import Decimal
from functools import lru_cache

from pydantic import Field, ValidationInfo, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class AiSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str | None = None
    internal_service_token: str = ""
    llm_api_key: str = ""
    llm_model: str = "gemini-3.5-flash"
    llm_timeout_seconds: float = Field(default=7, gt=0, le=30)
    ai_audit_timeout_seconds: float = Field(default=0.5, gt=0, le=5)
    llm_max_output_tokens: int = Field(default=2048, gt=0, le=8192)
    llm_input_price_per_million_usd: Decimal = Field(default=Decimal("1.50"), ge=0)
    llm_output_price_per_million_usd: Decimal = Field(default=Decimal("9.00"), ge=0)
    llm_pricing_version: str = "gemini-3.5-flash-standard-2026-09"
    ai_ranking_version: str = "ai-gemini-v1"

    @field_validator(
        "llm_model", "llm_pricing_version", "ai_ranking_version", mode="before"
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
            "ai_ranking_version": "ai-gemini-v1",
        }
        return defaults[info.field_name]


@lru_cache
def get_ai_settings() -> AiSettings:
    return AiSettings()
