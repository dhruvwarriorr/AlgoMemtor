from __future__ import annotations

import re
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

Provider = Literal["codeforces", "codechef", "leetcode"]
NormalizedDifficulty = Literal["easy", "medium", "hard"]
FallbackReason = Literal[
    "not_configured",
    "timeout",
    "provider_error",
    "invalid_output",
    "audit_unavailable",
    "service_unavailable",
]
Topic = Annotated[
    str, Field(min_length=1, max_length=64, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
]
PreferenceCode = Annotated[str, Field(min_length=1, max_length=64)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class PreferredDifficulty(StrictModel):
    min: float = Field(ge=0)
    max: float = Field(ge=0)

    @model_validator(mode="after")
    def validate_range(self) -> PreferredDifficulty:
        if self.min > self.max:
            raise ValueError("Minimum difficulty cannot exceed maximum difficulty.")
        return self


class RankingTopicEvidence(StrictModel):
    topic: Topic
    observedAttemptedProblems: int = Field(ge=0)
    observedSolvedProblems: int = Field(ge=0)


class RankingLearner(StrictModel):
    goal: str = Field(min_length=1, max_length=64)
    experience: str = Field(min_length=1, max_length=64)
    focusTopics: list[Topic] = Field(max_length=25)
    preferredTopics: list[Topic] = Field(max_length=25)
    preferredDifficulty: PreferredDifficulty
    learningPreferences: list[PreferenceCode] = Field(max_length=16)
    recommendationPreference: str | None = Field(
        default=None, min_length=1, max_length=500
    )
    topicEvidence: list[RankingTopicEvidence] = Field(
        default_factory=list, max_length=25
    )

    @model_validator(mode="after")
    def validate_topic_evidence(self) -> RankingLearner:
        topics = [item.topic for item in self.topicEvidence]
        if len(topics) != len(set(topics)):
            raise ValueError("Topic evidence must be unique.")
        return self


class RankingCandidate(StrictModel):
    provider: Provider
    externalId: str = Field(min_length=1, max_length=128, pattern=r"^\S+$")
    title: str = Field(min_length=1, max_length=512)
    rating: float | None = Field(default=None, ge=0)
    normalizedDifficulty: NormalizedDifficulty | None = None
    topics: list[Topic] = Field(min_length=1, max_length=25)
    solvedCount: int | None = Field(default=None, ge=0)


class RankingRequest(StrictModel):
    requestId: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
    learnerId: UUID
    expectedCount: int = Field(ge=1, le=10)
    learner: RankingLearner
    candidates: list[RankingCandidate] = Field(min_length=1, max_length=40)

    @model_validator(mode="after")
    def validate_candidates(self) -> RankingRequest:
        identities = [
            f"{candidate.provider}:{candidate.externalId}"
            for candidate in self.candidates
        ]
        if len(identities) != len(set(identities)):
            raise ValueError("Candidates must be unique.")
        if self.expectedCount != min(10, len(self.candidates)):
            raise ValueError(
                "Expected count must equal ten or the candidate count when smaller."
            )
        return self


class RankedItem(StrictModel):
    provider: Provider
    externalId: str = Field(min_length=1, max_length=128, pattern=r"^\S+$")
    score: float = Field(ge=0, le=1)
    reason: str = Field(min_length=1, max_length=240)


class ModelRankingOutput(StrictModel):
    items: list[RankedItem] = Field(max_length=10)


class RankingResponse(StrictModel):
    items: list[RankedItem] = Field(max_length=10)
    model: str = Field(min_length=1, max_length=128)
    fallback: bool
    fallbackReason: FallbackReason | None = None
    latencyMs: int = Field(ge=0)
    inputTokens: int | None = Field(default=None, ge=0)
    outputTokens: int | None = Field(default=None, ge=0)
    estimatedCostUsd: float | None = Field(default=None, ge=0)
    auditId: UUID | None = None

    @model_validator(mode="after")
    def validate_fallback(self) -> RankingResponse:
        if self.fallback and self.fallbackReason is None:
            raise ValueError("Fallback responses require a stable reason.")
        if self.fallback and self.items:
            raise ValueError("Fallback responses cannot contain ranked items.")
        if not self.fallback and self.fallbackReason is not None:
            raise ValueError("Successful responses cannot include a fallback reason.")
        return self


UNSAFE_REASON_PATTERNS = (
    re.compile(r"\b(?:https?://|www\.)", re.IGNORECASE),
    re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE),
    re.compile(r"@[A-Z0-9_]{2,}", re.IGNORECASE),
    re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)"),
    re.compile(
        r"\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-"
        r"[89ab][0-9a-f]{3}-[0-9a-f]{12}\b",
        re.IGNORECASE,
    ),
)


def is_safe_reason(reason: str) -> bool:
    return not any(pattern.search(reason) for pattern in UNSAFE_REASON_PATTERNS)


def repeats_preference_text(preference: str | None, reason: str) -> bool:
    if preference is None:
        return False
    preference_words = re.findall(r"[a-z0-9]+", preference.lower())
    if len(preference_words) < 4:
        return False
    normalized_reason = " ".join(re.findall(r"[a-z0-9]+", reason.lower()))
    return any(
        " ".join(preference_words[index : index + 4]) in normalized_reason
        for index in range(len(preference_words) - 3)
    )


def repeats_memory_text(memory_statements: list[str], reason: str) -> bool:
    normalized_reason = " ".join(re.findall(r"[a-z0-9]+", reason.lower()))
    for statement in memory_statements:
        words = re.findall(r"[a-z0-9]+", statement.lower())
        if len(words) < 4:
            continue
        if any(
            " ".join(words[index : index + 4]) in normalized_reason
            for index in range(len(words) - 3)
        ):
            return True
    return False


def repeats_identifier(identifiers: list[str], reason: str) -> bool:
    normalized_reason = " ".join(re.findall(r"[a-z0-9]+", reason.lower()))
    for identifier in identifiers:
        normalized_identifier = " ".join(re.findall(r"[a-z0-9]+", identifier.lower()))
        if len(normalized_identifier) < 3:
            continue
        if re.search(
            rf"(?<![a-z0-9]){re.escape(normalized_identifier)}(?![a-z0-9])",
            normalized_reason,
        ):
            return True
    return False
