from __future__ import annotations

import base64
import json
from datetime import UTC, datetime
from io import BytesIO
from typing import Any
from uuid import UUID

import pytest
from app.coach_models import CoachRequest
from app.coach_output import coerce_coach_output, redact_text
from app.coach_service import (
    CoachRateLimitedError,
    CoachService,
    GeminiCoachModel,
    HybridCoachModel,
    ModelRequestThrottle,
    _human_message,
    _transcribe_groq_media,
    is_rate_limit_error,
    route_coach_provider,
)
from app.coach_tools import WorkspaceTools, prefetch_plan, verdict_group
from app.settings import AiSettings
from app.web_grounding import PublicCitation, PublicResearch, _title_from_url
from langchain_core.messages import AIMessage, ToolMessage
from pypdf import PdfWriter

NOW = datetime(2026, 9, 20, 12, tzinfo=UTC)

WORKSPACE: dict[str, object] = {
    "accounts": [{"provider": "codeforces", "handle": "tourist_fan", "rating": 1520}],
    "digest": {"activity": {"currentStreakDays": 3}},
    "solved": [
        {
            "id": "codeforces:1850A",
            "provider": "codeforces",
            "externalId": "1850A",
            "title": "To My Critics",
            "rating": 800,
            "tags": ["implementation"],
            "topics": ["implementation"],
            "solvedAt": "2026-09-18T10:00:00Z",
            "source": "provider",
        },
        {
            "id": "codeforces:1741E",
            "provider": "codeforces",
            "externalId": "1741E",
            "title": "Sending a Sequence Over the Network",
            "rating": 1600,
            "tags": ["dp"],
            "topics": ["dynamic-programming"],
            "solvedAt": "2026-08-01T10:00:00Z",
            "source": "provider",
        },
        {
            "id": "leetcode:two-sum",
            "provider": "leetcode",
            "externalId": "two-sum",
            "title": "Two Sum",
            "difficulty": "easy",
            "tags": ["hash table"],
            "topics": ["hashing"],
            "source": "manual",
        },
    ],
    "submissions": [
        {
            "id": "codeforces:1741E",
            "provider": "codeforces",
            "externalId": "1741E",
            "verdict": "WRONG_ANSWER",
            "accepted": False,
            "language": "GNU C++17",
            "at": "2026-07-31T10:00:00Z",
            "tags": ["dp"],
        },
        {
            "id": "codeforces:1741E",
            "provider": "codeforces",
            "externalId": "1741E",
            "verdict": "OK",
            "accepted": True,
            "language": "GNU C++17",
            "at": "2026-08-01T10:00:00Z",
            "tags": ["dp"],
        },
    ],
    "contests": [
        {
            "provider": "codeforces",
            "contestId": "1",
            "name": "Round A",
            "rank": 900,
            "delta": 40,
            "at": "2026-09-01T00:00:00Z",
        },
        {
            "provider": "codeforces",
            "contestId": "2",
            "name": "Round B",
            "rank": 2100,
            "delta": -25,
            "at": "2026-09-10T00:00:00Z",
        },
    ],
    "ratings": [
        {
            "provider": "codeforces",
            "at": "2026-09-01T00:00:00Z",
            "oldRating": 1505,
            "newRating": 1545,
            "delta": 40,
        },
        {
            "provider": "codeforces",
            "at": "2026-09-10T00:00:00Z",
            "oldRating": 1545,
            "newRating": 1520,
            "delta": -25,
        },
    ],
    "practicePool": [
        {
            "id": "codeforces:1900C",
            "provider": "codeforces",
            "externalId": "1900C",
            "title": "Anji's Binary Tree",
            "rating": 1300,
            "tags": ["dfs and similar", "trees"],
            "topics": ["trees"],
        },
        {
            "id": "codeforces:1873F",
            "provider": "codeforces",
            "externalId": "1873F",
            "title": "Money Trees",
            "rating": 1400,
            "tags": ["binary search", "two pointers"],
            "topics": ["binary-search"],
        },
    ],
    "topics": [
        {
            "topic": "dynamic-programming",
            "name": "Dynamic Programming",
            "lane": "current_focus",
            "assessment": "developing",
            "score": 0.5,
            "confidence": 0.6,
        }
    ],
}


