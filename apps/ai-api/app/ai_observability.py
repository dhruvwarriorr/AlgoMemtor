from __future__ import annotations

import logging
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from decimal import Decimal

from .settings import AiSettings, ModelRole

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AiUsage:
    provider: str
    model: str
    role: ModelRole
    workload: str
    input_tokens: int
    output_tokens: int
    estimated_cost_usd: float
    latency_ms: int
    retries: int = 0
    escalation: bool = False
    web_search_calls: int = 0
    error_type: str | None = None


_month = ""
_month_cost = Decimal()
_warned = False


def estimate_cost(
    settings: AiSettings,
    role: ModelRole,
    input_tokens: int,
    output_tokens: int,
    *,
    web_search_calls: int = 0,
) -> Decimal:
    input_price, output_price = settings.prices_for_role(role)
    return (
        Decimal(input_tokens) * input_price / Decimal(1_000_000)
        + Decimal(output_tokens) * output_price / Decimal(1_000_000)
        + Decimal(web_search_calls) * settings.ai_web_search_price_per_request_usd
    )


def record_usage(settings: AiSettings, usage: AiUsage) -> None:
    """Emit metadata-only usage telemetry and an advisory process-local warning."""
    global _month, _month_cost, _warned
    logger.info("ai_usage", extra={"ai_usage": asdict(usage)})
    if not settings.ai_budget_tracking_enabled or settings.ai_provider == "local":
        return
    current_month = datetime.now(UTC).strftime("%Y-%m")
    if current_month != _month:
        _month = current_month
        _month_cost = Decimal()
        _warned = False
    _month_cost += Decimal(str(usage.estimated_cost_usd))
    budget = settings.ai_monthly_soft_budget_usd
    if budget <= 0:
        return
    threshold = budget * Decimal(settings.ai_budget_warning_percent) / Decimal(100)
    if _month_cost >= threshold and not _warned:
        _warned = True
        logger.warning(
            "ai_monthly_soft_budget_warning",
            extra={
                "estimatedMonthCostUsd": float(_month_cost),
                "softBudgetUsd": float(budget),
                "warningPercent": settings.ai_budget_warning_percent,
            },
        )
