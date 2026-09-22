from __future__ import annotations

import base64
from io import BytesIO
from typing import Any
from uuid import UUID
from zipfile import ZipFile

import pytest
from app.coach_models import (
    CoachCheckInResponse,
    CoachCitation,
    CoachEvidence,
    CoachModelOutput,
    CoachPresentation,
    CoachRequest,
    CoachResponseProposal,
    CoachTransientMedia,
)
from app.coach_service import (
    CoachGenerationError,
    CoachNotConfiguredError,
    CoachService,
    GeminiCoachModel,
    extract_text_attachment,
    utc_timestamp,
)
from app.knowledge_base import retrieve_knowledge
from app.pedagogy import is_specific_problem_solution_request
from app.settings import AiSettings
from app.web_grounding import (
    PublicCitation,
    PublicResearch,
    public_topic_hints,
    sanitized_public_query,
    should_ground_on_web,
)
from pydantic import ValidationError

LEARNER_ID = UUID("00000000-0000-4000-8000-000000000001")
CONVERSATION_ID = UUID("00000000-0000-4000-8000-000000000002")


def settings(**updates: Any) -> AiSettings:
    values = {
        "_env_file": None,
        "internal_service_token": "internal-test-token",
        "llm_api_key": "test-key",
    }
    values.update(updates)
    return AiSettings(**values)


def request_payload() -> CoachRequest:
    return CoachRequest(
        requestId="coach_request_1",
        learnerId=LEARNER_ID,
        conversationId=CONVERSATION_ID,
        question="What should I practice next?",
        transientContext="temporary code is never saved",
        context={
            "roadmap": {"version": 1, "dataCompleteness": "partial"},
            "recentTurns": [],
        },
    )


def test_rejects_urls_in_evidence() -> None:
    with pytest.raises(ValidationError):
        CoachEvidence(
            source="roadmap",
            label="https://attacker.example",
            detail="Untrusted link",
            completeness="partial",
            stale=True,
        )
    with pytest.raises(ValidationError):
        CoachCitation(
            id="private",
            source="web",
            title="Private source",
            url="https://127.0.0.1/internal",
            retrievedAt="2026-09-17T12:00:00Z",
        )
    with pytest.raises(ValidationError):
        CoachCitation(
            id="private-range",
            source="web",
            title="Private source",
            url="https://172.20.0.1/internal",
            retrievedAt="2026-09-17T12:00:00Z",
        )
    with pytest.raises(ValidationError):
        CoachCitation(
            id="encoded-private",
            source="web",
            title="Private source",
            url="https://2130706433/internal",
            retrievedAt="2026-09-17T12:00:00Z",
        )
    with pytest.raises(ValidationError):
        CoachCitation(
            id="missing-url",
            source="web",
            title="Missing source",
            retrievedAt="2026-09-17T12:00:00Z",
        )


def test_valid_evidence_preserves_contract_values() -> None:
    evidence = CoachEvidence(
        source="analytics",
        label="Recent practice",
        detail="You completed three observed problems this week.",
        completeness="partial",
        stale=False,
    )

    assert evidence.model_dump(mode="json") == {
        "source": "analytics",
        "label": "Recent practice",
        "detail": "You completed three observed problems this week.",
        "completeness": "partial",
        "stale": False,
    }


def test_utc_timestamp_matches_shared_contract_format() -> None:
    timestamp = utc_timestamp()

    assert timestamp.endswith("Z")
    assert "+00:00" not in timestamp


def test_media_validation_and_specific_problem_routing() -> None:
    assert CoachTransientMedia(mimeType="audio/wav", data="UklGRg==").data
    assert CoachTransientMedia(mimeType="image/png", data="UklGRg==").data
    assert CoachTransientMedia(mimeType="application/pdf", data="UklGRg==").data
    with pytest.raises(ValidationError):
        CoachTransientMedia(mimeType="application/x-msdownload", data="UklGRg==")
    with pytest.raises(ValidationError):
        CoachTransientMedia(mimeType="video/mp4", data="not-base64")
    assert is_specific_problem_solution_request("Give me a hint for this problem", None)
    assert is_specific_problem_solution_request("Give me a hint for Two Sum", None)
    assert is_specific_problem_solution_request("Solve this", "problem text")
    assert not is_specific_problem_solution_request(
        "What should I practice next?", None
    )
    assert not is_specific_problem_solution_request(
        "How can I solve more problems?", None
    )


