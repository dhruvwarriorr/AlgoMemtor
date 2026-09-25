from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

Topic = Annotated[
    str, Field(min_length=1, max_length=64, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
]
TopicStatus = Literal["working_on", "practiced", "completed", "revisit", "skip_for_now"]
TopicStatusOrNoChange = Literal[
    "working_on", "practiced", "completed", "revisit", "skip_for_now", "no_change"
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class RoadmapTopicOption(StrictModel):
    slug: Topic
    name: str = Field(min_length=1, max_length=64)
    currentStatus: TopicStatus | None = None


class RoadmapNoteRequest(StrictModel):
    topics: list[RoadmapTopicOption] = Field(min_length=1, max_length=64)
    note: str = Field(min_length=1, max_length=500)


class RoadmapNoteClassification(StrictModel):
    """Structured-output shape for a free-text learning-plan note."""

    topic: Topic | None = None
    status: TopicStatusOrNoChange
    rationale: str = Field(min_length=1, max_length=280)


class RoadmapNoteResponse(StrictModel):
    topic: Topic | None = None
    status: TopicStatusOrNoChange
    rationale: str = Field(min_length=1, max_length=280)
