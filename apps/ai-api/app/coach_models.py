from __future__ import annotations

import re
from ipaddress import ip_address
from typing import Literal
from urllib.parse import urlparse
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

_UNSAFE_COACH_TEXT = re.compile(
    r"(?:https?://|www\.)\S+|"
    r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|"
    r"\b(?:bearer|token|api[_ -]?key)\s*[:=]?\s*\S+",
    re.IGNORECASE,
)

CoachActionType = Literal[
    "set_topic_status",
    "save_memory",
    "set_problem_status",
    "bookmark_problem",
    "refresh_recommendations",
    "update_profile",
]
CoachTopicStatus = Literal[
    "working_on", "practiced", "completed", "revisit", "skip_for_now"
]
CoachEvidenceSource = Literal[
    "profile",
    "analytics",
    "activity",
    "progress",
    "roadmap",
    "memory",
    "recommendations",
    "contest",
]
CoachCheckInType = Literal[
    "weekly_review",
    "contest_result",
    "repeated_failures",
    "focus_transition",
    "focus_progress",
    "inactivity",
]


class CoachStrictModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        populate_by_name=True,
    )


class CoachProblemReference(CoachStrictModel):
    provider: Literal["codeforces", "codechef", "leetcode", "cses"]
    externalId: str = Field(min_length=1, max_length=128, pattern=r"^\S+$")


class CoachEvidence(CoachStrictModel):
    source: CoachEvidenceSource
    label: str = Field(min_length=1, max_length=160)
    detail: str = Field(min_length=1, max_length=500)
    completeness: Literal["complete", "partial", "unknown"]
    stale: bool

    @field_validator("label", "detail")
    @classmethod
    def reject_links(cls, value: str) -> str:
        if _UNSAFE_COACH_TEXT.search(value):
            raise ValueError("Coach evidence cannot contain links or secrets.")


class CoachCitation(CoachStrictModel):
    id: str = Field(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")
    source: Literal["knowledge", "web"]
    title: str = Field(min_length=1, max_length=160)
    detail: str | None = Field(default=None, max_length=360)
    url: str | None = Field(default=None, max_length=2_048)
    publisher: str | None = Field(default=None, max_length=100)
    retrievedAt: str
    stale: bool = False

    @field_validator("title", "detail", "publisher")
    @classmethod
    def reject_unsafe_citation_text(cls, value: str | None) -> str | None:
        if value is not None and _UNSAFE_COACH_TEXT.search(value):
            raise ValueError("Coach citations cannot contain unsafe text.")
        return value

    @field_validator("url")
    @classmethod
    def require_public_https_url(cls, value: str | None) -> str | None:
        if value is None:
            return value
        parsed = urlparse(value)
        hostname = (parsed.hostname or "").lower().rstrip(".")
        try:
            address = ip_address(hostname)
        except ValueError:
            address = None
        if (
            parsed.scheme != "https"
            or not hostname
            or parsed.username is not None
            or parsed.password is not None
            or hostname in {"localhost", "127.0.0.1", "::1"}
            or hostname.endswith(".local")
            or re.fullmatch(r"(?:0x[0-9a-f]+|[0-9]+)", hostname)
            or (
                address is not None
                and (
                    address.is_private
                    or address.is_loopback
                    or address.is_link_local
                    or address.is_reserved
                    or address.is_unspecified
                )
            )
        ):
            raise ValueError("Coach citations require a public HTTPS URL.")
        return value

    @model_validator(mode="after")
    def require_url_for_web_source(self) -> CoachCitation:
        if self.source == "web" and self.url is None:
            raise ValueError("Web citations require a public source URL.")
        return self


class CoachProposal(CoachStrictModel):
    actionType: CoachActionType
    label: str = Field(min_length=1, max_length=160)
    reason: str = Field(min_length=1, max_length=500)
    topic: str | None = Field(
        default=None, max_length=64, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
    )
    topicStatus: CoachTopicStatus | None = None
    problem: CoachProblemReference | None = None
    learnerStatus: Literal["unsolved", "attempted", "solved"] | None = None
    memoryText: str | None = Field(default=None, min_length=1, max_length=500)
    memoryCategory: (
        Literal[
            "preference",
            "difficulty_calibration",
            "topic_weakness",
            "scheduling_preference",
            "recommendation_feedback_pattern",
        ]
        | None
    ) = None

    @field_validator("label", "reason", "memoryText")
    @classmethod
    def reject_unsafe_text(cls, value: str | None) -> str | None:
        if value is not None and _UNSAFE_COACH_TEXT.search(value):
            raise ValueError("Coach proposals cannot contain links or secrets.")
        return value

    @model_validator(mode="after")
    def validate_action_payload(self) -> CoachProposal:
        if self.actionType == "set_topic_status" and (
            self.topic is None or self.topicStatus is None
        ):
            raise ValueError("A topic-status proposal needs a topic and status.")
        if self.actionType == "set_problem_status" and (
            self.problem is None or self.learnerStatus is None
        ):
            raise ValueError(
                "A problem-status proposal needs a problem and learner status."
            )
        if self.actionType == "bookmark_problem" and self.problem is None:
            raise ValueError("A bookmark proposal needs a problem.")
        if self.actionType == "save_memory" and (
            self.memoryText is None or self.memoryCategory is None
        ):
            raise ValueError("A memory proposal needs text and a category.")
        return self


class CoachModelOutput(CoachStrictModel):
    answer: str = Field(min_length=1, max_length=8_000)
    evidence: list[CoachEvidence] = Field(default_factory=list, max_length=12)
    proposals: list[CoachProposal] = Field(default_factory=list, max_length=8)
    citations: list[CoachCitation] = Field(default_factory=list, max_length=8)

    @field_validator("answer")
    @classmethod
    def reject_unsafe_answer(cls, value: str) -> str:
        if _UNSAFE_COACH_TEXT.search(value):
            raise ValueError("Coach answers cannot contain links or secrets.")
        return value


class CoachResponseProposal(CoachProposal):
    id: UUID
    # The core API persists every accepted proposal in the shared proposal
    # state machine. Gemini only creates new proposals, so the internal
    # response always starts in the proposed state.
    status: Literal["proposed"] = "proposed"


class CoachResponse(CoachStrictModel):
    answer: str = Field(min_length=1, max_length=8_000)
    evidence: list[CoachEvidence] = Field(default_factory=list, max_length=12)
    proposals: list[CoachResponseProposal] = Field(default_factory=list, max_length=8)
    citations: list[CoachCitation] = Field(default_factory=list, max_length=8)
    fallback: bool = False


class CoachCheckInRequest(CoachStrictModel):
    requestId: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
    learnerId: UUID
    conversationId: UUID
    type: CoachCheckInType
    title: str = Field(min_length=1, max_length=160)
    deterministicContent: str = Field(min_length=1, max_length=4_000)
    evidence: list[CoachEvidence] = Field(default_factory=list, max_length=12)
    context: dict[str, object]


class CoachCheckInResponse(CoachStrictModel):
    content: str = Field(min_length=1, max_length=4_000)
    evidence: list[CoachEvidence] = Field(default_factory=list, max_length=12)

    @field_validator("content")
    @classmethod
    def reject_unsafe_content(cls, value: str) -> str:
        if _UNSAFE_COACH_TEXT.search(value):
            raise ValueError("Coach check-ins cannot contain links or secrets.")
        return value


class CoachRequest(CoachStrictModel):
    requestId: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
    learnerId: UUID
    conversationId: UUID
    question: str = Field(min_length=1, max_length=8_000)
    transientContext: str | None = Field(default=None, max_length=12_000)
    context: dict[str, object]
