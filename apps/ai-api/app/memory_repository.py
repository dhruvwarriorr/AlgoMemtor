from __future__ import annotations

import hashlib
import json
import logging
import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from functools import lru_cache
from typing import Any
from uuid import UUID, uuid4

import sqlalchemy as sa
from pgvector.sqlalchemy import VECTOR
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine

from .database import shared_engine
from .memory_audit import memory_generation_audits
from .memory_models import (
    MemoryProcessRequest,
    MemoryStatus,
    ReflectionGenerationOutput,
    StoredMemory,
)
from .settings import get_ai_settings

logger = logging.getLogger(__name__)

memory_metadata = sa.MetaData()

memory_evidence = sa.Table(
    "memory_evidence",
    memory_metadata,
    sa.Column("id", sa.Uuid(), primary_key=True),
    sa.Column("learner_id", sa.Uuid(), nullable=False),
    sa.Column("evidence_id", sa.Uuid(), nullable=False, unique=True),
    sa.Column("idempotency_key", sa.String(length=160), nullable=False),
    sa.Column("evidence_type", sa.String(length=32), nullable=False),
    sa.Column("context_hash", sa.String(length=64), nullable=False),
    sa.Column("has_note", sa.Boolean(), nullable=False),
    sa.Column("has_structured_context", sa.Boolean(), nullable=False),
    sa.Column("problem_provider", sa.String(length=32), nullable=True),
    sa.Column("problem_external_id", sa.String(length=128), nullable=True),
    sa.Column("evidence_strength", sa.Numeric(4, 3), nullable=False),
    sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    sa.UniqueConstraint(
        "learner_id", "idempotency_key", name="memory_evidence_idempotency_key"
    ),
    schema="ai",
)

