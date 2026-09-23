from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import pytest
from app import memory_service
from app.coach_service import CoachService
from app.coach_tools import WorkspaceTools, tool_declarations
from app.memory_models import MemoryRetrievalResponse, StoredMemory
from app.settings import AiSettings

LEARNER = UUID("00000000-0000-4000-8000-000000000001")


def memory(statement: str, status: str = "active") -> StoredMemory:
    return StoredMemory(
        id=UUID("00000000-0000-4000-8000-000000000010"),
        learnerId=LEARNER,
        category="user_instruction",
        statement=statement,
        structuredValue={},
        confidence=0.912,
        status=status,  # type: ignore[arg-type]
        evidenceIds=[UUID("00000000-0000-4000-8000-000000000011")],
        createdAt=datetime(2026, 9, 20, tzinfo=UTC),
        updatedAt=datetime(2026, 9, 21, tzinfo=UTC),
    )


@pytest.mark.asyncio
async def test_recall_tool_is_declared_only_when_memory_is_available() -> None:
    without = [item["name"] for item in tool_declarations(knowledge=False, web=False)]
    with_memory = [
        item["name"]
        for item in tool_declarations(knowledge=False, web=False, memory=True)
    ]
    assert "recall_memory" not in without
    assert "recall_memory" in with_memory


@pytest.mark.asyncio
async def test_recall_tool_requires_a_query_and_forwards_it() -> None:
    queries: list[str] = []

    async def recall(query: str) -> dict[str, Any]:
        queries.append(query)
        return {"memories": []}

    tools = WorkspaceTools({}, memory_recall=recall)

    assert "error" in await tools.execute("recall_memory", {"query": "  "})
    assert await tools.execute("recall_memory", {"query": " dp focus "}) == {
        "memories": []
    }
    assert queries == ["dp focus"]
    unavailable = WorkspaceTools({})
    assert "error" in await unavailable.execute("recall_memory", {"query": "dp"})


@pytest.mark.asyncio
async def test_recall_reads_only_the_request_learner_and_active_memories(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[tuple[UUID, str | None, int]] = []

    class Retriever:
        async def retrieve(
            self, learner_id: UUID, query: str | None, limit: int
        ) -> MemoryRetrievalResponse:
            seen.append((learner_id, query, limit))
            return MemoryRetrievalResponse(
                learnerId=learner_id,
                query=query,
                retrievalMode="vector",
                items=[
                    memory("Wants to focus on dynamic programming this month."),
                    memory("An archived note.", status="archived"),
                ],
            )

    monkeypatch.setattr(memory_service, "get_memory_service", lambda: Retriever())
    service = CoachService(
        AiSettings(_env_file=None, internal_service_token="t", llm_api_key="k")
    )

    result = await service.agent_recall_memory(LEARNER, "what should I focus on")

    assert seen == [(LEARNER, "what should I focus on", 8)]
    assert result == {
        "memories": [
            {
                "category": "user_instruction",
                "statement": "Wants to focus on dynamic programming this month.",
                "confidence": 0.91,
                "updatedAt": "2026-09-21",
            }
        ]
    }


@pytest.mark.asyncio
async def test_recall_failure_is_a_tool_error_not_a_failed_turn(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class Broken:
        async def retrieve(self, *_args: object) -> MemoryRetrievalResponse:
            raise RuntimeError("database down")

    monkeypatch.setattr(memory_service, "get_memory_service", lambda: Broken())
    service = CoachService(
        AiSettings(_env_file=None, internal_service_token="t", llm_api_key="k")
    )

    assert await service.agent_recall_memory(LEARNER, "dp") == {
        "error": "Learner memory is temporarily unavailable."
    }