def settings(**updates: Any) -> AiSettings:
    values: dict[str, Any] = {
        "_env_file": None,
        "internal_service_token": "internal-test-token",
        "llm_api_key": "test-key",
    }
    values.update(updates)
    return AiSettings(**values)


def request(question: str = "How many DP problems did I solve?") -> CoachRequest:
    return CoachRequest(
        requestId="coach_request_agent",
        learnerId=UUID("00000000-0000-4000-8000-000000000001"),
        conversationId=UUID("00000000-0000-4000-8000-000000000002"),
        question=question,
        context={"recentTurns": []},
        workspace=WORKSPACE,
    )


def test_output_repair_redacts_links_instead_of_failing() -> None:
    output = coerce_coach_output(
        {
            "answer": "Read https://cp-algorithms.com/graph/dfs.html then mail me@example.com.",
            "evidence": [
                {
                    "source": "activity",
                    "label": "Solves",
                    "detail": "12 in 30 days",
                    "completeness": "partial",
                },
                {
                    "source": "not-a-source",
                    "label": "x",
                    "detail": "y",
                    "completeness": "partial",
                },
            ],
            "proposals": [
                {
                    "actionType": "set_topic_status",
                    "label": "Focus DP",
                    "reason": "Weak spot",
                    "topic": "dynamic-programming",
                    "topicStatus": "working_on",
                },
                {
                    "actionType": "bookmark_problem",
                    "label": "Missing problem",
                    "reason": "No problem field",
                },
            ],
            "presentation": {
                "datasetIds": ["topic-assessments", "made-up"],
                "problemIds": ["codeforces:1873F", "https://evil.example"],
                "suggestedQuestions": ["Q1?", "Q2?", "Q3?", "Q4?", "Q5?"],
            },
        }
    )
    assert output is not None
    assert "cp-algorithms.com" in output.answer
    assert "https://" not in output.answer
    assert "[contact removed]" in output.answer
    assert len(output.evidence) == 1
    assert [proposal.actionType for proposal in output.proposals] == [
        "set_topic_status"
    ]
    assert output.presentation is not None
    assert output.presentation.datasetIds == ["topic-assessments"]
    assert output.presentation.problemIds == ["codeforces:1873F"]
    assert len(output.presentation.suggestedQuestions) == 4


def test_output_repair_truncates_without_dangling_code_fence() -> None:
    long_answer = "Intro\n```cpp\n" + ("int x = 0;\n" * 2_000) + "```"
    output = coerce_coach_output({"answer": long_answer})
    assert output is not None
    assert len(output.answer) <= 12_000
    assert output.answer.count("```") % 2 == 0
    assert coerce_coach_output({"answer": "   "}) is None
    assert redact_text("see www.codeforces.com/blog") == "see codeforces.com"


@pytest.mark.asyncio
async def test_workspace_tools_answer_profile_queries() -> None:
    tools = WorkspaceTools(WORKSPACE, now=NOW)
    dp = await tools.execute("query_solved_problems", {"topic": "dp"})
    assert dp["totalMatching"] == 1
    assert dp["items"][0]["title"] == "Sending a Sequence Over the Network"

    rated = await tools.execute(
        "query_solved_problems", {"minRating": 1000, "sort": "rating_desc"}
    )
    assert [item["id"] for item in rated["items"]] == ["codeforces:1741E"]

    recent = await tools.execute("query_solved_problems", {"days": 7})
    assert [item["id"] for item in recent["items"]] == ["codeforces:1850A"]

    failed = await tools.execute("query_submissions", {"verdict": "rejected"})
    assert failed["totalMatching"] == 1
    assert failed["verdictBreakdown"] == {"wrong_answer": 1}

    contests = await tools.execute("get_contest_history", {"sort": "best_rank"})
    assert contests["items"][0]["name"] == "Round A"
    assert contests["summary"]["averageDelta"] == 7.5

    rating = await tools.execute("get_rating_history", {})
    assert rating["byProvider"]["codeforces"]["peak"] == 1545
    assert rating["byProvider"]["codeforces"]["current"] == 1520

    practice = await tools.execute(
        "find_practice_problems", {"topic": "binary search", "maxRating": 1500}
    )
    assert [item["id"] for item in practice["items"]] == ["codeforces:1873F"]

    breakdown = await tools.execute("get_topic_breakdown", {"topic": "dp"})
    assert breakdown["items"][0]["failedSubmissions"] == 1

    assert "error" in await tools.execute("drop_tables", {})
    assert "error" in await tools.execute("search_knowledge", {"query": "dp"})


