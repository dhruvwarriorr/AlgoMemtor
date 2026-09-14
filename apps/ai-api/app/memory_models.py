from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator

MemoryCategory = Literal[
    "preference",
    "difficulty_calibration",
    "topic_weakness",
    "scheduling_preference",
    "recommendation_feedback_pattern",
]
MemoryStatus = Literal["proposed", "active", "archived"]
MemoryAction = Literal["approve", "correct", "archive", "restore", "delete"]
EvidenceType = Literal[
    "reflection",
    "manual_progress",
    "recommendation_feedback",
    "profile_preference",
    "status_action",
    "timer",
    "bookmark",
    "outbound_open",
    "analytics",
]
MemoryFallbackReason = Literal[
    "not_configured",
    "timeout",
    "provider_error",
    "invalid_output",
    "embedding_unavailable",
    "not_eligible",
]
MemoryProcessingStatus = Literal[
    "processed",
    "already_processed",
    "already_processing",
]
RetrievalMode = Literal["vector", "sql"]
CleanupReason = Literal[
    "consent_revoked",
    "learner_deleted",
    "manual_request",
    "profile_preference_changed",
]
PerceivedDifficulty = Literal[
    "too_easy", "easy", "medium", "about_right", "hard", "too_hard"
]
FeedbackKind = Literal["useful", "not_useful", "too_easy", "about_right", "too_hard"]
ProblemStatus = Literal["unsolved", "attempted", "solved"]
Provider = Literal["codeforces"]
Topic = Annotated[
    str, Field(min_length=1, max_length=64, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
]


class MemoryStrictModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        populate_by_name=True,
    )


class MemoryProcessRequest(MemoryStrictModel):
    requestId: str | None = Field(
        default=None, min_length=1, max_length=160, pattern=r"^[A-Za-z0-9:_-]+$"
    )
    learnerId: UUID
    evidenceType: EvidenceType = Field(
        validation_alias=AliasChoices("evidenceType", "eventType")
    )
    evidenceId: UUID = Field(validation_alias=AliasChoices("evidenceId", "eventId"))
    idempotencyKey: str = Field(min_length=1, max_length=160, pattern=r"^\S+$")
    occurredAt: datetime = Field(default_factory=lambda: datetime.now(UTC))
    note: str | None = Field(default=None, min_length=1, max_length=1_000)
    perceivedDifficulty: PerceivedDifficulty | None = None
    timeSpentMinutes: int | None = Field(default=None, ge=0, le=1440)
    feedback: FeedbackKind | None = None
    explicitPreference: str | None = Field(default=None, min_length=1, max_length=500)
    topic: Topic | None = None
    problemProvider: Provider | None = None
    problemExternalId: str | None = Field(
        default=None, min_length=1, max_length=128, pattern=r"^\S+$"
    )
    problemStatus: ProblemStatus | None = None
    evidenceStrength: float = Field(default=1.0, ge=0, le=1)

    @model_validator(mode="after")
    def validate_evidence(self) -> MemoryProcessRequest:
        if self.occurredAt.tzinfo is None or self.occurredAt.utcoffset() is None:
            raise ValueError("occurredAt must include a timezone.")
        if (self.problemProvider is None) != (self.problemExternalId is None):
            raise ValueError(
                "problemProvider and problemExternalId must be supplied together."
            )
        if self.evidenceType == "outbound_open" and any(
            (
                self.note,
                self.perceivedDifficulty,
                self.timeSpentMinutes is not None,
                self.feedback,
                self.explicitPreference,
            )
        ):
            raise ValueError("An outbound open cannot carry reflection fields.")
        return self


class GeneratedMemory(MemoryStrictModel):
    category: MemoryCategory
    statement: str = Field(min_length=1, max_length=500)
    structuredValue: dict[str, str | int | float | bool] = Field(
        default_factory=dict, max_length=16
    )
    confidence: float = Field(ge=0, le=1)


class ReflectionGenerationOutput(MemoryStrictModel):
    summary: str = Field(min_length=1, max_length=800)
    keySignals: list[Annotated[str, Field(min_length=1, max_length=240)]] = Field(
        default_factory=list, max_length=8
    )
    memories: list[GeneratedMemory] = Field(default_factory=list, max_length=8)


