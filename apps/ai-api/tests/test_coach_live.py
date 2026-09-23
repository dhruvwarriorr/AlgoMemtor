from __future__ import annotations

import asyncio
import json
from typing import Any
from uuid import UUID

import httpx
import pytest
from app import core_client
from app.coach_models import CoachModelOutput, CoachRequest
from app.coach_service import GeminiCoachModel, recent_openings
from app.coach_tools import WorkspaceTools, tool_declarations
from app.settings import AiSettings
from langchain_core.messages import AIMessage

LEARNER = UUID("00000000-0000-4000-8000-000000000001")


def settings(**updates: Any) -> AiSettings:
    values: dict[str, Any] = {
        "_env_file": None,
        "internal_service_token": "internal-test-token",
        "llm_api_key": "test-key",
        "core_api_url": "http://core.test",
    }
    values.update(updates)
    return AiSettings(**values)


def request(**updates: Any) -> CoachRequest:
    values: dict[str, Any] = {
        "requestId": "coach_request_live",
        "learnerId": LEARNER,
        "conversationId": UUID("00000000-0000-4000-8000-000000000002"),
        "question": "Did my last submission pass?",
        "context": {"recentTurns": []},
        "workspace": {"accounts": []},
    }
    values.update(updates)
    return CoachRequest(**values)


def test_recent_openings_lists_the_coachs_first_sentences() -> None:
    turns = [
        {"role": "user", "content": "Help me with DP"},
        {
            "role": "assistant",
            "content": "**With a Codeforces rating of 1665**, you are ready. More.",
        },
        {"role": "assistant", "content": "Hello! Here is a plan:\n- step"},
    ]
    assert recent_openings(turns) == [
        "Hello!",
        "With a Codeforces rating of 1665 , you are ready.",
    ]


@pytest.mark.asyncio
async def test_refresh_tool_runs_once_per_platform_per_turn() -> None:
    calls: list[str] = []

    async def refresh(provider: str) -> dict[str, Any]:
        calls.append(provider)
        return {"status": "refreshed", "provider": provider}

    tools = WorkspaceTools({}, platform_refresh=refresh)
    first = await tools.execute("refresh_platform_data", {"provider": "codeforces"})
    again = await tools.execute("refresh_platform_data", {"provider": "codeforces"})
    bad = await tools.execute("refresh_platform_data", {"provider": "atcoder"})

    assert first == {"status": "refreshed", "provider": "codeforces"}
    assert "already refreshed" in again["error"]
    assert "error" in bad
    assert calls == ["codeforces"]
    names = [item["name"] for item in tool_declarations(knowledge=False, web=False)]
    assert "refresh_platform_data" not in names
    names = [
        item["name"]
        for item in tool_declarations(knowledge=False, web=False, refresh=True)
    ]
    assert "refresh_platform_data" in names


@pytest.mark.asyncio
async def test_live_refresh_calls_the_core_api_with_the_internal_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[httpx.Request] = []

    def handler(outgoing: httpx.Request) -> httpx.Response:
        seen.append(outgoing)
        return httpx.Response(200, json={"data": {"status": "refreshed"}})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        core_client.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )

    result = await core_client.request_live_refresh(settings(), LEARNER, "codechef")

    assert result == {"status": "refreshed"}
    assert str(seen[0].url) == "http://core.test/internal/coach/live-refresh"
    assert seen[0].headers["x-internal-service-token"] == "internal-test-token"
    assert json.loads(seen[0].content) == {
        "learnerId": str(LEARNER),
        "provider": "codechef",
    }
    assert "error" in await core_client.request_live_refresh(
        settings(core_api_url=""), LEARNER, "codechef"
    )


@pytest.mark.asyncio
async def test_slow_agent_falls_back_to_a_fast_answer() -> None:
    class SlowAgent:
        def bind_tools(self, tools: list[dict[str, Any]], tool_choice: object = None):
            return self

        async def ainvoke(self, messages: list[Any]) -> AIMessage:
            await asyncio.sleep(5)
            raise AssertionError("the agent should have been cut off")

    class FastModel:
        def __init__(self) -> None:
            self.calls = 0

        async def ainvoke(self, messages: list[Any]) -> dict[str, Any]:
            self.calls += 1
            return {
                "parsed": CoachModelOutput(
                    answer="Your last submission passed.", proposals=[]
                ),
                "raw": AIMessage(content=""),
            }

    fast = FastModel()
    model = object.__new__(GeminiCoachModel)
    model.settings = settings(coach_agent_timeout_seconds=0.05)
    model.services = None
    model.base_model = SlowAgent()
    model.structured_model = None
    model.fast_structured_model = fast

    result = await model.respond(request())

    assert result.output.answer == "Your last submission passed."
    assert fast.calls == 1