def test_verdict_groups_do_not_confuse_prefixes() -> None:
    assert verdict_group("OK") == "accepted"
    assert verdict_group("Wrong Answer") == "wrong_answer"
    assert verdict_group("TIME_LIMIT_EXCEEDED") == "time_limit"
    assert verdict_group("REJECTED") == "other"
    assert verdict_group("runtime error(SIGSEGV)") == "runtime_error"


class ScriptedModel:
    """Stands in for a tool-bound Gemini model and records every call."""

    def __init__(self, replies: list[AIMessage]) -> None:
        self.replies = replies
        self.calls: list[list[Any]] = []
        self.bound: list[tuple[list[str], object]] = []

    def bind_tools(self, tools: list[dict[str, Any]], tool_choice: object = None):
        self.bound.append(([tool["name"] for tool in tools], tool_choice))
        return self

    async def ainvoke(self, messages: list[Any]) -> AIMessage:
        self.calls.append(list(messages))
        return self.replies.pop(0)


def agent_model(
    replies: list[AIMessage], **updates: Any
) -> tuple[GeminiCoachModel, ScriptedModel]:
    scripted = ScriptedModel(replies)
    model = object.__new__(GeminiCoachModel)
    model.settings = settings(**updates)
    model.services = None
    model.base_model = scripted
    model.structured_model = None
    return model, scripted


@pytest.mark.asyncio
async def test_agent_queries_workspace_then_submits_answer() -> None:
    model, scripted = agent_model(
        [
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "id": "call-1",
                        "name": "query_solved_problems",
                        "args": {"topic": "dp"},
                    }
                ],
            ),
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "id": "call-2",
                        "name": "submit_answer",
                        "args": {
                            "answer": "You solved **1** DP problem: Sending a Sequence Over the Network (1600)."
                        },
                    }
                ],
                usage_metadata={
                    "input_tokens": 10,
                    "output_tokens": 5,
                    "total_tokens": 15,
                },
            ),
        ]
    )
    result = await model.respond(request())
    assert result.output.answer.startswith("You solved **1** DP problem")
    tool_messages = [
        message for message in scripted.calls[1] if isinstance(message, ToolMessage)
    ]
    assert len(tool_messages) == 1
    assert json.loads(tool_messages[0].content)["totalMatching"] == 1
    assert "query_solved_problems" in scripted.bound[0][0]
    assert "submit_answer" in scripted.bound[0][0]
    assert result.output_tokens == 5


@pytest.mark.asyncio
async def test_agent_forces_final_answer_when_tool_budget_runs_out() -> None:
    looping = [
        AIMessage(
            content="",
            tool_calls=[
                {"id": f"call-{index}", "name": "get_profile_overview", "args": {}}
            ],
        )
        for index in range(2)
    ]
    final = AIMessage(
        content="",
        tool_calls=[
            {
                "id": "final",
                "name": "submit_answer",
                "args": {"answer": "Here is your summary."},
            }
        ],
    )
    model, scripted = agent_model([*looping, final], coach_agent_max_steps=2)
    result = await model.respond(request("Summarize my profile"))
    assert result.output.answer == "Here is your summary."
    # The last step only offers submit_answer and forces it.
    assert scripted.bound[-1] == (["submit_answer"], "submit_answer")