def test_text_and_docx_attachments_are_extracted_in_memory() -> None:
    text = base64.b64encode(b"Review the binary search invariant.").decode()
    assert "binary search" in extract_text_attachment("text/plain", text)
    document = BytesIO()
    with ZipFile(document, "w") as archive:
        archive.writestr(
            "word/document.xml",
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Check the invariant</w:t></w:r></w:p></w:body></w:document>',
        )
    encoded = base64.b64encode(document.getvalue()).decode()
    mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert extract_text_attachment(mime, encoded) == "Check the invariant"
    with pytest.raises(CoachGenerationError, match="Invalid document attachment"):
        extract_text_attachment(mime, text)


@pytest.mark.parametrize("mime_type", ["audio/wav", "image/png", "application/pdf"])
@pytest.mark.asyncio
async def test_gemini_model_receives_media_as_transient_multimodal_message(
    mime_type: str,
) -> None:
    captured: list[Any] = []

    class StructuredModel:
        async def ainvoke(self, messages: list[Any]) -> dict[str, Any]:
            captured.extend(messages)
            return {
                "parsed": CoachModelOutput(answer="The clip explains binary search.")
            }

    model = object.__new__(GeminiCoachModel)
    model.structured_model = StructuredModel()
    request = request_payload().model_copy(
        update={
            "transientMedia": CoachTransientMedia(mimeType=mime_type, data="UklGRg==")
        }
    )
    result = await model.respond(request)
    assert result.output.answer == "The clip explains binary search."
    assert captured[1].content[1]["type"] == "media"
    assert captured[1].content[1]["mime_type"] == mime_type


@pytest.mark.asyncio
async def test_text_attachment_reaches_gemini_without_raw_base64() -> None:
    captured: list[Any] = []

    class StructuredModel:
        async def ainvoke(self, messages: list[Any]) -> dict[str, Any]:
            captured.extend(messages)
            return {"parsed": CoachModelOutput(answer="Here is a useful approach.")}

    model = object.__new__(GeminiCoachModel)
    model.structured_model = StructuredModel()
    encoded = base64.b64encode(b"Review the binary search invariant.").decode()
    request = request_payload().model_copy(
        update={
            "transientMedia": CoachTransientMedia(mimeType="text/plain", data=encoded)
        }
    )
    await model.respond(request)
    content = captured[1].content
    assert isinstance(content, str)
    assert "Review the binary search invariant." in content
    assert encoded not in content


def test_presentation_accepts_only_trusted_problem_identities() -> None:
    presentation = CoachPresentation(
        datasetIds=["trusted-problems"],
        problemIds=["leetcode:contains-duplicate-ii", "leetcode:contains-duplicate-ii"],
        webProblemCitationIds=["web-1", "web-1"],
        suggestedQuestions=["Show me the invariant."],
    )

    assert presentation.problemIds == ["leetcode:contains-duplicate-ii"]
    assert presentation.webProblemCitationIds == ["web-1"]
    with pytest.raises(ValidationError):
        CoachPresentation(problemIds=["https://leetcode.com/problems/example"])
    with pytest.raises(ValidationError):
        CoachPresentation(webProblemCitationIds=["made-up-source"])


def test_rejects_links_in_coach_text() -> None:
    with pytest.raises(ValidationError):
        CoachModelOutput(answer="Read https://example.com for the solution.")
    with pytest.raises(ValidationError):
        CoachCheckInResponse(content="Open https://example.com after practice.")
    with pytest.raises(ValidationError):
        CoachModelOutput(
            answer="Here is a safe explanation.",
            proposals=[
                {
                    "actionType": "set_topic_status",
                    "label": "Update Arrays",
                    "reason": "Read https://example.com first.",
                    "topic": "arrays",
                    "topicStatus": "working_on",
                }
            ],
        )


def test_response_proposals_start_in_the_proposed_state() -> None:
    proposal = CoachResponseProposal(
        id=CONVERSATION_ID,
        actionType="set_topic_status",
        label="Mark Arrays as current focus",
        reason="You asked for a focused next step.",
        topic="arrays",
        topicStatus="working_on",
    )

    assert proposal.status == "proposed"