class StoredMemory(MemoryStrictModel):
    id: UUID
    learnerId: UUID
    category: MemoryCategory
    statement: str = Field(min_length=1, max_length=500)
    structuredValue: dict[str, str | int | float | bool] = Field(
        default_factory=dict, max_length=16
    )
    confidence: float = Field(ge=0, le=1)
    status: MemoryStatus
    evidenceIds: list[UUID] = Field(min_length=1, max_length=64)
    version: int = Field(default=1, ge=1)
    supersedesMemoryId: UUID | None = None
    learnerCorrected: bool = False
    similarity: float | None = Field(default=None, ge=0, le=1)
    createdAt: datetime
    updatedAt: datetime


class MemoryProcessResponse(MemoryStrictModel):
    requestId: str = Field(min_length=1, max_length=160)
    learnerId: UUID
    evidenceId: UUID
    jobId: UUID
    status: MemoryProcessingStatus
    idempotent: bool
    summaryId: UUID | None = None
    memoryIds: list[UUID] = Field(default_factory=list, max_length=8)
    fallback: bool = False
    fallbackReason: MemoryFallbackReason | None = None
    embeddingFallback: bool = False
    auditId: UUID | None = None


class MemoryRetrievalResponse(MemoryStrictModel):
    learnerId: UUID
    query: str | None = None
    retrievalMode: RetrievalMode
    items: list[StoredMemory] = Field(max_length=5)


class MemoryCorrectionRequest(MemoryStrictModel):
    requestId: str = Field(min_length=1, max_length=160, pattern=r"^[A-Za-z0-9:_-]+$")
    statement: str = Field(min_length=1, max_length=500)
    category: MemoryCategory | None = None
    structuredValue: dict[str, str | int | float | bool] | None = Field(
        default=None, max_length=16
    )
    confidence: float | None = Field(default=None, ge=0, le=1)


class MemoryActionRequest(MemoryStrictModel):
    requestId: str = Field(min_length=1, max_length=160, pattern=r"^\S+$")


class MemoryDeleteRequest(MemoryStrictModel):
    learnerId: UUID
    idempotencyKey: str | None = Field(
        default=None, min_length=1, max_length=160, pattern=r"^\S+$"
    )
    reason: Literal["consent_revoked", "learner_deleted", "manual_request"] = (
        "learner_deleted"
    )


class MemoryEvidenceDeleteRequest(MemoryStrictModel):
    learnerId: UUID | None = None
    requestId: str = Field(min_length=1, max_length=160, pattern=r"^\S+$")
    problemProvider: Provider = Field(
        validation_alias=AliasChoices("problemProvider", "provider")
    )
    problemExternalId: str = Field(
        min_length=1,
        max_length=128,
        pattern=r"^\S+$",
        validation_alias=AliasChoices("problemExternalId", "externalId"),
    )


MemoryProblemEvidenceDeleteRequest = MemoryEvidenceDeleteRequest
ProblemEvidenceDeleteRequest = MemoryEvidenceDeleteRequest


class MemoryActionResponse(MemoryStrictModel):
    requestId: str = Field(min_length=1, max_length=160)
    action: MemoryAction
    idempotent: bool = False
    memory: StoredMemory | None = None
    auditId: UUID | None = None


class MemoryCleanupRequest(MemoryStrictModel):
    requestId: str = Field(min_length=1, max_length=160, pattern=r"^\S+$")
    reason: CleanupReason


class MemoryCleanupResponse(MemoryStrictModel):
    requestId: str = Field(min_length=1, max_length=160)
    learnerId: UUID
    reason: CleanupReason
    deletedMemories: int = Field(ge=0)
    deletedEvidence: int = Field(ge=0)
    deletedSummaries: int = Field(ge=0)
    deletedJobs: int = Field(ge=0)
    deletedAudits: int = Field(ge=0)
    idempotent: bool


class MemoryEvidenceCleanupResponse(MemoryCleanupResponse):
    problemProvider: Provider
    problemExternalId: str = Field(min_length=1, max_length=128)


MemoryProblemEvidenceDeleteResponse = MemoryEvidenceCleanupResponse
ProblemEvidenceDeleteResponse = MemoryEvidenceCleanupResponse