@pytest.mark.asyncio
async def test_agent_web_search_scrubs_the_learners_handle(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, str] = {}

    async def fake_ground(
        settings: AiSettings, question: str, topic_hints: tuple[str, ...] = ()
    ) -> PublicResearch:
        del settings, topic_hints
        captured["question"] = question
        return PublicResearch(
            summary="Editorial idea summary.",
            citations=[
                PublicCitation(
                    id="web-1",
                    title="Money Trees",
                    url="https://codeforces.com/problemset/problem/1873/F",
                )
            ],
            searched=True,
        )

    monkeypatch.setattr("app.coach_service.ground_public_question", fake_ground)
    service = CoachService(settings(database_url=None))
    result = await service.agent_web_search(
        "tourist_fan codeforces 1873F editorial", WORKSPACE
    )
    assert "tourist_fan" not in captured["question"]
    assert result["summary"] == "Editorial idea summary."
    assert result["_sources"][0].url.startswith("https://codeforces.com/")


def test_grounding_titles_are_derived_from_resolved_paths() -> None:
    assert (
        _title_from_url("https://leetcode.com/problems/two-sum/", "leetcode.com")
        == "Two Sum · leetcode.com"
    )
    assert (
        _title_from_url(
            "https://codeforces.com/problemset/problem/1873/F", "codeforces.com"
        )
        == "1873 F · codeforces.com"
    )
    assert _title_from_url("https://example.com/", "example.com") == "example.com"


class RateLimitedModel(ScriptedModel):
    async def ainvoke(self, messages: list[Any]) -> AIMessage:
        self.calls.append(list(messages))
        raise RuntimeError("429 RESOURCE_EXHAUSTED: quota exceeded")


@pytest.mark.asyncio
async def test_rate_limits_are_surfaced_without_a_second_model_call() -> None:
    scripted = RateLimitedModel([])
    model = object.__new__(GeminiCoachModel)
    model.settings = settings()
    model.services = None
    model.base_model = scripted

    class NeverCalled:
        async def ainvoke(self, messages: list[Any]) -> dict[str, Any]:
            raise AssertionError("structured fallback must not run on a 429")

    model.structured_model = NeverCalled()
    service = CoachService(settings(database_url=None), model=model)
    with pytest.raises(CoachRateLimitedError):
        await service.respond(request())
    assert len(scripted.calls) == 1


def test_rate_limit_detection_walks_the_cause_chain() -> None:
    try:
        try:
            raise RuntimeError("RESOURCE_EXHAUSTED")
        except RuntimeError as inner:
            raise ValueError("wrapped") from inner
    except ValueError as outer:
        assert is_rate_limit_error(outer)
    assert not is_rate_limit_error(ValueError("bad schema"))


def test_prefetch_plan_targets_personal_data_questions() -> None:
    assert [name for name, _ in prefetch_plan("How did my last contests go?")] == [
        "get_contest_history"
    ]
    assert "query_submissions" in [
        name for name, _ in prefetch_plan("Why do I keep getting WA on DP problems?")
    ]
    assert [name for name, _ in prefetch_plan("Suggest practice problems")] == [
        "find_practice_problems"
    ]
    # Conceptual questions do not pay for data lookups.
    assert prefetch_plan("Explain how Dijkstra's algorithm works") == []


@pytest.mark.asyncio
async def test_prefetched_rows_reach_the_first_model_step() -> None:
    model, scripted = agent_model(
        [
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "id": "final",
                        "name": "submit_answer",
                        "args": {"answer": "Your best rank was 900 in Round A."},
                    }
                ],
            )
        ]
    )
    result = await model.respond(request("How did my contests go?"))
    assert result.output.answer.startswith("Your best rank")
    first_prompt = scripted.calls[0][1].content
    assert "prefetchedToolResults" in first_prompt
    assert "Round A" in first_prompt
    assert len(scripted.calls) == 1


@pytest.mark.asyncio
async def test_throttle_waits_or_refuses_instead_of_overspending() -> None:
    throttle = ModelRequestThrottle(per_minute=1, max_wait_seconds=0.01)
    await throttle.acquire()
    with pytest.raises(CoachRateLimitedError):
        await throttle.acquire()
    await ModelRequestThrottle(per_minute=0).acquire()


def test_coach_model_and_prices_can_be_overridden() -> None:
    configured = settings(
        coach_llm_model="gemini-3.5-flash",
        coach_input_price_per_million_usd="1.50",
    )
    assert configured.effective_coach_model == "gemini-3.5-flash"
    assert [str(value) for value in configured.effective_coach_prices] == [
        "1.50",
        "2.50",
    ]
    assert settings().effective_coach_model == "gemini-3.5-flash-lite"


