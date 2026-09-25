from __future__ import annotations

from typing import Any
from uuid import UUID

import pytest
from app.coach_intent import classify_turn, is_complex_turn
from app.coach_models import CoachModelOutput, CoachRequest
from app.coach_output import coerce_coach_output, strip_problem_ids
from app.coach_service import CoachNotConfiguredError, CoachService
from app.settings import AiSettings
from langchain_core.messages import AIMessage

LEARNER_ID = UUID("00000000-0000-4000-8000-000000000001")
CONVERSATION_ID = UUID("00000000-0000-4000-8000-000000000002")


def settings(**updates: Any) -> AiSettings:
    values: dict[str, Any] = {
        "_env_file": None,
        "internal_service_token": "internal-test-token",
        "llm_api_key": "test-key",
    }
    values.update(updates)
    return AiSettings(**values)


def request(question: str, **context: Any) -> CoachRequest:
    return CoachRequest(
        requestId="coach_request_1",
        learnerId=LEARNER_ID,
        conversationId=CONVERSATION_ID,
        question=question,
        context={"recentTurns": [], **context},
    )


class AuditRepository:
    def __init__(self) -> None:
        self.saved: list[Any] = []

    async def save(self, audit: Any) -> UUID:
        self.saved.append(audit)
        return CONVERSATION_ID


class FullPipelineModel:
    """Fails the test if a greeting reaches the full coaching pipeline."""

    async def respond(self, _request: CoachRequest) -> CoachModelOutput:
        raise AssertionError("small talk must not use the full coach model")


class FakeChat:
    def __init__(self, text: str = "", error: Exception | None = None) -> None:
        self.text = text
        self.error = error
        self.messages: list[Any] = []

    async def ainvoke(self, messages: list[Any]) -> AIMessage:
        self.messages.append(messages)
        if self.error is not None:
            raise self.error
        return AIMessage(
            content=self.text,
            usage_metadata={
                "input_tokens": 120,
                "output_tokens": 18,
                "total_tokens": 138,
            },
        )


@pytest.mark.parametrize(
    "question",
    [
        "hi",
        "Hi!",
        "hi lol",
        "hey coach",
        "hello there",
        "good morning",
        "thanks!",
        "thank you so much",
        "ok thanks",
        "bye",
        "👋",
        "how are you?",
        "who are you",
        "what can you do?",
    ],
)
def test_short_conversational_messages_are_small_talk(question: str) -> None:
    assert classify_turn(question) == "smalltalk"


@pytest.mark.parametrize(
    "question",
    [
        "hi, explain binary search",
        "what is dp?",
        "ok",
        "yes",
        "cool",
        "How can I improve my codeforces rating?",
        "why did my submission get TLE?",
    ],
)
def test_real_questions_and_bare_answers_use_the_full_coach(question: str) -> None:
    assert classify_turn(question) == "full"


def test_attachments_are_never_small_talk() -> None:
    assert classify_turn("hi", has_transient_context=True) == "full"
    assert classify_turn("hi", has_media=True) == "full"


def test_deep_reasoning_is_reserved_for_complex_turns() -> None:
    assert is_complex_turn("why does this greedy fail?")
    assert is_complex_turn("debug my code")
    assert is_complex_turn("what is a segment tree", has_transient_context=True)
    assert not is_complex_turn("what is a segment tree")
    assert not is_complex_turn("how many problems did I solve this week?")


@pytest.mark.asyncio
async def test_greeting_gets_one_fast_reply_without_retrieval_or_analysis() -> None:
    chat = FakeChat("Hey! Good to see you. Want to keep going on binary search?")
    audits = AuditRepository()
    service = CoachService(
        settings(),
        model=FullPipelineModel(),
        audit_repository=audits,
        smalltalk_model=chat,  # type: ignore[arg-type]
    )

    output = await service.respond(
        request(
            "hi",
            roadmap={"topics": [{"lane": "current_focus", "name": "Binary Search"}]},
            activityDigest={"totals": {"submissions": 1766}},
        )
    )

    assert output.answer.startswith("Hey! Good to see you.")
    assert output.presentation is not None
    assert len(output.presentation.suggestedQuestions) == 3
    prompt = chat.messages[0][1].content
    # Only the message, focus names and recent turns reach the model.
    assert "Binary Search" in prompt
    assert "1766" not in prompt
    assert audits.saved[0].knowledge_retrieved is False
    assert audits.saved[0].web_grounding_used is False


@pytest.mark.asyncio
async def test_core_marked_small_talk_uses_the_fast_path() -> None:
    chat = FakeChat("You're welcome!")
    service = CoachService(
        settings(),
        model=FullPipelineModel(),
        audit_repository=AuditRepository(),
        smalltalk_model=chat,  # type: ignore[arg-type]
    )

    output = await service.respond(request("cheers mate", turnKind="smalltalk"))

    assert output.answer == "You're welcome!"


@pytest.mark.asyncio
async def test_small_talk_falls_back_to_a_safe_reply_when_the_model_fails() -> None:
    service = CoachService(
        settings(),
        model=FullPipelineModel(),
        audit_repository=AuditRepository(),
        smalltalk_model=FakeChat(error=TimeoutError()),  # type: ignore[arg-type]
    )

    output = await service.respond(request("thanks!"))

    assert output.answer.startswith("You're welcome!")


@pytest.mark.asyncio
async def test_small_talk_without_any_model_reports_not_configured() -> None:
    service = CoachService(
        settings(
            app_environment="production",
            ai_provider="openrouter",
            openrouter_api_key="",
        ),
        audit_repository=AuditRepository(),
    )

    with pytest.raises(CoachNotConfiguredError):
        await service.respond(request("hi"))


def test_raw_problem_ids_are_removed_from_answer_prose() -> None:
    output = coerce_coach_output(
        {
            "answer": (
                "Examine **Numbers With Same Consecutive Differences** "
                "(`leetcode:1007`), then try codeforces:2266C.\n\n"
                '```cpp\nauto key = "leetcode:1007";\n```'
            )
        }
    )
    assert output is not None
    assert "leetcode:1007`)" not in output.answer
    assert "(`" not in output.answer
    assert "codeforces:2266C" not in output.answer
    # Code blocks are never rewritten.
    assert 'auto key = "leetcode:1007";' in output.answer


def test_strip_problem_ids_keeps_ordinary_colons() -> None:
    assert strip_problem_ids("Complexity: O(n log n).") == "Complexity: O(n log n)."
