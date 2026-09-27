from typing import Any

import pytest
from app.main import app
from app.roadmap_note_models import RoadmapNoteClassification, RoadmapNoteRequest
from app.roadmap_note_service import (
    ProviderRoadmapNoteModel,
    RoadmapNoteGenerationError,
    RoadmapNoteNotConfiguredError,
    RoadmapNoteService,
    get_roadmap_note_service,
)
from app.settings import AiSettings, get_ai_settings
from fastapi.testclient import TestClient


def settings(**updates: Any) -> AiSettings:
    values = {
        "internal_service_token": "internal-test-token",
        **updates,
    }
    return AiSettings(_env_file=None, **values)


class StaticModel:
    def __init__(self, result: RoadmapNoteClassification | BaseException) -> None:
        self.result = result

    async def classify(self, request: RoadmapNoteRequest) -> RoadmapNoteClassification:
        del request
        if isinstance(self.result, BaseException):
            raise self.result
        return self.result


def request_payload() -> dict[str, Any]:
    return {
        "topics": [
            {"slug": "sliding-window", "name": "Sliding Window", "currentStatus": None},
            {"slug": "arrays", "name": "Arrays", "currentStatus": "working_on"},
        ],
        "note": "I am pretty good at sliding window now, no need to keep suggesting it.",
    }


@pytest.mark.asyncio
async def test_service_returns_classification_from_the_model() -> None:
    service = RoadmapNoteService(
        settings(),
        StaticModel(
            RoadmapNoteClassification(
                topic="sliding-window",
                status="practiced",
                rationale="Learner reports comfort.",
            )
        ),
    )
    result = await service.classify(
        RoadmapNoteRequest.model_validate(request_payload())
    )

    assert result.topic == "sliding-window"
    assert result.status == "practiced"
    assert result.rationale == "Learner reports comfort."


@pytest.mark.asyncio
async def test_service_passes_through_no_change() -> None:
    service = RoadmapNoteService(
        settings(),
        StaticModel(
            RoadmapNoteClassification(
                topic=None, status="no_change", rationale="Unclear."
            )
        ),
    )
    result = await service.classify(
        RoadmapNoteRequest.model_validate(request_payload())
    )

    assert result.topic is None
    assert result.status == "no_change"


@pytest.mark.asyncio
async def test_service_rejects_a_topic_outside_the_candidate_list() -> None:
    service = RoadmapNoteService(
        settings(),
        StaticModel(
            RoadmapNoteClassification(
                topic="graphs", status="practiced", rationale="Hallucinated topic."
            )
        ),
    )
    result = await service.classify(
        RoadmapNoteRequest.model_validate(request_payload())
    )

    assert result.topic is None
    assert result.status == "no_change"


@pytest.mark.asyncio
async def test_service_forces_no_change_when_no_topic_is_identified() -> None:
    service = RoadmapNoteService(
        settings(),
        StaticModel(
            RoadmapNoteClassification(
                topic=None, status="practiced", rationale="Bad output."
            )
        ),
    )
    result = await service.classify(
        RoadmapNoteRequest.model_validate(request_payload())
    )

    assert result.topic is None
    assert result.status == "no_change"


@pytest.mark.asyncio
async def test_service_redacts_an_unsafe_rationale() -> None:
    service = RoadmapNoteService(
        settings(),
        StaticModel(
            RoadmapNoteClassification(
                topic="arrays",
                status="skip_for_now",
                rationale="See https://example.com for details.",
            )
        ),
    )
    result = await service.classify(
        RoadmapNoteRequest.model_validate(request_payload())
    )

    assert "https://" not in result.rationale
    assert result.status == "skip_for_now"


@pytest.mark.asyncio
async def test_service_raises_when_not_configured() -> None:
    service = RoadmapNoteService(
        settings(
            app_environment="production",
            ai_provider="openrouter",
            openrouter_api_key="",
        )
    )

    with pytest.raises(RoadmapNoteNotConfiguredError):
        await service.classify(RoadmapNoteRequest.model_validate(request_payload()))


@pytest.mark.asyncio
async def test_service_wraps_model_failures() -> None:
    service = RoadmapNoteService(settings(), StaticModel(RuntimeError("provider down")))

    with pytest.raises(RoadmapNoteGenerationError):
        await service.classify(RoadmapNoteRequest.model_validate(request_payload()))