def test_coach_can_run_on_groq_while_other_calls_stay_on_gemini() -> None:
    from app.coach_service import coach_chat_model
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain_groq import ChatGroq

    groq = settings(
        coach_llm_provider="groq",
        coach_llm_model="qwen/qwen3.8-27b",
        groq_api_key="gsk-test",
    )
    assert groq.coach_api_key == "gsk-test"
    assert groq.llm_api_key == "test-key"
    # The on-demand tier accepts less than 1,000 output tokens per minute.
    assert groq.effective_coach_max_output_tokens == 900
    model = coach_chat_model(groq)
    assert isinstance(model, ChatGroq)
    assert model.model_name == "qwen/qwen3.8-27b"
    assert model.reasoning_format == "parsed"

    gemini = settings()
    assert gemini.coach_api_key == "test-key"
    assert isinstance(coach_chat_model(gemini, fast=True), ChatGoogleGenerativeAI)


def test_groq_coach_without_a_groq_key_is_not_configured() -> None:
    from app.coach_service import CoachNotConfiguredError, CoachService

    service = CoachService(
        settings(coach_llm_provider="groq", coach_llm_model="qwen/qwen3.8-27b")
    )
    with pytest.raises(CoachNotConfiguredError):
        service.get_model()


def test_llm_provider_moves_generation_and_coach_to_groq() -> None:
    from app.llm import generation_model
    from langchain_groq import ChatGroq

    groq = settings(
        llm_provider="groq",
        llm_model="qwen/qwen3.8-27b",
        groq_api_key="gsk-test",
        coach_llm_provider="",
    )
    # Blank COACH_LLM_PROVIDER follows LLM_PROVIDER.
    assert groq.effective_coach_provider == "groq"
    assert groq.generation_api_key == "gsk-test"
    # The Gemini key still serves embeddings and web grounding.
    assert groq.llm_api_key == "test-key"
    model = generation_model(
        groq, temperature=0.2, max_tokens=50_000, timeout=10, max_retries=0
    )
    assert isinstance(model, ChatGroq)
    assert model.max_tokens == 900
    assert model.reasoning_effort == "low"


@pytest.mark.asyncio
async def test_groq_coach_uses_one_grounded_plain_call() -> None:
    from langchain_core.messages import AIMessage

    class PlainModel:
        def __init__(self) -> None:
            self.calls: list[list[Any]] = []

        async def ainvoke(self, messages: list[Any]) -> AIMessage:
            self.calls.append(messages)
            return AIMessage(
                content=(
                    "Review the two recent contest misses.\n\n"
                    "PROBLEM_IDS: codeforces:1A, not-an-id\n"
                    "FOLLOW_UPS: What went wrong in Round A? | How do I prep?"
                ),
                response_metadata={"finish_reason": "stop"},
            )

    scripted = PlainModel()
    model = object.__new__(GeminiCoachModel)
    model.settings = settings(
        coach_llm_provider="groq",
        coach_llm_model="qwen/qwen3.8-27b",
        groq_api_key="gsk-test",
    )
    model.base_model = scripted
    model.throttle = ModelRequestThrottle(per_minute=0)
    result = await model.respond(request("How did my last contests go?"))
    assert result.output.answer == "Review the two recent contest misses."
    assert result.output.presentation is not None
    assert result.output.presentation.problemIds == ["codeforces:1A"]
    assert result.output.presentation.suggestedQuestions == [
        "What went wrong in Round A?",
        "How do I prep?",
    ]
    assert len(scripted.calls) == 1
    prompt = scripted.calls[0][1].content
    assert "Round A" in prompt
    assert "prefetchedToolResults" in prompt