reflection_summaries = sa.Table(
    "reflection_summaries",
    memory_metadata,
    sa.Column("id", sa.Uuid(), primary_key=True),
    sa.Column("learner_id", sa.Uuid(), nullable=False),
    sa.Column("evidence_id", sa.Uuid(), nullable=False),
    sa.Column("summary", sa.String(length=800), nullable=False),
    sa.Column("key_signals", postgresql.JSONB(), nullable=False),
    sa.Column("model", sa.String(length=128), nullable=False),
    sa.Column("generation_version", sa.String(length=64), nullable=False),
    sa.Column("consent_policy_version", sa.String(length=64), nullable=False),
    sa.Column("prompt_version", sa.String(length=64), nullable=False),
    sa.Column("input_tokens", sa.Integer(), nullable=True),
    sa.Column("output_tokens", sa.Integer(), nullable=True),
    sa.Column("estimated_cost_usd", sa.Numeric(12, 8), nullable=True),
    sa.Column("input_hash", sa.String(length=64), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    sa.UniqueConstraint("evidence_id", name="reflection_summaries_evidence_key"),
    sa.ForeignKeyConstraint(
        ["evidence_id"], ["ai.memory_evidence.id"], ondelete="CASCADE"
    ),
    schema="ai",
)

learner_memories = sa.Table(
    "learner_memories",
    memory_metadata,
    sa.Column("id", sa.Uuid(), primary_key=True),
    sa.Column("learner_id", sa.Uuid(), nullable=False),
    sa.Column("memory_key", sa.String(length=64), nullable=False),
    sa.Column("category", sa.String(length=40), nullable=False),
    sa.Column("statement", sa.String(length=500), nullable=False),
    sa.Column("statement_tsv", postgresql.TSVECTOR(), nullable=True),
    sa.Column("structured_value", postgresql.JSONB(), nullable=False),
    sa.Column("confidence", sa.Numeric(4, 3), nullable=False),
    sa.Column("status", sa.String(length=16), nullable=False),
    sa.Column("version", sa.Integer(), nullable=False),
    sa.Column("supersedes_memory_id", sa.Uuid(), nullable=True),
    sa.Column("learner_corrected", sa.Boolean(), nullable=False),
    sa.Column("embedding", VECTOR(768), nullable=True),
    sa.Column("embedding_model", sa.String(length=128), nullable=True),
    sa.Column("embedding_v2", VECTOR(1024), nullable=True),
    sa.Column("embedding_version", sa.String(length=128), nullable=True),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    sa.UniqueConstraint(
        "learner_id", "memory_key", name="learner_memories_learner_key"
    ),
    sa.ForeignKeyConstraint(
        ["supersedes_memory_id"], ["ai.learner_memories.id"], ondelete="SET NULL"
    ),
    schema="ai",
)

memory_evidence_links = sa.Table(
    "memory_evidence_links",
    memory_metadata,
    sa.Column("memory_id", sa.Uuid(), nullable=False),
    sa.Column("evidence_id", sa.Uuid(), nullable=False),
    sa.Column("support_strength", sa.Numeric(4, 3), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint("memory_id", "evidence_id"),
    sa.ForeignKeyConstraint(
        ["memory_id"], ["ai.learner_memories.id"], ondelete="CASCADE"
    ),
    sa.ForeignKeyConstraint(
        ["evidence_id"], ["ai.memory_evidence.id"], ondelete="CASCADE"
    ),
    schema="ai",
)

memory_processing_outbox = sa.Table(
    "memory_processing_outbox",
    memory_metadata,
    sa.Column("id", sa.Uuid(), primary_key=True),
    sa.Column("learner_id", sa.Uuid(), nullable=False),
    sa.Column("evidence_id", sa.Uuid(), nullable=False, unique=True),
    sa.Column("status", sa.String(length=16), nullable=False),
    sa.Column("attempts", sa.Integer(), nullable=False),
    sa.Column("available_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("last_error_code", sa.String(length=64), nullable=True),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(
        ["evidence_id"], ["ai.memory_evidence.id"], ondelete="CASCADE"
    ),
    schema="ai",
)


@dataclass(frozen=True)
class EvidenceReceipt:
    evidence_id: UUID
    job_id: UUID
    learner_id: UUID
    created: bool
    job_status: str
    reprocess: bool = False


@dataclass(frozen=True)
class JobClaim:
    claimed: bool
    status: str
    lease_started_at: datetime | None = None


@dataclass(frozen=True)
class PersistedMemory:
    memory_key: str
    category: str
    statement: str
    structured_value: dict[str, str | int | float | bool]
    confidence: float
    embedding: list[float] | None
    embedding_model: str | None
    status: str = "active"


@dataclass(frozen=True)
class PersistedGeneration:
    summary_id: UUID
    memory_ids: list[UUID]


@dataclass(frozen=True)
class CleanupCounts:
    deleted_memories: int
    deleted_evidence: int
    deleted_summaries: int
    deleted_jobs: int
    deleted_audits: int


class MemoryRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine

    async def record_evidence(
        self, request: MemoryProcessRequest, redacted_context: dict[str, Any]
    ) -> EvidenceReceipt:
        from sqlalchemy.dialects.postgresql import insert

        context_hash = hashlib.sha256(
            json.dumps(
                redacted_context,
                ensure_ascii=True,
                separators=(",", ":"),
                sort_keys=True,
            ).encode()
        ).hexdigest()
        evidence_id = uuid4()
        job_id = uuid4()
        reprocess = False
        async with self.engine.begin() as connection:
            evidence_insert = (
                insert(memory_evidence)
                .values(
                    id=evidence_id,
                    learner_id=request.learnerId,
                    evidence_id=request.evidenceId,
                    idempotency_key=request.idempotencyKey,
                    evidence_type=request.evidenceType,
                    context_hash=context_hash,
                    has_note=request.note is not None,
                    has_structured_context=any(
                        (
                            request.perceivedDifficulty is not None,
                            request.timeSpentMinutes is not None,
                            request.feedback is not None,
                            request.explicitPreference is not None,
                            request.topic is not None,
                            request.problemStatus is not None,
                        )
                    ),
                    problem_provider=request.problemProvider,
                    problem_external_id=request.problemExternalId,
                    evidence_strength=Decimal(str(request.evidenceStrength)),
                    occurred_at=request.occurredAt,
                )
                .on_conflict_do_nothing()
                .returning(memory_evidence.c.id)
            )
            inserted_evidence_id = await connection.scalar(evidence_insert)
            created = inserted_evidence_id is not None
            if created:
                evidence_id = inserted_evidence_id
            else:
                evidence_columns = (
                    memory_evidence.c.id,
                    memory_evidence.c.learner_id,
                    memory_evidence.c.evidence_id,
                    memory_evidence.c.idempotency_key,
                    memory_evidence.c.context_hash,
                    memory_evidence.c.evidence_type,
                    memory_evidence.c.has_note,
                    memory_evidence.c.problem_provider,
                    memory_evidence.c.problem_external_id,
                )
                existing_by_evidence_result = await connection.execute(
                    sa.select(*evidence_columns).where(
                        memory_evidence.c.evidence_id == request.evidenceId
                    )
                )
                existing_by_evidence = existing_by_evidence_result.mappings().first()
                existing_by_key_result = await connection.execute(
                    sa.select(*evidence_columns).where(
                        memory_evidence.c.learner_id == request.learnerId,
                        memory_evidence.c.idempotency_key == request.idempotencyKey,
                    )
                )
                existing_by_key = existing_by_key_result.mappings().first()

                if existing_by_evidence is not None:
                    if existing_by_evidence["learner_id"] != request.learnerId:
                        raise MemoryOwnershipError
                    if (
                        existing_by_key is not None
                        and existing_by_key["id"] != existing_by_evidence["id"]
                    ):
                        raise MemoryConflictError
                    existing_row = existing_by_evidence
                elif existing_by_key is not None:
                    if existing_by_key["evidence_id"] != request.evidenceId:
                        raise MemoryConflictError
                    existing_row = existing_by_key
                else:
                    raise MemoryStorageError(
                        "The evidence conflict could not be resolved."
                    )

                if existing_row["evidence_type"] != request.evidenceType:
                    raise MemoryConflictError
                if (
                    existing_row["problem_provider"] != request.problemProvider
                    or existing_row["problem_external_id"] != request.problemExternalId
                ):
                    raise MemoryConflictError
                same_context = existing_row["context_hash"] == context_hash
                same_idempotency_key = (
                    existing_row["idempotency_key"] == request.idempotencyKey
                )
                if same_idempotency_key and not same_context:
                    raise MemoryConflictError
                evidence_id = existing_row["id"]
                if not same_idempotency_key:
                    await connection.execute(
                        sa.update(memory_evidence)
                        .where(memory_evidence.c.id == evidence_id)
                        .values(
                            idempotency_key=request.idempotencyKey,
                            context_hash=context_hash,
                            has_note=existing_row["has_note"]
                            or request.note is not None,
                            has_structured_context=any(
                                (
                                    request.perceivedDifficulty is not None,
                                    request.timeSpentMinutes is not None,
                                    request.feedback is not None,
                                    request.explicitPreference is not None,
                                    request.topic is not None,
                                    request.problemStatus is not None,
                                )
                            ),
                        )
                    )
                    reprocess = not same_context

            job_insert = (
                insert(memory_processing_outbox)
                .values(
                    id=job_id,
                    learner_id=request.learnerId,
                    evidence_id=evidence_id,
                    status="pending",
                    attempts=0,
                    available_at=sa.func.now(),
                )
                .on_conflict_do_nothing(
                    index_elements=[memory_processing_outbox.c.evidence_id]
                )
                .returning(memory_processing_outbox.c.id)
            )
            inserted_job_id = await connection.scalar(job_insert)
            if inserted_job_id is None:
                existing_job = await connection.execute(
                    sa.select(
                        memory_processing_outbox.c.id,
                        memory_processing_outbox.c.status,
                        memory_processing_outbox.c.learner_id,
                    ).where(memory_processing_outbox.c.evidence_id == evidence_id)
                )
                job_row = existing_job.mappings().one()
                if job_row["learner_id"] != request.learnerId:
                    raise MemoryOwnershipError
                job_id = job_row["id"]
                job_status = job_row["status"]
                if reprocess and job_status in {"completed", "failed"}:
                    await connection.execute(
                        sa.update(memory_processing_outbox)
                        .where(memory_processing_outbox.c.id == job_id)
                        .values(
                            status="pending",
                            attempts=0,
                            available_at=sa.func.now(),
                            started_at=None,
                            completed_at=None,
                            last_error_code=None,
                        )
                    )
                    job_status = "pending"
            else:
                job_status = "pending"

        return EvidenceReceipt(
            evidence_id=evidence_id,
            job_id=job_id,
            learner_id=request.learnerId,
            created=created,
            job_status=job_status,
            reprocess=reprocess,
        )

    async def claim_job(self, job_id: UUID) -> JobClaim:
        stale_before = sa.func.now() - sa.text("INTERVAL '60 seconds'")
        statement = (
            sa.update(memory_processing_outbox)
            .where(
                memory_processing_outbox.c.id == job_id,
                sa.or_(
                    sa.and_(
                        memory_processing_outbox.c.status.in_(["pending", "failed"]),
                        memory_processing_outbox.c.available_at <= sa.func.now(),
                        memory_processing_outbox.c.attempts < 4,
                    ),
                    sa.and_(
                        memory_processing_outbox.c.status == "processing",
                        memory_processing_outbox.c.started_at.is_not(None),
                        memory_processing_outbox.c.started_at <= stale_before,
                        memory_processing_outbox.c.attempts < 4,
                    ),
                ),
            )
            .values(
                status="processing",
                attempts=memory_processing_outbox.c.attempts + 1,
                started_at=sa.func.now(),
                last_error_code=None,
            )
            .returning(
                memory_processing_outbox.c.status,
                memory_processing_outbox.c.started_at,
            )
        )
        async with self.engine.begin() as connection:
            result = await connection.execute(statement)
            row = result.mappings().first()
            if row is not None:
                return JobClaim(
                    claimed=True,
                    status=row["status"],
                    lease_started_at=row["started_at"],
                )
            current_result = await connection.execute(
                sa.select(
                    memory_processing_outbox.c.status,
                    memory_processing_outbox.c.started_at,
                ).where(memory_processing_outbox.c.id == job_id)
            )
            current_row = current_result.mappings().first()
        if current_row is None:
            raise MemoryStorageError("Memory processing job was not found.")
        return JobClaim(
            claimed=False,
            status=current_row["status"],
            lease_started_at=current_row["started_at"],
        )

    async def persist_generation(
        self,
        *,
        job_id: UUID,
        learner_id: UUID,
        evidence_id: UUID,
        output: ReflectionGenerationOutput,
        memories: Sequence[PersistedMemory],
        model: str,
        generation_version: str,
        input_hash: str,
        consent_policy_version: str = "personalized-coaching-rag-v2",
        prompt_version: str = "memory-prompt-v1",
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        estimated_cost_usd: Decimal | None = None,
        lease_started_at: datetime | None = None,
    ) -> PersistedGeneration:
        from sqlalchemy.dialects.postgresql import insert

        async with self.engine.begin() as connection:
            if lease_started_at is not None:
                lease_result = await connection.execute(
                    sa.select(
                        memory_processing_outbox.c.status,
                        memory_processing_outbox.c.started_at,
                    )
                    .where(memory_processing_outbox.c.id == job_id)
                    .with_for_update()
                )
                lease = lease_result.mappings().first()
                if (
                    lease is None
                    or lease["status"] != "processing"
                    or lease["started_at"] != lease_started_at
                ):
                    raise MemoryConflictError(
                        "The memory processing lease is no longer active."
                    )
            summary_id = uuid4()
            summary_insert = (
                insert(reflection_summaries)
                .values(
                    id=summary_id,
                    learner_id=learner_id,
                    evidence_id=evidence_id,
                    summary=output.summary,
                    key_signals=output.keySignals,
                    model=model,
                    generation_version=generation_version,
                    consent_policy_version=consent_policy_version,
                    prompt_version=prompt_version,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    estimated_cost_usd=estimated_cost_usd,
                    input_hash=input_hash,
                )
                .on_conflict_do_update(
                    index_elements=[reflection_summaries.c.evidence_id],
                    set_={
                        "summary": output.summary,
                        "key_signals": output.keySignals,
                        "model": model,
                        "generation_version": generation_version,
                        "consent_policy_version": consent_policy_version,
                        "prompt_version": prompt_version,
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                        "estimated_cost_usd": estimated_cost_usd,
                        "input_hash": input_hash,
                    },
                )
                .returning(reflection_summaries.c.id)
            )
            summary_id = await connection.scalar(summary_insert)
            memory_ids: list[UUID] = []

            for memory in memories:
                memory_id = uuid4()
                memory_insert = insert(learner_memories).values(
                    id=memory_id,
                    learner_id=learner_id,
                    memory_key=memory.memory_key,
                    category=memory.category,
                    statement=memory.statement,
                    structured_value=memory.structured_value,
                    confidence=Decimal(str(memory.confidence)),
                    status=memory.status,
                    version=1,
                    learner_corrected=False,
                    embedding_v2=memory.embedding,
                    embedding_version=memory.embedding_model,
                )
                memory_upsert = memory_insert.on_conflict_do_update(
                    index_elements=[
                        learner_memories.c.learner_id,
                        learner_memories.c.memory_key,
                    ],
                    set_={
                        "confidence": sa.func.greatest(
                            learner_memories.c.confidence,
                            memory_insert.excluded.confidence,
                        ),
                        "status": sa.case(
                            (
                                learner_memories.c.learner_corrected.is_(True),
                                learner_memories.c.status,
                            ),
                            else_=memory_insert.excluded.status,
                        ),
                        "structured_value": memory_insert.excluded.structured_value,
                        "updated_at": sa.func.now(),
                        "embedding_v2": sa.case(
                            (
                                learner_memories.c.statement
                                != memory_insert.excluded.statement,
                                memory_insert.excluded.embedding_v2,
                            ),
                            else_=sa.func.coalesce(
                                learner_memories.c.embedding_v2,
                                memory_insert.excluded.embedding_v2,
                            ),
                        ),
                        "embedding_version": sa.case(
                            (
                                learner_memories.c.statement
                                != memory_insert.excluded.statement,
                                memory_insert.excluded.embedding_version,
                            ),
                            else_=sa.func.coalesce(
                                learner_memories.c.embedding_version,
                                memory_insert.excluded.embedding_version,
                            ),
                        ),
                    },
                ).returning(learner_memories.c.id)
                memory_id = await connection.scalar(memory_upsert)
                memory_ids.append(memory_id)

                link_insert = insert(memory_evidence_links).values(
                    memory_id=memory_id,
                    evidence_id=evidence_id,
                    support_strength=Decimal(str(memory.confidence)),
                )
                link_upsert = link_insert.on_conflict_do_update(
                    index_elements=[
                        memory_evidence_links.c.memory_id,
                        memory_evidence_links.c.evidence_id,
                    ],
                    set_={
                        "support_strength": sa.func.greatest(
                            memory_evidence_links.c.support_strength,
                            link_insert.excluded.support_strength,
                        )
                    },
                )
                await connection.execute(link_upsert)

            await connection.execute(
                sa.update(memory_processing_outbox)
                .where(memory_processing_outbox.c.id == job_id)
                .values(
                    status="completed",
                    completed_at=sa.func.now(),
                    last_error_code=None,
                )
            )

        return PersistedGeneration(summary_id=summary_id, memory_ids=memory_ids)

    async def mark_job_failed(
        self,
        job_id: UUID,
        error_code: str,
        lease_started_at: datetime | None = None,
    ) -> None:
        async with self.engine.begin() as connection:
            await connection.execute(
                sa.update(memory_processing_outbox)
                .where(
                    memory_processing_outbox.c.id == job_id,
                    *(
                        []
                        if lease_started_at is None
                        else [
                            memory_processing_outbox.c.status == "processing",
                            memory_processing_outbox.c.started_at == lease_started_at,
                        ]
                    ),
                )
                .values(status="failed", last_error_code=error_code)
            )

    async def processing_result(
        self, learner_id: UUID, evidence_id: UUID
    ) -> PersistedGeneration | None:
        async with self.engine.connect() as connection:
            summary_id = await connection.scalar(
                sa.select(reflection_summaries.c.id).where(
                    reflection_summaries.c.learner_id == learner_id,
                    reflection_summaries.c.evidence_id == evidence_id,
                )
            )
            if summary_id is None:
                return None
            result = await connection.execute(
                sa.select(memory_evidence_links.c.memory_id)
                .join(
                    learner_memories,
                    learner_memories.c.id == memory_evidence_links.c.memory_id,
                )
                .where(
                    memory_evidence_links.c.evidence_id == evidence_id,
                    learner_memories.c.learner_id == learner_id,
                )
            )
            memory_ids = [row[0] for row in result]
        return PersistedGeneration(summary_id=summary_id, memory_ids=memory_ids)

    async def _stored_memory(
        self,
        connection: Any,
        row: Any,
        *,
        similarity: float | None = None,
    ) -> StoredMemory:
        evidence = await self._evidence_ids(connection, [row["id"]])
        return self._memory_from_row(
            row, evidence.get(row["id"], []), similarity=similarity
        )

    async def _stored_memories(
        self, connection: Any, rows: Any, *, with_similarity: bool = False
    ) -> list[StoredMemory]:
        """Build many memories with one evidence query instead of one per row.

        The database is a network hop away, so a query per memory made a
        learner's memory list take seconds.
        """
        evidence = await self._evidence_ids(connection, [row["id"] for row in rows])
        return [
            self._memory_from_row(
                row,
                evidence.get(row["id"], []),
                similarity=float(row["similarity"]) if with_similarity else None,
            )
            for row in rows
        ]

    async def _evidence_ids(
        self, connection: Any, memory_ids: list[Any]
    ) -> dict[Any, list[Any]]:
        if not memory_ids:
            return {}
        result = await connection.execute(
            sa.select(
                memory_evidence_links.c.memory_id,
                memory_evidence_links.c.evidence_id,
            )
            .where(memory_evidence_links.c.memory_id.in_(memory_ids))
            .order_by(memory_evidence_links.c.created_at.asc())
        )
        evidence: dict[Any, list[Any]] = {}
        for memory_id, evidence_id in result:
            evidence.setdefault(memory_id, []).append(evidence_id)
        return evidence

    @staticmethod
    def _memory_from_row(
        row: Any, evidence_ids: list[Any], *, similarity: float | None
    ) -> StoredMemory:
        memory_id = row["id"]
        return StoredMemory(
            id=memory_id,
            learnerId=row["learner_id"],
            category=row["category"],
            statement=row["statement"],
            structuredValue=dict(row["structured_value"] or {}),
            confidence=float(row["confidence"]),
            status=row["status"],
            evidenceIds=evidence_ids,
            version=int(row.get("version", 1)),
            **(
                {}
                if row.get("supersedes_memory_id") is None
                else {"supersedesMemoryId": row["supersedes_memory_id"]}
            ),
            learnerCorrected=bool(row.get("learner_corrected", False)),
            similarity=similarity,
            createdAt=row["created_at"],
            updatedAt=row["updated_at"],
        )

    async def search_vector(
        self,
        learner_id: UUID,
        embedding: list[float],
        *,
        limit: int,
        confidence_threshold: float,
        similarity_threshold: float,
        embedding_version: str | None = None,
    ) -> list[StoredMemory]:
        query_embedding = sa.bindparam("query_embedding", type_=VECTOR(1024))
        distance = learner_memories.c.embedding_v2.cosine_distance(query_embedding)
        similarity = (sa.literal(1.0) - distance).label("similarity")
        statement = (
            sa.select(learner_memories, similarity)
            .where(
                learner_memories.c.learner_id == learner_id,
                learner_memories.c.status == "active",
                learner_memories.c.confidence >= Decimal(str(confidence_threshold)),
                learner_memories.c.embedding_v2.is_not(None),
                learner_memories.c.embedding_version == embedding_version,
                similarity >= similarity_threshold,
            )
            .order_by(distance.asc(), learner_memories.c.updated_at.desc())
            .limit(limit)
        )
        async with self.engine.connect() as connection:
            result = await connection.execute(statement, {"query_embedding": embedding})
            rows = result.mappings().all()
            return await self._stored_memories(connection, rows, with_similarity=True)

    async def search_sql(
        self,
        learner_id: UUID,
        *,
        query: str | None = None,
        limit: int,
        confidence_threshold: float,
    ) -> list[StoredMemory]:
        conditions = [
            learner_memories.c.learner_id == learner_id,
            learner_memories.c.status == "active",
            learner_memories.c.confidence >= Decimal(str(confidence_threshold)),
        ]
        tokens = re.findall(r"[a-z0-9][a-z0-9-]*", (query or "").lower())
        rank = sa.literal(0.0)
        if tokens:
            text_query = sa.func.plainto_tsquery("english", query or "")
            tsv_match = learner_memories.c.statement_tsv.op("@@")(text_query)
            keyword_match = sa.or_(
                *[
                    learner_memories.c.statement.ilike(f"%{token}%")
                    for token in tokens[:12]
                ]
            )
            conditions.append(sa.or_(tsv_match, keyword_match))
            rank = sa.func.ts_rank_cd(learner_memories.c.statement_tsv, text_query)
        statement = (
            sa.select(learner_memories)
            .where(*conditions)
            .order_by(
                rank.desc(),
                learner_memories.c.confidence.desc(),
                learner_memories.c.updated_at.desc(),
            )
            .limit(limit)
        )
        async with self.engine.connect() as connection:
            result = await connection.execute(statement)
            rows = result.mappings().all()
            return await self._stored_memories(connection, rows)

    async def get_memory(
        self, learner_id: UUID, memory_id: UUID
    ) -> StoredMemory | None:
        async with self.engine.connect() as connection:
            result = await connection.execute(
                sa.select(learner_memories).where(
                    learner_memories.c.id == memory_id,
                    learner_memories.c.learner_id == learner_id,
                )
            )
            row = result.mappings().first()
            if row is None:
                return None
            return await self._stored_memory(connection, row)

    async def list_memories(
        self, learner_id: UUID, *, include_archived: bool = True
    ) -> list[StoredMemory]:
        conditions = [learner_memories.c.learner_id == learner_id]
        if not include_archived:
            conditions.append(learner_memories.c.status == "active")
        statement = (
            sa.select(learner_memories)
            .where(*conditions)
            .order_by(learner_memories.c.updated_at.desc())
        )
        async with self.engine.connect() as connection:
            result = await connection.execute(statement)
            rows = result.mappings().all()
            return await self._stored_memories(connection, rows)

    async def list_memories_by_category(
        self,
        learner_id: UUID,
        *,
        categories: list[str],
        status: str = "active",
        limit: int = 20,
    ) -> list[StoredMemory]:
        if not categories:
            return []
        statement = (
            sa.select(learner_memories)
            .where(
                learner_memories.c.learner_id == learner_id,
                learner_memories.c.status == status,
                learner_memories.c.category.in_(categories),
            )
            .order_by(
                learner_memories.c.learner_corrected.desc(),
                learner_memories.c.confidence.desc(),
                learner_memories.c.updated_at.desc(),
            )
            .limit(min(limit, 20))
        )
        async with self.engine.connect() as connection:
            result = await connection.execute(statement)
            rows = result.mappings().all()
            return await self._stored_memories(connection, rows)

    async def consolidate_memories(
        self,
        learner_id: UUID,
        *,
        memory_ids: list[UUID],
        statement_text: str,
        category: str,
        confidence: float,
    ) -> StoredMemory | None:
        """Create one durable summary and archive its source memories."""
        from sqlalchemy.dialects.postgresql import insert

        if len(memory_ids) < 2:
            raise MemoryConflictError("Consolidation needs at least two memories.")
        memory_key = hashlib.sha256(
            f"consolidated:{category}:{statement_text}".encode()
        ).hexdigest()[:64]
        async with self.engine.begin() as connection:
            result = await connection.execute(
                sa.select(learner_memories).where(
                    learner_memories.c.learner_id == learner_id,
                    learner_memories.c.id.in_(memory_ids),
                    learner_memories.c.status == "active",
                )
            )
            source_rows = result.mappings().all()
            if len(source_rows) < 2:
                return None
            evidence_result = await connection.execute(
                sa.select(
                    memory_evidence_links.c.evidence_id,
                    memory_evidence_links.c.support_strength,
                ).where(memory_evidence_links.c.memory_id.in_(memory_ids))
            )
            evidence_rows = evidence_result.mappings().all()
            inserted = await connection.execute(
                insert(learner_memories)
                .values(
                    id=uuid4(),
                    learner_id=learner_id,
                    memory_key=memory_key,
                    category=category,
                    statement=statement_text,
                    structured_value={
                        "consolidatedFrom": [str(item) for item in memory_ids]
                    },
                    confidence=Decimal(str(confidence)),
                    status="active",
                    version=max(int(row["version"]) for row in source_rows) + 1,
                    learner_corrected=False,
                    embedding_v2=None,
                    embedding_version=None,
                )
                .on_conflict_do_update(
                    index_elements=[
                        learner_memories.c.learner_id,
                        learner_memories.c.memory_key,
                    ],
                    set_={
                        "statement": statement_text,
                        "category": category,
                        "confidence": Decimal(str(confidence)),
                        "status": "active",
                        "updated_at": sa.func.now(),
                    },
                )
                .returning(learner_memories)
            )
            row = inserted.mappings().one()
            for evidence in evidence_rows:
                await connection.execute(
                    insert(memory_evidence_links)
                    .values(
                        memory_id=row["id"],
                        evidence_id=evidence["evidence_id"],
                        support_strength=evidence["support_strength"],
                    )
                    .on_conflict_do_nothing()
                )
            await connection.execute(
                sa.update(learner_memories)
                .where(
                    learner_memories.c.learner_id == learner_id,
                    learner_memories.c.id.in_(memory_ids),
                    learner_memories.c.id != row["id"],
                )
                .values(
                    status="archived",
                    archived_at=sa.func.now(),
                    updated_at=sa.func.now(),
                )
            )
            return await self._stored_memory(connection, row)

    async def create_proposed_memory(
        self,
        learner_id: UUID,
        *,
        memory_key: str,
        category: str,
        statement: str,
        confidence: float = 0.5,
        request_id: str,
        status: MemoryStatus = "proposed",
        evidence_prefix: str = "coach-proposal",
        idempotency_prefix: str = "coach-memory",
    ) -> tuple[StoredMemory, bool]:
        """Create an owner-scoped, evidence-backed memory proposal.

        A proposal is deliberately stored with a synthetic, hash-only evidence
        row.  The row proves provenance without retaining the coach transcript
        or transient code/problem context, and lets the existing approve/delete
        lifecycle operate unchanged.
        """
        from sqlalchemy.dialects.postgresql import insert

        evidence_id = uuid4()
        now = datetime.now(UTC)
        context_hash = hashlib.sha256(
            f"{evidence_prefix}:{category}:{statement}".encode()
        ).hexdigest()
        idempotency_key = f"{idempotency_prefix}:{request_id}"
        async with self.engine.begin() as connection:
            existing_result = await connection.execute(
                sa.select(learner_memories).where(
                    learner_memories.c.learner_id == learner_id,
                    learner_memories.c.memory_key == memory_key,
                )
            )
            existing = existing_result.mappings().first()
            if existing is not None:
                return await self._stored_memory(connection, existing), False

            evidence_insert = (
                insert(memory_evidence)
                .values(
                    id=evidence_id,
                    learner_id=learner_id,
                    evidence_id=evidence_id,
                    idempotency_key=idempotency_key,
                    evidence_type="analytics",
                    context_hash=context_hash,
                    has_note=False,
                    has_structured_context=True,
                    problem_provider=None,
                    problem_external_id=None,
                    evidence_strength=Decimal(str(confidence)),
                    occurred_at=now,
                    created_at=now,
                )
                .on_conflict_do_nothing(
                    index_elements=[
                        memory_evidence.c.learner_id,
                        memory_evidence.c.idempotency_key,
                    ]
                )
                .returning(memory_evidence.c.id)
            )
            inserted_evidence = await connection.scalar(evidence_insert)
            if inserted_evidence is None:
                existing_evidence_result = await connection.execute(
                    sa.select(
                        memory_evidence.c.id,
                        memory_evidence.c.context_hash,
                    ).where(
                        memory_evidence.c.learner_id == learner_id,
                        memory_evidence.c.idempotency_key == idempotency_key,
                    )
                )
                existing_evidence = existing_evidence_result.mappings().first()
                if existing_evidence is None:
                    raise MemoryStorageError(
                        "The memory proposal evidence conflict could not be resolved."
                    )
                if existing_evidence["context_hash"] != context_hash:
                    raise MemoryConflictError(
                        "A memory proposal idempotency key was reused with different content."
                    )
                evidence_id = existing_evidence["id"]

            memory_insert = await connection.execute(
                sa.insert(learner_memories)
                .values(
                    id=uuid4(),
                    learner_id=learner_id,
                    memory_key=memory_key,
                    category=category,
                    statement=statement,
                    structured_value={},
                    confidence=Decimal(str(confidence)),
                    status=status,
                    version=1,
                    learner_corrected=False,
                    embedding_v2=None,
                    embedding_version=None,
                    created_at=now,
                    updated_at=now,
                )
                .returning(learner_memories)
            )
            row = memory_insert.mappings().one()
            await connection.execute(
                sa.insert(memory_evidence_links).values(
                    memory_id=row["id"],
                    evidence_id=evidence_id,
                    support_strength=Decimal(str(confidence)),
                    created_at=now,
                )
            )
            return await self._stored_memory(connection, row), True

    async def create_user_memory(
        self,
        learner_id: UUID,
        *,
        memory_key: str,
        statement: str,
        request_id: str,
    ) -> tuple[StoredMemory, bool]:
        return await self.create_proposed_memory(
            learner_id,
            memory_key=memory_key,
            category="user_instruction",
            statement=statement,
            confidence=1.0,
            request_id=request_id,
            status="active",
            evidence_prefix="user-input",
            idempotency_prefix="user-memory",
        )

    async def has_consistent_support(
        self,
        learner_id: UUID,
        category: str,
        structured_value: dict[str, str | int | float | bool],
        current_evidence_id: UUID | None = None,
    ) -> bool:
        if not structured_value:
            return False
        conditions = [
            learner_memories.c.learner_id == learner_id,
            learner_memories.c.category == category,
            learner_memories.c.structured_value == structured_value,
        ]
        if current_evidence_id is not None:
            conditions.append(
                memory_evidence_links.c.evidence_id != current_evidence_id
            )
        statement = (
            sa.select(sa.func.count(sa.distinct(memory_evidence_links.c.evidence_id)))
            .select_from(learner_memories)
            .join(
                memory_evidence_links,
                memory_evidence_links.c.memory_id == learner_memories.c.id,
            )
            .where(*conditions)
        )
        async with self.engine.connect() as connection:
            return int(await connection.scalar(statement) or 0) >= 1

    async def correct_memory(
        self,
        learner_id: UUID,
        memory_id: UUID,
        *,
        memory_key: str,
        statement_text: str,
        category: str,
        structured_value: dict[str, str | int | float | bool],
        confidence: float | None,
        embedding: list[float] | None = None,
        embedding_model: str | None = None,
    ) -> StoredMemory | None:
        async with self.engine.begin() as connection:
            try:
                current_result = await connection.execute(
                    sa.select(learner_memories).where(
                        learner_memories.c.id == memory_id,
                        learner_memories.c.learner_id == learner_id,
                    )
                )
                current = current_result.mappings().first()
                if current is None:
                    return None
                evidence_result = await connection.execute(
                    sa.select(
                        memory_evidence_links.c.evidence_id,
                        memory_evidence_links.c.support_strength,
                    ).where(memory_evidence_links.c.memory_id == memory_id)
                )
                evidence_links = evidence_result.mappings().all()
                if not evidence_links:
                    raise MemoryConflictError
                new_id = uuid4()
                insert_result = await connection.execute(
                    sa.insert(learner_memories)
                    .values(
                        id=new_id,
                        learner_id=learner_id,
                        memory_key=memory_key,
                        category=category,
                        statement=statement_text,
                        structured_value=structured_value,
                        confidence=Decimal(
                            str(
                                confidence
                                if confidence is not None
                                else current["confidence"]
                            )
                        ),
                        status="active",
                        version=int(current["version"]) + 1,
                        supersedes_memory_id=memory_id,
                        learner_corrected=True,
                        embedding_v2=embedding,
                        embedding_version=embedding_model,
                    )
                    .returning(learner_memories)
                )
                row = insert_result.mappings().one()
                await connection.execute(
                    sa.update(learner_memories)
                    .where(learner_memories.c.id == memory_id)
                    .values(
                        status="archived",
                        updated_at=sa.func.now(),
                        archived_at=sa.func.now(),
                    )
                )
                for link in evidence_links:
                    await connection.execute(
                        sa.insert(memory_evidence_links).values(
                            memory_id=new_id,
                            evidence_id=link["evidence_id"],
                            support_strength=link["support_strength"],
                        )
                    )
            except IntegrityError as error:
                raise MemoryConflictError from error
            return await self._stored_memory(connection, row)

    async def archive_memory(
        self, learner_id: UUID, memory_id: UUID
    ) -> StoredMemory | None:
        return await self._set_memory_status(learner_id, memory_id, "archived")

    async def restore_memory(
        self, learner_id: UUID, memory_id: UUID
    ) -> StoredMemory | None:
        evidence_exists = sa.exists(
            sa.select(1).where(memory_evidence_links.c.memory_id == memory_id)
        )
        async with self.engine.begin() as connection:
            result = await connection.execute(
                sa.update(learner_memories)
                .where(
                    learner_memories.c.id == memory_id,
                    learner_memories.c.learner_id == learner_id,
                    evidence_exists,
                )
                .values(
                    status="active",
                    archived_at=None,
                    updated_at=sa.func.now(),
                )
                .returning(learner_memories)
            )
            row = result.mappings().first()
            if row is None:
                return None
            return await self._stored_memory(connection, row)

    async def _set_memory_status(
        self, learner_id: UUID, memory_id: UUID, status: MemoryStatus
    ) -> StoredMemory | None:
        values: dict[str, Any] = {
            "status": status,
            "updated_at": sa.func.now(),
        }
        values["archived_at"] = sa.func.now() if status == "archived" else None
        async with self.engine.begin() as connection:
            result = await connection.execute(
                sa.update(learner_memories)
                .where(
                    learner_memories.c.id == memory_id,
                    learner_memories.c.learner_id == learner_id,
                )
                .values(**values)
                .returning(learner_memories)
            )
            row = result.mappings().first()
            if row is None:
                return None
            return await self._stored_memory(connection, row)

    async def delete_memory(self, learner_id: UUID, memory_id: UUID) -> bool:
        async with self.engine.begin() as connection:
            result = await connection.execute(
                sa.delete(learner_memories).where(
                    learner_memories.c.id == memory_id,
                    learner_memories.c.learner_id == learner_id,
                )
            )
        return bool(result.rowcount)

    async def _delete_rows(
        self,
        connection: Any,
        table: sa.Table,
        conditions: Sequence[Any],
    ) -> int:
        where_clause = sa.and_(*conditions)
        count = int(
            await connection.scalar(
                sa.select(sa.func.count()).select_from(table).where(where_clause)
            )
            or 0
        )
        await connection.execute(sa.delete(table).where(where_clause))
        return count

    async def _delete_scoped_data(
        self,
        learner_id: UUID,
        evidence_filter: Any | None,
        *,
        delete_all_memories: bool,
    ) -> CleanupCounts:
        evidence_conditions: list[Any] = [memory_evidence.c.learner_id == learner_id]
        if evidence_filter is not None:
            evidence_conditions.append(evidence_filter)

        async with self.engine.begin() as connection:
            evidence_result = await connection.execute(
                sa.select(memory_evidence.c.id).where(*evidence_conditions)
            )
            evidence_ids = [row[0] for row in evidence_result]

            memory_result = await connection.execute(
                sa.select(memory_evidence_links.c.memory_id)
                .distinct()
                .select_from(
                    memory_evidence_links.join(
                        memory_evidence,
                        memory_evidence_links.c.evidence_id == memory_evidence.c.id,
                    )
                )
                .where(*evidence_conditions)
            )
            linked_memory_ids = [row[0] for row in memory_result]

            if evidence_ids:
                deleted_summaries = await self._delete_rows(
                    connection,
                    reflection_summaries,
                    [
                        reflection_summaries.c.learner_id == learner_id,
                        reflection_summaries.c.evidence_id.in_(evidence_ids),
                    ],
                )
                deleted_jobs = await self._delete_rows(
                    connection,
                    memory_processing_outbox,
                    [
                        memory_processing_outbox.c.learner_id == learner_id,
                        memory_processing_outbox.c.evidence_id.in_(evidence_ids),
                    ],
                )
                deleted_evidence = await self._delete_rows(
                    connection,
                    memory_evidence,
                    [
                        memory_evidence.c.learner_id == learner_id,
                        memory_evidence.c.id.in_(evidence_ids),
                    ],
                )
            else:
                deleted_summaries = 0
                deleted_jobs = 0
                deleted_evidence = 0

            if delete_all_memories:
                memory_conditions: list[Any] = [
                    learner_memories.c.learner_id == learner_id
                ]
                orphan_memory_ids: list[UUID] = []
            elif linked_memory_ids:
                remaining_link = sa.exists(
                    sa.select(1).where(
                        memory_evidence_links.c.memory_id == learner_memories.c.id
                    )
                )
                orphan_result = await connection.execute(
                    sa.select(learner_memories.c.id).where(
                        learner_memories.c.learner_id == learner_id,
                        learner_memories.c.id.in_(linked_memory_ids),
                        sa.not_(remaining_link),
                    )
                )
                orphan_memory_ids = [row[0] for row in orphan_result]
                memory_conditions = [
                    learner_memories.c.learner_id == learner_id,
                    learner_memories.c.id.in_(orphan_memory_ids),
                ]
            else:
                orphan_memory_ids = []
                memory_conditions = []

            if memory_conditions:
                deleted_memories = await self._delete_rows(
                    connection,
                    learner_memories,
                    memory_conditions,
                )
            else:
                deleted_memories = 0

            audit_conditions: list[Any] = [
                memory_generation_audits.c.learner_id == learner_id
            ]
            if not delete_all_memories:
                audit_references: list[Any] = []
                if evidence_ids:
                    audit_references.append(
                        memory_generation_audits.c.evidence_id.in_(evidence_ids)
                    )
                if orphan_memory_ids:
                    audit_references.append(
                        memory_generation_audits.c.memory_id.in_(orphan_memory_ids)
                    )
                if not audit_references:
                    audit_conditions = []
                else:
                    audit_conditions.append(sa.or_(*audit_references))

            if audit_conditions:
                deleted_audits = await self._delete_rows(
                    connection,
                    memory_generation_audits,
                    audit_conditions,
                )
            else:
                deleted_audits = 0

        return CleanupCounts(
            deleted_memories=deleted_memories,
            deleted_evidence=deleted_evidence,
            deleted_summaries=deleted_summaries,
            deleted_jobs=deleted_jobs,
            deleted_audits=deleted_audits,
        )

    async def delete_note_derived_data(self, learner_id: UUID) -> CleanupCounts:
        return await self._delete_scoped_data(
            learner_id,
            memory_evidence.c.has_note.is_(True),
            delete_all_memories=False,
        )

    async def delete_profile_preference_data(self, learner_id: UUID) -> CleanupCounts:
        return await self._delete_scoped_data(
            learner_id,
            memory_evidence.c.evidence_type == "profile_preference",
            delete_all_memories=False,
        )

    async def delete_problem_evidence(
        self,
        learner_id: UUID,
        problem_provider: str,
        problem_external_id: str,
    ) -> CleanupCounts:
        return await self._delete_scoped_data(
            learner_id,
            sa.and_(
                memory_evidence.c.problem_provider == problem_provider,
                memory_evidence.c.problem_external_id == problem_external_id,
            ),
            delete_all_memories=False,
        )

    async def delete_learner_data(self, learner_id: UUID) -> CleanupCounts:
        return await self._delete_scoped_data(
            learner_id,
            None,
            delete_all_memories=True,
        )


class MemoryRepositoryError(RuntimeError):
    pass


class MemoryStorageError(MemoryRepositoryError):
    pass


class MemoryOwnershipError(MemoryRepositoryError):
    pass


class MemoryConflictError(MemoryRepositoryError):
    pass


class NullMemoryRepository:
    def __getattr__(self, name: str) -> Any:
        async def unavailable(*args: Any, **kwargs: Any) -> Any:
            del args, kwargs
            raise MemoryStorageError(
                f"Memory persistence is unavailable for operation {name}."
            )

        return unavailable


@lru_cache
def get_memory_repository() -> MemoryRepository | NullMemoryRepository:
    database_url = get_ai_settings().database_url
    if not database_url:
        logger.warning("Memory persistence disabled: DATABASE_URL not configured")
        return NullMemoryRepository()
    return MemoryRepository(shared_engine(database_url))