@pytest.mark.asyncio
async def test_provider_model_sends_untrusted_note_and_candidate_topics() -> None:
    request = RoadmapNoteRequest.model_validate(request_payload())

    class RecordingStructuredModel:
        def __init__(self) -> None:
            self.messages: tuple[tuple[str, str], tuple[str, str]] | None = None

        async def ainvoke(self, messages: list[tuple[str, str]]) -> dict[str, Any]:
            self.messages = tuple(messages)  # type: ignore[assignment]
            return {
                "parsed": RoadmapNoteClassification(
                    topic="sliding-window",
                    status="practiced",
                    rationale="Learner reports comfort.",
                ),
            }

    structured = RecordingStructuredModel()
    model = ProviderRoadmapNoteModel.__new__(ProviderRoadmapNoteModel)
    model.structured_model = structured

    result = await model.classify(request)

    assert result.topic == "sliding-window"
    assert structured.messages is not None
    system_message, human_message = structured.messages
    assert system_message[0] == "system"
    assert "untrusted learner" in system_message[1]
    assert human_message[0] == "human"
    assert "sliding-window" in human_message[1]
    assert "arrays" in human_message[1]


def test_internal_endpoint_requires_configured_constant_time_token() -> None:
    service = RoadmapNoteService(
        settings(),
        StaticModel(
            RoadmapNoteClassification(
                topic="sliding-window",
                status="practiced",
                rationale="Learner reports comfort.",
            )
        ),
    )
    app.dependency_overrides[get_ai_settings] = lambda: settings()
    app.dependency_overrides[get_roadmap_note_service] = lambda: service

    try:
        with TestClient(app) as client:
            missing = client.post(
                "/internal/coach/roadmap-note", json=request_payload()
            )
            wrong = client.post(
                "/internal/coach/roadmap-note",
                headers={"X-Internal-Service-Token": "wrong"},
                json=request_payload(),
            )
            accepted = client.post(
                "/internal/coach/roadmap-note",
                headers={"X-Internal-Service-Token": "internal-test-token"},
                json=request_payload(),
            )
    finally:
        app.dependency_overrides.clear()

    assert missing.status_code == 401
    assert wrong.status_code == 401
    assert accepted.status_code == 200
    assert accepted.json() == {
        "topic": "sliding-window",
        "status": "practiced",
        "rationale": "Learner reports comfort.",
    }


def test_internal_endpoint_keeps_a_null_topic_for_core() -> None:
    service = RoadmapNoteService(
        settings(),
        StaticModel(
            RoadmapNoteClassification(
                topic=None, status="no_change", rationale="Two topics named."
            )
        ),
    )
    app.dependency_overrides[get_ai_settings] = lambda: settings()
    app.dependency_overrides[get_roadmap_note_service] = lambda: service
    try:
        with TestClient(app) as client:
            response = client.post(
                "/internal/coach/roadmap-note",
                headers={"X-Internal-Service-Token": "internal-test-token"},
                json=request_payload(),
            )
    finally:
        app.dependency_overrides.clear()

    # Core's contract requires the key, even when no topic was identified.
    assert response.json() == {
        "topic": None,
        "status": "no_change",
        "rationale": "Two topics named.",
    }


def test_internal_endpoint_is_unavailable_when_classification_is_not_configured() -> (
    None
):
    app.dependency_overrides[get_ai_settings] = lambda: settings()
    app.dependency_overrides[get_roadmap_note_service] = lambda: RoadmapNoteService(
        settings(
            app_environment="production",
            ai_provider="openrouter",
            openrouter_api_key="",
        )
    )

    try:
        with TestClient(app) as client:
            response = client.post(
                "/internal/coach/roadmap-note",
                headers={"X-Internal-Service-Token": "internal-test-token"},
                json=request_payload(),
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503


def test_internal_endpoint_rejects_an_empty_topic_list() -> None:
    app.dependency_overrides[get_ai_settings] = lambda: settings()

    try:
        with TestClient(app) as client:
            payload = request_payload()
            payload["topics"] = []
            response = client.post(
                "/internal/coach/roadmap-note",
                headers={"X-Internal-Service-Token": "internal-test-token"},
                json=payload,
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
