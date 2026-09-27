import json
from dataclasses import dataclass
from decimal import Decimal
from functools import lru_cache
from typing import Any
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncEngine

from .database import shared_engine
from .settings import get_ai_settings

ranking_audits = sa.Table(
    "ranking_audits",
    sa.MetaData(),
    sa.Column("id", sa.Uuid()),
    sa.Column("request_id", sa.String(length=100)),
    sa.Column("learner_id", sa.Uuid()),
    sa.Column("model", sa.String(length=128)),
    sa.Column("ranking_version", sa.String(length=64)),
    sa.Column("pricing_version", sa.String(length=64)),
    sa.Column("candidate_ids", postgresql.ARRAY(sa.Text())),
    sa.Column("returned_ids", postgresql.ARRAY(sa.Text())),
    sa.Column("fallback", sa.Boolean()),
    sa.Column("fallback_reason", sa.String(length=64)),
    sa.Column("latency_ms", sa.Integer()),
    sa.Column("input_tokens", sa.Integer()),
    sa.Column("output_tokens", sa.Integer()),
    sa.Column("estimated_cost_usd", sa.Numeric(12, 8)),
    sa.Column("preference_hash", sa.String(length=64)),
    schema="ai",
)


@dataclass(frozen=True)
class RankingAudit:
    request_id: str
    learner_id: UUID
    model: str
    ranking_version: str
    pricing_version: str
    candidate_ids: list[str]
    returned_ids: list[str]
    fallback: bool
    fallback_reason: str | None
    latency_ms: int
    input_tokens: int | None
    output_tokens: int | None
    estimated_cost_usd: Decimal | None
    preference_hash: str | None


class RankingAuditRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine

    async def save(self, audit: RankingAudit) -> UUID:
        audit_id = uuid4()
        statement = sa.insert(ranking_audits).values(
            id=audit_id,
            request_id=audit.request_id,
            learner_id=audit.learner_id,
            model=audit.model,
            ranking_version=audit.ranking_version,
            pricing_version=audit.pricing_version,
            candidate_ids=audit.candidate_ids,
            returned_ids=audit.returned_ids,
            fallback=audit.fallback,
            fallback_reason=audit.fallback_reason,
            latency_ms=audit.latency_ms,
            input_tokens=audit.input_tokens,
            output_tokens=audit.output_tokens,
            estimated_cost_usd=audit.estimated_cost_usd,
            preference_hash=audit.preference_hash,
        )
        async with self.engine.begin() as connection:
            await connection.execute(statement)
        return audit_id


class NullRankingAuditRepository:
    async def save(self, audit: RankingAudit) -> UUID | None:
        del audit
        return None


def safe_log(event: str, fields: dict[str, Any]) -> None:
    print(json.dumps({"event": event, **fields}, default=str), flush=True)


@lru_cache
def get_ranking_audit_repository() -> (
    RankingAuditRepository | NullRankingAuditRepository
):
    database_url = get_ai_settings().database_url
    if not database_url:
        return NullRankingAuditRepository()
    return RankingAuditRepository(shared_engine(database_url))
