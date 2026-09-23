from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import re
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from time import perf_counter
from uuid import UUID

from .memory_audit import (
    MemoryAudit,
    MemoryAuditRepository,
    NullMemoryAuditRepository,
    get_memory_audit_repository,
    safe_memory_log,
)
from .memory_consolidation import decayed_confidence
from .memory_model import (
    GeminiMemoryEmbedder,
    GeminiMemoryGenerationModel,
    MemoryEmbedder,
    MemoryEmbeddingError,
    MemoryGenerationModel,
    validate_model_result,
)
from .memory_models import (
    GeneratedMemory,
    MemoryActionResponse,
    MemoryConsolidationRequest,
    MemoryConsolidationResponse,
    MemoryCorrectionRequest,
    MemoryFallbackReason,
    MemoryProcessRequest,
    MemoryProcessResponse,
    MemoryProposalRequest,
    MemoryRetrievalResponse,
    ReflectionGenerationOutput,
    StoredMemory,
)
from .memory_repository import (
    CleanupCounts,
    EvidenceReceipt,
    MemoryConflictError,
    MemoryRepository,
    MemoryStorageError,
    NullMemoryRepository,
    PersistedMemory,
    get_memory_repository,
)
from .memory_safety import (
    contains_sensitive_text,
    keyed_payload_hash,
    memory_key,
    model_payload,
    redact_structured_value,
    redact_text,
    redacted_evidence_payload,
    validate_generation_output,
)
from .settings import AiSettings, get_ai_settings

AUTO_MEMORY_CATEGORIES = {
    "preference",
    "difficulty_calibration",
    "topic_weakness",
    "scheduling_preference",
    "recommendation_feedback_pattern",
    "learning_goal",
    "topic_strength",
    "coding_style",
    "problem_solving_approach",
    "learning_pace",
    "time_availability",
    "mistake_pattern",
    "contest_performance",
    "explanation_preference",
    "communication_preference",
    "user_instruction",
    "conversation_summary",
    "learning_milestone",
    "bloom_level",
    "spaced_repetition_state",
}
AUTO_MEMORY_EVIDENCE_TYPES = {
    "reflection",
    "manual_progress",
    "recommendation_feedback",
    "profile_preference",
    "bookmark",
    "coach_conversation",
    "hint_ladder_outcome",
    "contest_performance",
    "frustration",
    "provider_activity",
}
MEMORY_GENERATION_INVALID_ERRORS = (TypeError, ValueError, MemoryEmbeddingError)


def _dedupe_memories(memories: list[StoredMemory], limit: int) -> list[StoredMemory]:
    seen: set[UUID] = set()
    result: list[StoredMemory] = []
    for memory in memories:
        if memory.id in seen:
            continue
        seen.add(memory.id)
        result.append(memory)
        if len(result) >= limit:
            break
    return result


def _decay_retrieved_memories(
    memories: list[StoredMemory], *, now: datetime | None = None
) -> list[StoredMemory]:
    return [
        memory.model_copy(update={"confidence": decayed_confidence(memory, now=now)})
        for memory in memories
    ]


@dataclass(frozen=True)
class GeneratedMemoryBatch:
    output: ReflectionGenerationOutput
    input_tokens: int | None
    output_tokens: int | None
    fallback: bool
    fallback_reason: MemoryFallbackReason | None


@dataclass(frozen=True)
class EligibleMemory:
    memory: GeneratedMemory
    has_consistent_support: bool


class MemoryNotConfiguredError(RuntimeError):
    pass


class MemoryNotFoundError(RuntimeError):
    pass


