import json
from dataclasses import dataclass
from decimal import Decimal
from functools import lru_cache
from typing import Any
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from .settings import get_ai_settings

memory_generation_audits = sa.Table(
    "memory_generation_audits",
    sa.MetaData(),
    sa.Column("id", sa.Uuid()),
    sa.Column("request_id", sa.String(length=160)),
    sa.Column("learner_id", sa.Uuid()),
    sa.Column("evidence_id", sa.Uuid()),
    sa.Column("memory_id", sa.Uuid()),
    sa.Column("action", sa.String(length=32)),
    sa.Column("model", sa.String(length=128)),
    sa.Column("generation_version", sa.String(length=64)),
    sa.Column("embedding_model", sa.String(length=128)),
    sa.Column("fallback", sa.Boolean()),
    sa.Column("fallback_reason", sa.String(length=64)),
    sa.Column("latency_ms", sa.Integer()),
    sa.Column("input_tokens", sa.Integer()),
    sa.Column("output_tokens", sa.Integer()),
    sa.Column("estimated_cost_usd", sa.Numeric(12, 8)),
    sa.Column("memory_ids", postgresql.ARRAY(sa.Text())),
    sa.Column("input_hash", sa.String(length=64)),
    sa.Column("output_hash", sa.String(length=64)),
    sa.Column("created_at", sa.DateTime(timezone=True)),
    schema="ai",
)


@dataclass(frozen=True)
class MemoryAudit:
    request_id: str
    learner_id: UUID
    action: str
    model: str
    generation_version: str
    fallback: bool
    fallback_reason: str | None
    latency_ms: int
    evidence_id: UUID | None = None
    memory_id: UUID | None = None
    embedding_model: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    estimated_cost_usd: Decimal | None = None
    memory_ids: list[str] | None = None
    input_hash: str | None = None
    output_hash: str | None = None


class MemoryAuditRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine

    async def save(self, audit: MemoryAudit) -> UUID:
        audit_id = uuid4()
        statement = sa.insert(memory_generation_audits).values(
            id=audit_id,
            request_id=audit.request_id,
            learner_id=audit.learner_id,
            evidence_id=audit.evidence_id,
            memory_id=audit.memory_id,
            action=audit.action,
            model=audit.model,
            generation_version=audit.generation_version,
            embedding_model=audit.embedding_model,
            fallback=audit.fallback,
            fallback_reason=audit.fallback_reason,
            latency_ms=audit.latency_ms,
            input_tokens=audit.input_tokens,
            output_tokens=audit.output_tokens,
            estimated_cost_usd=audit.estimated_cost_usd,
            memory_ids=audit.memory_ids or [],
            input_hash=audit.input_hash,
            output_hash=audit.output_hash,
        )
        async with self.engine.begin() as connection:
            await connection.execute(statement)
        return audit_id


class NullMemoryAuditRepository:
    async def save(self, audit: MemoryAudit) -> UUID | None:
        del audit
        return None


def safe_memory_log(event: str, fields: dict[str, Any]) -> None:
    print(json.dumps({"event": event, **fields}, default=str), flush=True)


@lru_cache
def get_memory_audit_repository() -> MemoryAuditRepository | NullMemoryAuditRepository:
    database_url = get_ai_settings().database_url
    if not database_url:
        return NullMemoryAuditRepository()
    return MemoryAuditRepository(create_async_engine(database_url, pool_pre_ping=True))