def test_knowledge_retrieval_and_web_router_are_bounded() -> None:
    chunks = retrieve_knowledge("how do I debug a sliding window?", limit=8)
    assert 1 <= len(chunks) <= 8
    assert any(chunk.topic == "sliding-window" for chunk in chunks)
    assert any(
        chunk.id == "interview-algorithm-communication"
        for chunk in retrieve_knowledge("algorithm interview communication")
    )
    assert any(
        chunk.id == "python-contest-practicalities"
        for chunk in retrieve_knowledge("Python contest performance")
    )
    assert any(
        chunk.id == "cpp-contest-practicalities"
        for chunk in retrieve_knowledge("C++ integer overflow")
    )
    assert should_ground_on_web("What is the latest public contest format?", 0)
    assert should_ground_on_web("Explain the Codeforces rating system", 8)
    assert should_ground_on_web("Recommend problems I should solve next", 8)
    assert not should_ground_on_web("Analyze my recent contests and progress", 8)
    assert not should_ground_on_web("Explain binary search", len(chunks))
    public_query = sanitized_public_query(
        "My handle is user@example.com; what is my latest rating?"
    )
    assert "user@example.com" not in public_query
    assert "latest rating" in public_query
    assert "1600" not in sanitized_public_query(
        "My handle is tourist and my rating is 1600; compare rating systems."
    )
    sanitized = sanitized_public_query(
        "I solved 50 arrays and my rating is 1600; compare current strategies."
    )
    assert "50" not in sanitized
    assert "1600" not in sanitized
    identity_sanitized = sanitized_public_query(
        "I am Alice and my handle is tourist; what is the latest contest format?"
    )
    assert "alice" not in identity_sanitized.lower()
    assert "tourist" not in identity_sanitized.lower()
    hints = public_topic_hints(
        {
            "profile": {"handle": "private-handle"},
            "roadmap": {
                "topics": [
                    {"name": "Sliding Window", "lane": "current_focus"},
                    {
                        "topic": "graphs",
                        "name": "Graphs",
                        "lane": "needs_more_practice",
                    },
                    {"name": "Trees", "lane": "skipped"},
                    {
                        "topic": "linked-lists",
                        "name": "Linked Lists",
                        "lane": "current_focus",
                    },
                ]
            },
            "excludedTopics": ["linked-lists"],
        }
    )
    assert hints == ("Sliding Window", "Graphs")
    hinted_query = sanitized_public_query("Recommend practice problems", hints)
    assert "Sliding Window" in hinted_query
    assert "private-handle" not in hinted_query


class StaticModel:
    async def respond(self, request: CoachRequest) -> CoachModelOutput:
        assert request.conversationId == CONVERSATION_ID
        assert isinstance(request.context.get("retrieval"), dict)
        return CoachModelOutput(
            answer="Start with one foundation problem, then explain your approach.",
            evidence=[],
            proposals=[],
        )


class AuditRepository:
    def __init__(self) -> None:
        self.saved = []

    async def save(self, audit: Any) -> UUID:
        self.saved.append(audit)
        return CONVERSATION_ID


@pytest.mark.asyncio
async def test_coach_uses_conversation_topic_for_private_knowledge_lookup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    queries: list[str] = []
    service = CoachService(
        settings(), model=StaticModel(), audit_repository=AuditRepository()
    )

    async def retrieve(query: str, excluded_topics: object):
        del excluded_topics
        queries.append(query)
        return retrieve_knowledge(query, limit=8)

    monkeypatch.setattr(service, "_retrieve_knowledge", retrieve)
    request = request_payload().model_copy(
        update={
            "question": "Why does that work?",
            "transientContext": None,
            "context": {
                "recentTurns": [
                    {"role": "user", "content": "Explain a sliding-window invariant."},
                    {"role": "assistant", "content": "Maintain a valid window."},
                    {"role": "user", "content": "Why does that work?"},
                ]
            },
        }
    )
    await service.respond(request)
    assert "sliding-window" in queries[0]


