from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass
from functools import lru_cache
from time import perf_counter
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from .settings import get_ai_settings

coach_invocation_audits = sa.Table(
    "coach_invocation_audits",
    sa.MetaData(),
    sa.Column("id", sa.Uuid()),
    sa.Column("request_id", sa.String(length=100)),
    sa.Column("learner_id", sa.Uuid()),
    sa.Column("conversation_id", sa.Uuid()),
    sa.Column("model", sa.String(length=128)),
    sa.Column("coach_version", sa.String(length=64)),
    sa.Column("fallback", sa.Boolean()),
    sa.Column("fallback_reason", sa.String(length=64)),
    sa.Column("latency_ms", sa.Integer()),
    sa.Column("input_tokens", sa.Integer()),
    sa.Column("output_tokens", sa.Integer()),
    sa.Column("estimated_cost_usd", sa.Numeric(12, 8)),
    sa.Column("context_fingerprint", sa.String(length=64)),
    sa.Column("knowledge_retrieved", sa.Boolean()),
    sa.Column("memory_retrieved", sa.Boolean()),
    sa.Column("web_grounding_used", sa.Boolean()),
    sa.Column("created_at", sa.DateTime(timezone=True)),
    schema="ai",
)


@dataclass(frozen=True)
class CoachAudit:
    request_id: str
    learner_id: UUID
    conversation_id: UUID
    model: str
    coach_version: str
    fallback: bool
    fallback_reason: str | None
    latency_ms: int
    input_tokens: int | None
    output_tokens: int | None
    estimated_cost_usd: float | None
    context_fingerprint: str
    knowledge_retrieved: bool = False
    memory_retrieved: bool = False
    web_grounding_used: bool = False


class CoachAuditRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine

    async def save(self, audit: CoachAudit) -> UUID:
        audit_id = uuid4()
        statement = sa.insert(coach_invocation_audits).values(
            id=audit_id,
            request_id=audit.request_id,
            learner_id=audit.learner_id,
            conversation_id=audit.conversation_id,
            model=audit.model,
            coach_version=audit.coach_version,
            fallback=audit.fallback,
            fallback_reason=audit.fallback_reason,
            latency_ms=audit.latency_ms,
            input_tokens=audit.input_tokens,
            output_tokens=audit.output_tokens,
            estimated_cost_usd=audit.estimated_cost_usd,
            context_fingerprint=audit.context_fingerprint,
            knowledge_retrieved=audit.knowledge_retrieved,
            memory_retrieved=audit.memory_retrieved,
            web_grounding_used=audit.web_grounding_used,
            created_at=sa.func.now(),
        )
        async with self.engine.begin() as connection:
            await connection.execute(statement)
        return audit_id

    async def delete_conversation(
        self, learner_id: UUID, conversation_id: UUID
    ) -> None:
        statement = sa.delete(coach_invocation_audits).where(
            coach_invocation_audits.c.learner_id == learner_id,
            coach_invocation_audits.c.conversation_id == conversation_id,
        )
        async with self.engine.begin() as connection:
            await connection.execute(statement)

    async def delete_learner(self, learner_id: UUID) -> None:
        statement = sa.delete(coach_invocation_audits).where(
            coach_invocation_audits.c.learner_id == learner_id
        )
        async with self.engine.begin() as connection:
            await connection.execute(statement)


class NullCoachAuditRepository:
    async def save(self, audit: CoachAudit) -> UUID | None:
        del audit
        return None

    async def delete_conversation(
        self, learner_id: UUID, conversation_id: UUID
    ) -> None:
        del learner_id, conversation_id

    async def delete_learner(self, learner_id: UUID) -> None:
        del learner_id


def context_fingerprint(context: dict[str, object], secret: str) -> str:
    payload = json.dumps(
        context, ensure_ascii=True, separators=(",", ":"), sort_keys=True, default=str
    ).encode()
    key = secret.encode() or b"algomemtor-coach-audit"
    return hmac.new(key, payload, hashlib.sha256).hexdigest()


@lru_cache
def get_coach_audit_repository() -> CoachAuditRepository | NullCoachAuditRepository:
    database_url = get_ai_settings().database_url
    if not database_url:
        return NullCoachAuditRepository()
    return CoachAuditRepository(create_async_engine(database_url, pool_pre_ping=True))


def elapsed_ms(started: float) -> int:
    return max(0, round((perf_counter() - started) * 1000))