class MemoryService:
    def __init__(
        self,
        settings: AiSettings,
        repository: MemoryRepository | NullMemoryRepository,
        audit_repository: MemoryAuditRepository | NullMemoryAuditRepository,
        model: MemoryGenerationModel | None = None,
        embedder: MemoryEmbedder | None = None,
    ) -> None:
        self.settings = settings
        self.repository = repository
        self.audit_repository = audit_repository
        self.model = model
        self.embedder = embedder

    @staticmethod
    def request_identifier(request: MemoryProcessRequest) -> str:
        return request.requestId or request.idempotencyKey

    def get_model(self) -> MemoryGenerationModel:
        if self.model is not None:
            return self.model
        if not self.settings.llm_api_key:
            raise MemoryNotConfiguredError
        self.model = GeminiMemoryGenerationModel(self.settings)
        return self.model

    def get_embedder(self) -> MemoryEmbedder:
        if self.embedder is not None:
            return self.embedder
        if not self.settings.llm_api_key:
            raise MemoryNotConfiguredError
        self.embedder = GeminiMemoryEmbedder(self.settings)
        return self.embedder

    def fallback_output(
        self, request: MemoryProcessRequest
    ) -> ReflectionGenerationOutput:
        signals: list[str] = []
        memories: list[GeneratedMemory] = []
        difficulty = request.perceivedDifficulty
        feedback = request.feedback
        if difficulty is not None:
            label = difficulty.replace("_", " ")
            signals.append(f"Learner reported the practice difficulty as {label}.")
            memories.append(
                GeneratedMemory(
                    category="difficulty_calibration",
                    statement=f"Practice difficulty was reported as {label}.",
                    structuredValue={"perceivedDifficulty": difficulty},
                    confidence=min(0.9, request.evidenceStrength),
                )
            )
        if request.explicitPreference is not None:
            preference = redact_text(request.explicitPreference, 500)
            if preference:
                signals.append("The learner saved a recommendation preference.")
                statement_preference = preference[:430].rstrip()
                memories.append(
                    GeneratedMemory(
                        category="preference",
                        statement=(
                            "The learner prefers recommendations that reflect: "
                            f"{statement_preference}"
                        ),
                        structuredValue={"preference": preference},
                        confidence=min(1.0, request.evidenceStrength),
                    )
                )
        if request.topic is not None and difficulty in {"hard", "too_hard"}:
            signals.append(f"The learner reported difficulty with {request.topic}.")
            memories.append(
                GeneratedMemory(
                    category="topic_weakness",
                    statement=(
                        f"The learner may need more guided practice with "
                        f"{request.topic}."
                    ),
                    structuredValue={"topic": request.topic},
                    confidence=min(0.85, request.evidenceStrength),
                )
            )
        if feedback is not None:
            label = feedback.replace("_", " ")
            signals.append(f"Recommendation feedback was marked {label}.")
            memories.append(
                GeneratedMemory(
                    category="recommendation_feedback_pattern",
                    statement=f"Recommendation feedback was marked {label}.",
                    structuredValue={"feedback": feedback},
                    confidence=min(0.9, request.evidenceStrength),
                )
            )
        if request.timeSpentMinutes is not None:
            signals.append(
                f"The learner recorded {request.timeSpentMinutes} minutes of work."
            )
        if request.note:
            note = redact_text(request.note, 500)
            if note and re.search(
                r"\b(always|never|don't|do not|avoid|prefer|focus|want)\b",
                note,
                re.IGNORECASE,
            ):
                signals.append(
                    "The learner provided a persistent coaching instruction."
                )
                memories.append(
                    GeneratedMemory(
                        category="user_instruction",
                        statement=f"Learner instruction: {note[:430].rstrip()}",
                        structuredValue={"instruction": note},
                        confidence=min(1.0, request.evidenceStrength),
                    )
                )
            elif note and not signals:
                signals.append("The learner provided a reflection.")
        if signals:
            summary = " ".join(signals)[:800]
        else:
            summary = f"Recorded {request.evidenceType} evidence without a reflection."
        return ReflectionGenerationOutput(
            summary=summary,
            keySignals=signals[:8],
            memories=memories[:8],
        )

    async def generate_batch(
        self, request: MemoryProcessRequest
    ) -> GeneratedMemoryBatch:
        if not self.settings.memory_generation_enabled:
            return GeneratedMemoryBatch(
                output=ReflectionGenerationOutput(
                    summary="Memory generation is disabled.",
                    keySignals=[],
                    memories=[],
                ),
                input_tokens=None,
                output_tokens=None,
                fallback=True,
                fallback_reason="not_configured",
            )
        has_learner_evidence = any(
            (
                request.note,
                request.perceivedDifficulty,
                request.timeSpentMinutes is not None,
                request.feedback,
                request.explicitPreference,
                request.topic,
                request.problemStatus,
            )
        )
        if (
            request.evidenceType not in AUTO_MEMORY_EVIDENCE_TYPES
            or not has_learner_evidence
        ):
            return GeneratedMemoryBatch(
                output=self.fallback_output(request),
                input_tokens=None,
                output_tokens=None,
                fallback=True,
                fallback_reason="not_eligible",
            )
        try:
            model = self.get_model()
            async with asyncio.timeout(self.settings.llm_timeout_seconds):
                result = await model.generate(request, model_payload(request))
            output = validate_model_result(result)
            validate_generation_output(output)
            return GeneratedMemoryBatch(
                output=output,
                input_tokens=result.input_tokens,
                output_tokens=result.output_tokens,
                fallback=False,
                fallback_reason=None,
            )
        except MemoryNotConfiguredError:
            reason: MemoryFallbackReason = "not_configured"
        except TimeoutError:
            reason = "timeout"
        except MEMORY_GENERATION_INVALID_ERRORS:
            reason = "invalid_output"
        except asyncio.CancelledError:
            raise
        except Exception as error:
            if isinstance(error, asyncio.CancelledError):
                raise
            reason = "provider_error"
        safe_memory_log(
            "ai_memory_generation_fallback",
            {
                "requestId": self.request_identifier(request),
                "fallbackReason": reason,
            },
        )
        return GeneratedMemoryBatch(
            output=self.fallback_output(request),
            input_tokens=None,
            output_tokens=None,
            fallback=True,
            fallback_reason=reason,
        )

    async def eligible_memories(
        self,
        request: MemoryProcessRequest,
        output: ReflectionGenerationOutput,
        current_evidence_id: UUID | None = None,
    ) -> list[EligibleMemory]:
        if request.evidenceType not in AUTO_MEMORY_EVIDENCE_TYPES:
            return []
        candidate_memories = list(output.memories)
        if request.explicitPreference is not None:
            candidate_memories = [
                memory
                for memory in candidate_memories
                if memory.category != "preference"
            ]
            candidate_memories.extend(
                memory
                for memory in self.fallback_output(request).memories
                if memory.category == "preference"
            )
        eligible: list[EligibleMemory] = []
        support_checker = getattr(self.repository, "has_consistent_support", None)
        for memory in candidate_memories:
            if memory.category not in AUTO_MEMORY_CATEGORIES:
                continue
            if request.evidenceStrength < self.settings.memory_min_evidence_strength:
                continue
            if memory.confidence < self.settings.memory_proposed_min_confidence:
                continue
            is_explicit_preference = (
                memory.category == "preference"
                and request.explicitPreference is not None
            )
            has_support = is_explicit_preference
            if not has_support and memory.structuredValue and callable(support_checker):
                has_support = await support_checker(
                    request.learnerId,
                    memory.category,
                    memory.structuredValue,
                    current_evidence_id,
                )
            eligible.append(
                EligibleMemory(memory=memory, has_consistent_support=has_support)
            )
        return eligible

    async def embed_memories(
        self, memories: list[GeneratedMemory]
    ) -> tuple[list[list[float] | None], bool]:
        if not memories:
            return [], False
        if not self.settings.memory_rag_enabled:
            return [None] * len(memories), True
        try:
            embedder = self.get_embedder()
        except MemoryNotConfiguredError:
            return [None] * len(memories), True

        async def embed_one(memory: GeneratedMemory) -> list[float]:
            async with asyncio.timeout(self.settings.embedding_timeout_seconds):
                return await embedder.embed(
                    memory.statement, task_type="RETRIEVAL_DOCUMENT"
                )

        results = await asyncio.gather(
            *(embed_one(memory) for memory in memories), return_exceptions=True
        )
        embeddings: list[list[float] | None] = []
        failed = False
        for result in results:
            if isinstance(result, asyncio.CancelledError):
                raise result
            if isinstance(result, Exception):
                failed = True
                embeddings.append(None)
            else:
                embeddings.append(result)
        return embeddings, failed

    async def save_audit(self, audit: MemoryAudit, request_id: str) -> UUID | None:
        try:
            async with asyncio.timeout(self.settings.memory_audit_timeout_seconds):
                return await self.audit_repository.save(audit)
        except asyncio.CancelledError:
            raise
        except TimeoutError:
            safe_memory_log(
                "ai_memory_audit_failed",
                {"requestId": request_id, "errorCode": "AUDIT_TIMEOUT"},
            )
        except Exception as error:
            if isinstance(error, asyncio.CancelledError):
                raise
            safe_memory_log("ai_memory_audit_failed", {"requestId": request_id})
        return None

    def estimated_cost(
        self, input_tokens: int | None, output_tokens: int | None
    ) -> Decimal | None:
        if input_tokens is None or output_tokens is None:
            return None
        million = Decimal(1_000_000)
        return (
            Decimal(input_tokens)
            * self.settings.llm_input_price_per_million_usd
            / million
            + Decimal(output_tokens)
            * self.settings.llm_output_price_per_million_usd
            / million
        ).quantize(Decimal("0.00000001"))

    async def process(self, request: MemoryProcessRequest) -> MemoryProcessResponse:
        request_id = self.request_identifier(request)
        receipt = await self.repository.record_evidence(
            request, redacted_evidence_payload(request)
        )
        if not receipt.created and not receipt.reprocess:
            existing = await self.repository.processing_result(
                request.learnerId, receipt.evidence_id
            )
            if existing is not None:
                return MemoryProcessResponse(
                    requestId=request_id,
                    learnerId=request.learnerId,
                    evidenceId=receipt.evidence_id,
                    jobId=receipt.job_id,
                    status="already_processed",
                    idempotent=True,
                    summaryId=existing.summary_id,
                    memoryIds=existing.memory_ids,
                )

        claim = await self.repository.claim_job(receipt.job_id)
        if not claim.claimed:
            if claim.status == "failed":
                raise MemoryStorageError(
                    "Memory processing has exhausted its retry attempts."
                )
            return MemoryProcessResponse(
                requestId=request_id,
                learnerId=request.learnerId,
                evidenceId=receipt.evidence_id,
                jobId=receipt.job_id,
                status="already_processing",
                idempotent=not receipt.created,
            )

        started = perf_counter()
        try:
            batch = await self.generate_batch(request)
            selected = (
                []
                if not self.settings.memory_generation_enabled
                else await self.eligible_memories(
                    request, batch.output, receipt.evidence_id
                )
            )
            selected_memories = [item.memory for item in selected]
            embeddings, embedding_fallback = await self.embed_memories(
                selected_memories
            )
            persisted_memories = [
                PersistedMemory(
                    memory_key=memory_key(
                        item.memory.category,
                        item.memory.statement,
                        item.memory.structuredValue,
                    ),
                    category=item.memory.category,
                    statement=item.memory.statement,
                    structured_value=item.memory.structuredValue,
                    confidence=item.memory.confidence,
                    embedding=embedding,
                    embedding_model=(
                        self.settings.embedding_model if embedding is not None else None
                    ),
                    status=(
                        "active"
                        if (
                            item.has_consistent_support
                            and item.memory.confidence
                            >= self.settings.memory_min_confidence
                        )
                        else "proposed"
                    ),
                )
                for item, embedding in zip(selected, embeddings, strict=True)
            ]
            input_hash = keyed_payload_hash(
                model_payload(request), self.settings.internal_service_token
            )
            output_hash = keyed_payload_hash(
                batch.output.model_dump(), self.settings.internal_service_token
            )
            persisted = await self.repository.persist_generation(
                job_id=receipt.job_id,
                learner_id=request.learnerId,
                evidence_id=receipt.evidence_id,
                output=batch.output,
                memories=persisted_memories,
                model=self.settings.llm_model,
                generation_version=self.settings.memory_generation_version,
                input_hash=input_hash,
                consent_policy_version=self.settings.consent_policy_version,
                prompt_version=self.settings.memory_prompt_version,
                input_tokens=batch.input_tokens,
                output_tokens=batch.output_tokens,
                estimated_cost_usd=self.estimated_cost(
                    batch.input_tokens, batch.output_tokens
                ),
                lease_started_at=claim.lease_started_at,
            )
        except asyncio.CancelledError:
            raise
        except MemoryStorageError:
            await self._mark_failed(
                receipt,
                request_id,
                "STORAGE_UNAVAILABLE",
                claim.lease_started_at,
            )
            raise
        except Exception as error:
            if isinstance(error, asyncio.CancelledError):
                raise
            await self._mark_failed(
                receipt,
                request_id,
                "MEMORY_PROCESSING_FAILED",
                claim.lease_started_at,
            )
            raise MemoryStorageError("Memory processing could not be persisted.")

        latency_ms = max(0, round((perf_counter() - started) * 1000))
        audit = MemoryAudit(
            request_id=request_id,
            learner_id=request.learnerId,
            evidence_id=receipt.evidence_id,
            action="process",
            model=self.settings.llm_model,
            generation_version=self.settings.memory_generation_version,
            embedding_model=self.settings.embedding_model
            if not embedding_fallback
            else None,
            fallback=batch.fallback,
            fallback_reason=batch.fallback_reason,
            latency_ms=latency_ms,
            input_tokens=batch.input_tokens,
            output_tokens=batch.output_tokens,
            estimated_cost_usd=self.estimated_cost(
                batch.input_tokens, batch.output_tokens
            ),
            memory_ids=[str(memory_id) for memory_id in persisted.memory_ids],
            input_hash=input_hash,
            output_hash=output_hash,
        )
        audit_id = await self.save_audit(audit, request_id)
        return MemoryProcessResponse(
            requestId=request_id,
            learnerId=request.learnerId,
            evidenceId=receipt.evidence_id,
            jobId=receipt.job_id,
            status="processed",
            idempotent=not receipt.created and not receipt.reprocess,
            summaryId=persisted.summary_id,
            memoryIds=persisted.memory_ids,
            fallback=batch.fallback,
            fallbackReason=batch.fallback_reason,
            embeddingFallback=embedding_fallback,
            auditId=audit_id,
        )

    async def _mark_failed(
        self,
        receipt: EvidenceReceipt,
        request_id: str,
        error_code: str,
        lease_started_at: datetime | None = None,
    ) -> None:
        try:
            await self.repository.mark_job_failed(
                receipt.job_id,
                error_code,
                lease_started_at,
            )
        except Exception as error:
            if isinstance(error, asyncio.CancelledError):
                raise
            safe_memory_log(
                "ai_memory_job_update_failed",
                {"requestId": request_id, "errorCode": error_code},
            )

    async def retrieve(
        self, learner_id: UUID, query: str | None, limit: int
    ) -> MemoryRetrievalResponse:
        bounded_limit = min(self.settings.memory_retrieval_limit, limit, 20)
        clean_query = None if query is None else redact_text(query, 500)
        always_include: list[StoredMemory] = []
        list_by_category = getattr(self.repository, "list_memories_by_category", None)
        if callable(list_by_category):
            try:
                always_include = await list_by_category(
                    learner_id,
                    categories=["user_instruction", "preference"],
                    status="active",
                    limit=min(5, bounded_limit),
                )
            except asyncio.CancelledError:
                raise
            except (OSError, RuntimeError, TypeError, ValueError) as error:
                safe_memory_log(
                    "memory_instruction_retrieval_failed",
                    {"errorType": type(error).__name__},
                )
                always_include = []
        if not always_include:
            list_memories = getattr(self.repository, "list_memories", None)
            if callable(list_memories):
                try:
                    all_memories = await list_memories(learner_id)
                    always_include = [
                        memory
                        for memory in all_memories
                        if memory.status == "active"
                        and memory.category in {"user_instruction", "preference"}
                    ][: min(5, bounded_limit)]
                except asyncio.CancelledError:
                    raise
                except (OSError, RuntimeError, TypeError, ValueError) as error:
                    safe_memory_log(
                        "memory_category_retrieval_failed",
                        {"errorType": type(error).__name__},
                    )
        if clean_query:
            try:
                embedder = self.get_embedder()
                async with asyncio.timeout(self.settings.embedding_timeout_seconds):
                    embedding = await embedder.embed(
                        clean_query, task_type="RETRIEVAL_QUERY"
                    )
            except asyncio.CancelledError:
                raise
            except Exception as error:
                if isinstance(error, asyncio.CancelledError):
                    raise
                embedding = None
            if embedding is not None:
                try:
                    items = await self.repository.search_vector(
                        learner_id,
                        embedding,
                        limit=bounded_limit,
                        confidence_threshold=self.settings.memory_min_confidence,
                        similarity_threshold=self.settings.memory_similarity_threshold,
                    )
                    keyword_items: list[StoredMemory] = []
                    search_sql = getattr(self.repository, "search_sql", None)
                    if callable(search_sql) and clean_query:
                        try:
                            keyword_items = await search_sql(
                                learner_id,
                                query=clean_query,
                                limit=bounded_limit,
                                confidence_threshold=self.settings.memory_min_confidence,
                            )
                        except TypeError:
                            keyword_items = await search_sql(
                                learner_id,
                                limit=bounded_limit,
                                confidence_threshold=self.settings.memory_min_confidence,
                            )
                        except OSError, RuntimeError, ValueError:
                            keyword_items = []
                    if items or keyword_items:
                        combined = _dedupe_memories(
                            [*always_include, *items, *keyword_items], bounded_limit
                        )
                        return MemoryRetrievalResponse(
                            learnerId=learner_id,
                            query=clean_query,
                            retrievalMode="vector",
                            items=_decay_retrieved_memories(combined),
                        )
                except asyncio.CancelledError:
                    raise
                except Exception as error:
                    if isinstance(error, asyncio.CancelledError):
                        raise
                    safe_memory_log(
                        "ai_memory_vector_search_fallback",
                        {"learnerId": str(learner_id)},
                    )
        try:
            try:
                items = await self.repository.search_sql(
                    learner_id,
                    query=clean_query,
                    limit=bounded_limit,
                    confidence_threshold=self.settings.memory_min_confidence,
                )
            except TypeError:
                items = await self.repository.search_sql(
                    learner_id,
                    limit=bounded_limit,
                    confidence_threshold=self.settings.memory_min_confidence,
                )
        except MemoryStorageError:
            raise
        except Exception as error:
            raise MemoryStorageError("Memory retrieval is unavailable.") from error
        return MemoryRetrievalResponse(
            learnerId=learner_id,
            query=clean_query,
            retrievalMode="sql",
            items=_decay_retrieved_memories(
                _dedupe_memories([*always_include, *items], bounded_limit)
            ),
        )

    async def list_memories(self, learner_id: UUID) -> list[StoredMemory]:
        return await self.repository.list_memories(learner_id)

    async def consolidate(
        self, learner_id: UUID, request: MemoryConsolidationRequest
    ) -> MemoryConsolidationResponse:
        cleaned = redact_text(request.statement, 500)
        if cleaned != request.statement or contains_sensitive_text(cleaned):
            raise MemoryConflictError(
                "A consolidated memory contains text that cannot be retained safely."
            )
        consolidate = getattr(self.repository, "consolidate_memories", None)
        if not callable(consolidate):
            raise MemoryStorageError("Memory consolidation is unavailable.")
        memory = await consolidate(
            learner_id,
            memory_ids=request.memoryIds,
            statement_text=cleaned,
            category=request.category,
            confidence=request.confidence,
        )
        if memory is None:
            raise MemoryConflictError("The source memories are no longer active.")
        return MemoryConsolidationResponse(requestId=request.requestId, memory=memory)

    async def propose(
        self, learner_id: UUID, request: MemoryProposalRequest
    ) -> MemoryActionResponse:
        """Persist a coach-suggested memory in the proposed state.

        The core service has already authenticated the learner and required a
        separate confirmation click.  We still run the same privacy redaction
        and validation here because this endpoint is an internal trust boundary.
        """
        cleaned = redact_text(request.statement, 500)
        if (
            not cleaned
            or cleaned != request.statement
            or contains_sensitive_text(cleaned)
        ):
            raise MemoryConflictError(
                "A memory proposal contains text that cannot be retained safely."
            )
        memory, created = await self.repository.create_proposed_memory(
            learner_id,
            memory_key=memory_key(request.category, cleaned),
            category=request.category,
            statement=cleaned,
            confidence=0.5,
            request_id=request.requestId,
        )
        audit_id = await self._save_control_audit(
            request.requestId, learner_id, memory, "propose"
        )
        return MemoryActionResponse(
            requestId=request.requestId,
            action="propose",
            idempotent=not created,
            memory=memory,
            auditId=audit_id,
        )

    async def _save_control_audit(
        self,
        request_id: str,
        learner_id: UUID,
        memory: StoredMemory,
        action: str,
    ) -> UUID | None:
        output_hash = hmac.new(
            (self.settings.internal_service_token or "memory-control").encode(),
            json.dumps(
                {
                    "category": memory.category,
                    "statement": memory.statement,
                },
                separators=(",", ":"),
                sort_keys=True,
            ).encode(),
            hashlib.sha256,
        ).hexdigest()
        return await self.save_audit(
            MemoryAudit(
                request_id=request_id,
                learner_id=learner_id,
                memory_id=memory.id,
                action=action,
                model="user-control",
                generation_version=self.settings.memory_generation_version,
                fallback=False,
                fallback_reason=None,
                latency_ms=0,
                memory_ids=[str(memory.id)],
                output_hash=output_hash,
            ),
            request_id,
        )

    async def correct(
        self,
        learner_id: UUID,
        memory_id: UUID,
        request: MemoryCorrectionRequest,
    ) -> MemoryActionResponse:
        current = await self.repository.get_memory(learner_id, memory_id)
        if current is None:
            raise MemoryNotFoundError
        corrected_statement = redact_text(request.statement, 500)
        corrected_structured_value = redact_structured_value(
            request.structuredValue or current.structuredValue
        )
        embedding_values, embedding_fallback = await self.embed_memories(
            [
                GeneratedMemory(
                    category=request.category or current.category,
                    statement=corrected_statement,
                    structuredValue=corrected_structured_value,
                    confidence=1.0,
                )
            ]
        )
        corrected_embedding = embedding_values[0]
        corrected = await self.repository.correct_memory(
            learner_id,
            memory_id,
            memory_key=memory_key(
                request.category or current.category,
                corrected_statement,
                corrected_structured_value,
            ),
            statement_text=corrected_statement,
            category=request.category or current.category,
            structured_value=corrected_structured_value,
            confidence=request.confidence,
            embedding=corrected_embedding,
            embedding_model=(
                self.settings.embedding_model
                if not embedding_fallback and corrected_embedding is not None
                else None
            ),
        )
        if corrected is None:
            raise MemoryNotFoundError
        audit_id = await self._save_control_audit(
            request.requestId, learner_id, corrected, "correct"
        )
        return MemoryActionResponse(
            requestId=request.requestId,
            action="correct",
            memory=corrected,
            auditId=audit_id,
        )

    async def archive(
        self, learner_id: UUID, memory_id: UUID, request_id: str
    ) -> MemoryActionResponse:
        current = await self.repository.get_memory(learner_id, memory_id)
        if current is None:
            raise MemoryNotFoundError
        memory = await self.repository.archive_memory(learner_id, memory_id)
        if memory is None:
            raise MemoryNotFoundError
        audit_id = await self._save_control_audit(
            request_id, learner_id, memory, "archive"
        )
        return MemoryActionResponse(
            requestId=request_id,
            action="archive",
            idempotent=current.status == "archived",
            memory=memory,
            auditId=audit_id,
        )

    async def approve(
        self, learner_id: UUID, memory_id: UUID, request_id: str
    ) -> MemoryActionResponse:
        current = await self.repository.get_memory(learner_id, memory_id)
        if current is None:
            raise MemoryNotFoundError
        if current.status == "active":
            return MemoryActionResponse(
                requestId=request_id,
                action="approve",
                idempotent=True,
                memory=current,
            )
        memory = await self.repository.restore_memory(learner_id, memory_id)
        if memory is None:
            raise MemoryConflictError("A memory cannot be approved without evidence.")
        audit_id = await self._save_control_audit(
            request_id, learner_id, memory, "approve"
        )
        return MemoryActionResponse(
            requestId=request_id,
            action="approve",
            memory=memory,
            auditId=audit_id,
        )

    async def restore(
        self, learner_id: UUID, memory_id: UUID, request_id: str
    ) -> MemoryActionResponse:
        current = await self.repository.get_memory(learner_id, memory_id)
        if current is None:
            raise MemoryNotFoundError
        memory = await self.repository.restore_memory(learner_id, memory_id)
        if memory is None:
            raise MemoryConflictError("A memory cannot be restored without evidence.")
        audit_id = await self._save_control_audit(
            request_id, learner_id, memory, "restore"
        )
        return MemoryActionResponse(
            requestId=request_id,
            action="restore",
            idempotent=current.status == "active",
            memory=memory,
            auditId=audit_id,
        )

    async def delete(
        self, learner_id: UUID, memory_id: UUID, request_id: str
    ) -> MemoryActionResponse:
        current = await self.repository.get_memory(learner_id, memory_id)
        if current is None:
            raise MemoryNotFoundError
        audit_id = await self._save_control_audit(
            request_id, learner_id, current, "delete"
        )
        deleted = await self.repository.delete_memory(learner_id, memory_id)
        if not deleted:
            raise MemoryNotFoundError
        return MemoryActionResponse(
            requestId=request_id,
            action="delete",
            idempotent=False,
            memory=None,
            auditId=audit_id,
        )

    async def cleanup(
        self, learner_id: UUID, request_id: str, reason: str
    ) -> CleanupCounts:
        del request_id
        if reason == "consent_revoked":
            delete_note_derived_data = getattr(
                self.repository, "delete_note_derived_data", None
            )
            if callable(delete_note_derived_data):
                return await delete_note_derived_data(learner_id)
        if reason == "profile_preference_changed":
            delete_profile_preference_data = getattr(
                self.repository, "delete_profile_preference_data", None
            )
            if callable(delete_profile_preference_data):
                return await delete_profile_preference_data(learner_id)
        return await self.repository.delete_learner_data(learner_id)

    async def delete_problem_evidence(
        self,
        learner_id: UUID,
        request_id: str,
        problem_provider: str,
        problem_external_id: str,
    ) -> CleanupCounts:
        del request_id
        return await self.repository.delete_problem_evidence(
            learner_id,
            problem_provider,
            problem_external_id,
        )


def get_memory_service() -> MemoryService:
    return MemoryService(
        get_ai_settings(),
        get_memory_repository(),
        get_memory_audit_repository(),
    )