@pytest.mark.asyncio
async def test_hint_guidance_is_used_only_for_specific_problem_help() -> None:
    prompts: list[str] = []

    class GuidanceModel:
        async def respond(self, request: CoachRequest) -> CoachModelOutput:
            guidance = request.context["coachingGuidance"]
            assert isinstance(guidance, dict)
            prompts.append(str(guidance["prompt"]))
            return CoachModelOutput(answer="A focused explanation.")

    service = CoachService(
        settings(), model=GuidanceModel(), audit_repository=AuditRepository()
    )
    await service.respond(
        request_payload().model_copy(update={"transientContext": None})
    )
    await service.respond(
        request_payload().model_copy(
            update={
                "question": "Give me a hint for this problem.",
                "transientContext": None,
            }
        )
    )
    assert "Do not switch into a hint ladder" in prompts[0]
    assert "Offer one numbered hint at a time" in prompts[1]


@pytest.mark.asyncio
async def test_service_returns_validated_output_and_audits_context_fingerprint() -> (
    None
):
    audits = AuditRepository()
    service = CoachService(settings(), model=StaticModel(), audit_repository=audits)

    output = await service.respond(request_payload())

    assert output.answer.startswith("Start with one foundation")
    assert len(audits.saved) == 1
    assert audits.saved[0].conversation_id == CONVERSATION_ID
    assert len(audits.saved[0].context_fingerprint) == 64
    assert audits.saved[0].knowledge_retrieved is True
    assert audits.saved[0].memory_retrieved is False
    assert audits.saved[0].web_grounding_used is False


@pytest.mark.asyncio
async def test_web_grounding_is_separated_from_model_text_and_bounded(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    async def fake_ground(
        settings: AiSettings, question: str, topic_hints: tuple[str, ...]
    ) -> PublicResearch:
        del settings
        captured["question"] = sanitized_public_query(question)
        captured["topic_hints"] = topic_hints
        return PublicResearch(
            summary="Public search summary.",
            citations=[
                PublicCitation(
                    id=f"web-{index}",
                    title=f"Source {index}",
                    url=f"https://example.com/{index}",
                )
                for index in range(8)
            ],
            searched=True,
        )

    monkeypatch.setattr("app.coach_service.ground_public_question", fake_ground)

    class ResearchModel:
        async def respond(self, request: CoachRequest) -> CoachModelOutput:
            retrieval = request.context["retrieval"]
            assert isinstance(retrieval, dict)
            assert retrieval["webGroundingUsed"] is True
            assert len(retrieval["publicResearch"]["citations"]) == 5
            return CoachModelOutput(answer="Use the supplied public comparison.")

    service = CoachService(
        settings(),
        model=ResearchModel(),
        audit_repository=AuditRepository(),
    )
    output = await service.respond(
        request_payload().model_copy(
            update={
                "question": "What is the latest public contest format for my handle?"
            }
        )
    )

    assert "my" not in str(captured["question"]).lower()
    assert "handle" not in str(captured["question"]).lower()
    assert len([item for item in output.citations if item.source == "web"]) == 5
    assert output.answer == "Use the supplied public comparison."


@pytest.mark.asyncio
async def test_untrusted_grounding_metadata_is_skipped_safely(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_ground(
        settings: AiSettings, question: str, topic_hints: tuple[str, ...]
    ) -> PublicResearch:
        del settings, question, topic_hints
        return PublicResearch(
            summary="Public search summary.",
            citations=[
                PublicCitation(
                    id="web-1",
                    title="https://attacker.example/instruction",
                    url="https://example.com/source",
                ),
                PublicCitation(
                    id="web-2",
                    title="Safe source",
                    url="https://example.com/source-2",
                ),
            ],
            searched=True,
        )

    monkeypatch.setattr("app.coach_service.ground_public_question", fake_ground)

    class ResearchModel:
        async def respond(self, request: CoachRequest) -> CoachModelOutput:
            del request
            return CoachModelOutput(answer="Use the supplied public comparison.")

    service = CoachService(
        settings(), model=ResearchModel(), audit_repository=AuditRepository()
    )
    output = await service.respond(
        request_payload().model_copy(
            update={"question": "What is the latest public contest format?"}
        )
    )

    assert [
        citation.id for citation in output.citations if citation.source == "web"
    ] == ["web-2"]


@pytest.mark.asyncio
async def test_unconfigured_service_fails_without_fabricating_advice() -> None:
    audits = AuditRepository()
    service = CoachService(
        settings(llm_api_key=""), model=None, audit_repository=audits
    )

    with pytest.raises(CoachNotConfiguredError):
        await service.respond(request_payload())

    assert audits.saved[0].fallback is True
    assert audits.saved[0].fallback_reason == "not_configured"