@pytest.mark.asyncio
async def test_groq_answer_cut_by_the_token_limit_is_closed_and_flagged() -> None:
    from langchain_core.messages import AIMessage

    class CutModel:
        async def ainvoke(self, _messages: list[Any]) -> AIMessage:
            return AIMessage(
                content="Use a BIT.\n\n```cpp\nint query(int i) {",
                response_metadata={"finish_reason": "length"},
            )

    model = object.__new__(GeminiCoachModel)
    model.settings = settings(
        coach_llm_provider="groq",
        coach_llm_model="qwen/qwen3.8-27b",
        groq_api_key="gsk-test",
    )
    model.base_model = CutModel()
    model.throttle = ModelRequestThrottle(per_minute=0)
    result = await model.respond(request("What is a Fenwick tree?"))
    assert result.output.answer.count("```") == 2
    assert result.output.answer.endswith("_(Answer shortened. Ask me to continue.)_")


def test_groq_image_attachment_uses_openai_image_url_format() -> None:
    attached = CoachRequest.model_validate(
        {
            **request("Explain this diagram").model_dump(),
            "transientMedia": {
                "mimeType": "image/png",
                "data": base64.b64encode(b"image").decode(),
            },
        }
    )
    message = _human_message(attached, provider="groq")
    assert message.content[1]["type"] == "image_url"
    assert message.content[1]["image_url"]["url"].startswith("data:image/png;base64,")


def test_groq_pdf_is_extracted_locally_without_sending_binary() -> None:
    buffer = BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    writer.write(buffer)
    encoded = base64.b64encode(buffer.getvalue()).decode()
    attached = CoachRequest.model_validate(
        {
            **request("Explain this PDF").model_dump(),
            "transientMedia": {"mimeType": "application/pdf", "data": encoded},
        }
    )
    message = _human_message(attached, provider="groq")
    assert isinstance(message.content, str)
    assert "No extractable text" in message.content
    assert encoded not in message.content


@pytest.mark.asyncio
async def test_groq_audio_is_transcribed_for_current_turn_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class Transcriptions:
        async def create(self, **kwargs: Any) -> Any:
            assert kwargs["model"] == "whisper-large-v3-turbo"
            return type("Transcript", (), {"text": "Use breadth-first search."})()

    class FakeGroq:
        def __init__(self, **kwargs: Any) -> None:
            self.audio = type("Audio", (), {"transcriptions": Transcriptions()})()

    monkeypatch.setattr("app.coach_service.AsyncGroq", FakeGroq)
    attached = CoachRequest.model_validate(
        {
            **request("What did I say?").model_dump(),
            "transientMedia": {
                "mimeType": "audio/webm",
                "data": base64.b64encode(b"audio").decode(),
            },
        }
    )
    prepared = await _transcribe_groq_media(settings(groq_api_key="gsk-test"), attached)
    assert prepared.transientMedia is None
    assert "Use breadth-first search" in prepared.transientContext
    assert attached.transientMedia is not None


def test_hybrid_router_uses_context_needs_not_topic_hardcoding() -> None:
    assert route_coach_provider(request("Explain the loop invariant")) == "groq"
    assert route_coach_provider(request("Review my recent contests")) == "gemini"
    assert (
        route_coach_provider(
            request("Explain this code").model_copy(
                update={"transientContext": "x" * 1_000}
            )
        )
        == "gemini"
    )


def test_hybrid_service_builds_both_models_when_both_keys_exist() -> None:
    service = CoachService(
        settings(
            coach_hybrid_enabled=True,
            coach_llm_provider="groq",
            coach_llm_model="qwen/qwen3.8-27b",
            groq_api_key="gsk-test",
        )
    )
    assert isinstance(service.get_model(), HybridCoachModel)


@pytest.mark.asyncio
async def test_hybrid_coach_retries_only_with_other_provider() -> None:
    class Provider:
        def __init__(self, *, fails: bool) -> None:
            self.fails = fails
            self.calls = 0

        async def respond(self, incoming: CoachRequest) -> Any:
            self.calls += 1
            if self.fails:
                raise RuntimeError("429 rate limit")
            return coerce_coach_output({"answer": "Here is the invariant."})

    qwen = Provider(fails=True)
    gemini = Provider(fails=False)
    result = await HybridCoachModel(gemini, qwen).respond(
        request("Explain the loop invariant")
    )
    assert result.answer == "Here is the invariant."
    assert qwen.calls == 1
    assert gemini.calls == 1
