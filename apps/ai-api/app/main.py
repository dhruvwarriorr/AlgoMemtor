import json
import logging
from contextlib import asynccontextmanager
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import Body, Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from .auth import AuthenticatedUser, require_authenticated_user
from .coach_models import (
    CoachCheckInRequest,
    CoachCheckInResponse,
    CoachRequest,
    CoachResponse,
    CoachResponseProposal,
)
from .coach_service import (
    CoachGenerationError,
    CoachNotConfiguredError,
    CoachRateLimitedError,
    get_coach_service,
)
from .internal_auth import require_internal_service
from .memory_models import (
    MemoryActionRequest,
    MemoryActionResponse,
    MemoryCleanupRequest,
    MemoryCleanupResponse,
    MemoryConsolidationRequest,
    MemoryConsolidationResponse,
    MemoryCorrectionRequest,
    MemoryDeleteRequest,
    MemoryEvidenceCleanupResponse,
    MemoryEvidenceDeleteRequest,
    MemoryProcessRequest,
    MemoryProcessResponse,
    MemoryProposalRequest,
    MemoryRetrievalResponse,
    MemoryUserInputRequest,
    StoredMemory,
)
from .memory_repository import (
    MemoryConflictError,
    MemoryOwnershipError,
    MemoryRepositoryError,
    MemoryStorageError,
    NullMemoryRepository,
)
from .memory_service import MemoryNotFoundError, MemoryService, get_memory_service
from .mentor_models import (
    ContestAnalysisRequest,
    ContestNarrativeOutput,
    ContestPatternsOutput,
    ContestPatternsRequest,
    ProblemHelpRequest,
    ProblemHelpResponse,
    ProgressNarrativeOutput,
    ProgressNarrativeRequest,
    SolutionChatRequest,
    SolutionChatResponse,
    SolutionRequest,
    SolutionResponse,
)
from .mentor_service import (
    MentorGenerationError,
    MentorNotConfiguredError,
    MentorProblemUnavailableError,
    MentorRateLimitedError,
    MentorService,
    get_mentor_service,
)
from .ranking_models import RankingRequest, RankingResponse
from .ranking_service import RankingService, get_ranking_service
from .rate_limit import InMemoryRateLimiter, rate_limit_internal_request
from .roadmap_note_models import RoadmapNoteRequest, RoadmapNoteResponse
from .roadmap_note_service import (
    RoadmapNoteGenerationError,
    RoadmapNoteNotConfiguredError,
    RoadmapNoteService,
    get_roadmap_note_service,
)
from .settings import get_ai_settings

OPTIONAL_CLEANUP_BODY = Body(default=None)
logger = logging.getLogger(__name__)
internal_rate_limiter = InMemoryRateLimiter(
    limit=get_ai_settings().internal_rate_limit_per_minute
)


async def initialize_ai_resources() -> None:
    """Warm durable RAG resources once per worker, outside request paths."""
    coach = get_coach_service()
    if coach.knowledge_repository is not None:
        try:
            await coach.knowledge_repository.seed_default(
                coach.embedder,
                coach.settings.embedding_model,
                coach.settings.embedding_timeout_seconds,
            )
        except Exception:
            logger.warning(
                "Knowledge index warm-up failed; static retrieval remains available",
                exc_info=True,
            )
    memory_service = get_memory_service()
    if isinstance(memory_service.repository, NullMemoryRepository):
        logger.warning("Memory persistence disabled: DATABASE_URL not configured")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await initialize_ai_resources()
    yield


app = FastAPI(title="AlgoMemtor AI API", version="0.1.0", lifespan=lifespan)


@app.middleware("http")
async def limit_internal_requests(request, call_next):
    return await rate_limit_internal_request(request, call_next, internal_rate_limiter)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai-api"}


@app.get("/api/me")
async def authenticated_user(
    user: Annotated[AuthenticatedUser, Depends(require_authenticated_user)],
) -> dict[str, dict[str, str]]:
    return {"user": {"id": user.subject}}


@app.post(
    "/internal/recommendations/rank",
    response_model=RankingResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def rank_recommendations(
    request: RankingRequest,
    service: Annotated[RankingService, Depends(get_ranking_service)],
) -> RankingResponse:
    return await service.rank(request)


@app.post(
    "/internal/coach/roadmap-note",
    response_model=RoadmapNoteResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def classify_roadmap_note(
    request: RoadmapNoteRequest,
    service: Annotated[RoadmapNoteService, Depends(get_roadmap_note_service)],
) -> RoadmapNoteResponse:
    try:
        return await service.classify(request)
    except RoadmapNoteNotConfiguredError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Roadmap-note classification is not configured.",
        ) from error
    except RoadmapNoteGenerationError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Roadmap-note classification is temporarily unavailable.",
        ) from error


@app.post(
    "/internal/coach/respond",
    response_model=CoachResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def respond_as_coach(
    request: CoachRequest,
) -> CoachResponse:
    service = get_coach_service()
    try:
        output = await service.respond(request)
    except CoachNotConfiguredError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI coach is not configured.",
        ) from error
    except CoachRateLimitedError as error:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="The AI coach has reached its model usage limit.",
            headers={"Retry-After": "60"},
        ) from error
    except CoachGenerationError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI coach is temporarily unavailable.",
        ) from error
    return CoachResponse(
        answer=output.answer,
        evidence=output.evidence,
        proposals=[
            CoachResponseProposal(id=uuid4(), **proposal.model_dump())
            for proposal in output.proposals
        ],
        citations=output.citations,
        presentation=output.presentation,
    )


@app.post(
    "/internal/coach/respond/stream",
    dependencies=[Depends(require_internal_service)],
)
async def stream_coach_response(request: CoachRequest) -> StreamingResponse:
    """Return one validated response event using the coach's SSE transport.

    Generation remains atomically validated before anything is emitted. This
    gives clients a cancelable streaming contract without exposing partial or
    malformed model output.
    """
    service = get_coach_service()
    try:
        output = await service.respond(request)
    except CoachNotConfiguredError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI coach is not configured.",
        ) from error
    except CoachRateLimitedError as error:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="The AI coach has reached its model usage limit.",
            headers={"Retry-After": "60"},
        ) from error
    except CoachGenerationError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI coach is temporarily unavailable.",
        ) from error
    payload = CoachResponse(
        answer=output.answer,
        evidence=output.evidence,
        proposals=[
            CoachResponseProposal(id=uuid4(), **proposal.model_dump())
            for proposal in output.proposals
        ],
        citations=output.citations,
        presentation=output.presentation,
    ).model_dump(mode="json", exclude_none=True)

    async def events():
        yield f"event: coach.response\ndata: {json.dumps(payload)}\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post(
    "/internal/coach/check-ins/generate",
    response_model=CoachCheckInResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def generate_coach_check_in(
    request: CoachCheckInRequest,
) -> CoachCheckInResponse:
    service = get_coach_service()
    try:
        return await service.generate_check_in(request)
    except CoachNotConfiguredError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI coach is not configured.",
        ) from error
    except CoachRateLimitedError as error:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="The AI coach has reached its model usage limit.",
            headers={"Retry-After": "60"},
        ) from error
    except CoachGenerationError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI coach is temporarily unavailable.",
        ) from error


@app.delete(
    "/internal/coach/conversations/{learner_id}/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_internal_service)],
)
async def delete_coach_conversation_audit(
    learner_id: UUID,
    conversation_id: UUID,
) -> None:
    service = get_coach_service()
    await service.delete_conversation_audit(learner_id, conversation_id)


@app.delete(
    "/internal/coach/learners/{learner_id}/audits",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_internal_service)],
)
async def delete_coach_learner_audits(learner_id: UUID) -> None:
    service = get_coach_service()
    await service.delete_learner_audits(learner_id)


def _raise_memory_http_error(error: Exception) -> None:
    if isinstance(error, (MemoryNotFoundError, MemoryOwnershipError)):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Memory resource was not found.",
        ) from error
    if isinstance(error, MemoryConflictError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Memory resource cannot be changed in its current state.",
        ) from error
    if isinstance(error, (MemoryStorageError, MemoryRepositoryError)):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Memory service is temporarily unavailable.",
        ) from error
    raise error


@app.post(
    "/internal/memory/process",
    response_model=MemoryProcessResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def process_memory_evidence(
    request: MemoryProcessRequest,
    service: Annotated[MemoryService, Depends(get_memory_service)],
) -> MemoryProcessResponse:
    try:
        return await service.process(request)
    except (MemoryNotFoundError, MemoryRepositoryError) as error:
        _raise_memory_http_error(error)
        raise AssertionError("Memory error handler did not raise.")


@app.post(
    "/internal/memory/delete",
    response_model=MemoryCleanupResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def delete_memory_data(
    request: MemoryDeleteRequest,
    service: Annotated[MemoryService, Depends(get_memory_service)],
    idempotency_key: Annotated[str | None, Header(alias="X-Idempotency-Key")] = None,
) -> MemoryCleanupResponse:
    request_id = (
        idempotency_key or request.idempotencyKey or f"delete_{request.learnerId.hex}"
    )
    cleanup_request = MemoryCleanupRequest(
        requestId=request_id,
        reason=request.reason,
    )
    return await _cleanup_memory_data(request.learnerId, cleanup_request, service)


@app.get(
    "/internal/learners/{learner_id}/memories",
    response_model=MemoryRetrievalResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def retrieve_learner_memories(
    learner_id: UUID,
    service: Annotated[MemoryService, Depends(get_memory_service)],
    query: Annotated[str | None, Query(max_length=500)] = None,
    limit: Annotated[int, Query(ge=1, le=20)] = 15,
) -> MemoryRetrievalResponse:
    try:
        return await service.retrieve(learner_id, query, limit)
    except (MemoryNotFoundError, MemoryRepositoryError) as error:
        _raise_memory_http_error(error)
        raise AssertionError("Memory error handler did not raise.")


@app.get(
    "/internal/learners/{learner_id}/memory-list",
    response_model=list[StoredMemory],
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def list_learner_memories(
    learner_id: UUID,
    service: Annotated[MemoryService, Depends(get_memory_service)],
) -> list[StoredMemory]:
    try:
        return await service.list_memories(learner_id)
    except (MemoryNotFoundError, MemoryRepositoryError) as error:
        _raise_memory_http_error(error)
        raise AssertionError("Memory error handler did not raise.")


@app.post(
    "/internal/learners/{learner_id}/memories/consolidate",
    response_model=MemoryConsolidationResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def consolidate_learner_memories(
    learner_id: UUID,
    request: MemoryConsolidationRequest,
    service: Annotated[MemoryService, Depends(get_memory_service)],
) -> MemoryConsolidationResponse:
    try:
        return await service.consolidate(learner_id, request)
    except (MemoryConflictError, MemoryNotFoundError, MemoryRepositoryError) as error:
        _raise_memory_http_error(error)
        raise AssertionError("Memory error handler did not raise.")


@app.post(
    "/internal/learners/{learner_id}/memories/propose",
    response_model=MemoryActionResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def propose_learner_memory(
    learner_id: UUID,
    request: MemoryProposalRequest,
    service: Annotated[MemoryService, Depends(get_memory_service)],
) -> MemoryActionResponse:
    try:
        return await service.propose(learner_id, request)
    except (MemoryNotFoundError, MemoryRepositoryError) as error:
        _raise_memory_http_error(error)
        raise AssertionError("Memory error handler did not raise.")


@app.post(
    "/internal/learners/{learner_id}/memories/user-input",
    response_model=MemoryActionResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def create_user_learner_memory(
    learner_id: UUID,
    request: MemoryUserInputRequest,
    service: Annotated[MemoryService, Depends(get_memory_service)],
) -> MemoryActionResponse:
    try:
        return await service.create_user_input(learner_id, request)
    except (MemoryConflictError, MemoryNotFoundError, MemoryRepositoryError) as error:
        _raise_memory_http_error(error)
        raise AssertionError("Memory error handler did not raise.")


@app.patch(
    "/internal/learners/{learner_id}/memories/{memory_id}",
    response_model=MemoryActionResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
@app.post(
    "/internal/learners/{learner_id}/memories/{memory_id}/correct",
    response_model=MemoryActionResponse,
    response_model_exclude_none=True,
    include_in_schema=False,
    dependencies=[Depends(require_internal_service)],
)
async def correct_learner_memory(
    learner_id: UUID,
    memory_id: UUID,
    request: MemoryCorrectionRequest,
    service: Annotated[MemoryService, Depends(get_memory_service)],
) -> MemoryActionResponse:
    try:
        return await service.correct(learner_id, memory_id, request)
    except (MemoryNotFoundError, MemoryRepositoryError) as error:
        _raise_memory_http_error(error)
        raise AssertionError("Memory error handler did not raise.")


@app.post(
    "/internal/learners/{learner_id}/memories/{memory_id}/archive",
    response_model=MemoryActionResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def archive_learner_memory(
    learner_id: UUID,
    memory_id: UUID,
    request: MemoryActionRequest,
    service: Annotated[MemoryService, Depends(get_memory_service)],
) -> MemoryActionResponse:
    try:
        return await service.archive(learner_id, memory_id, request.requestId)
    except (MemoryNotFoundError, MemoryRepositoryError) as error:
        _raise_memory_http_error(error)
        raise AssertionError("Memory error handler did not raise.")


@app.post(
    "/internal/learners/{learner_id}/memories/{memory_id}/approve",
    response_model=MemoryActionResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def approve_learner_memory(
    learner_id: UUID,
    memory_id: UUID,
    request: MemoryActionRequest,
    service: Annotated[MemoryService, Depends(get_memory_service)],
) -> MemoryActionResponse:
    try:
        return await service.approve(learner_id, memory_id, request.requestId)
    except (MemoryNotFoundError, MemoryRepositoryError) as error:
        _raise_memory_http_error(error)
        raise AssertionError("Memory error handler did not raise.")


@app.post(
    "/internal/learners/{learner_id}/memories/{memory_id}/restore",
    response_model=MemoryActionResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def restore_learner_memory(
    learner_id: UUID,
    memory_id: UUID,
    request: MemoryActionRequest,
    service: Annotated[MemoryService, Depends(get_memory_service)],
) -> MemoryActionResponse:
    try:
        return await service.restore(learner_id, memory_id, request.requestId)
    except (MemoryNotFoundError, MemoryRepositoryError) as error:
        _raise_memory_http_error(error)
        raise AssertionError("Memory error handler did not raise.")


@app.delete(
    "/internal/learners/{learner_id}/memories/{memory_id}",
    response_model=MemoryActionResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def delete_learner_memory(
    learner_id: UUID,
    memory_id: UUID,
    request: MemoryActionRequest,
    service: Annotated[MemoryService, Depends(get_memory_service)],
) -> MemoryActionResponse:
    try:
        return await service.delete(learner_id, memory_id, request.requestId)
    except (MemoryNotFoundError, MemoryRepositoryError) as error:
        _raise_memory_http_error(error)
        raise AssertionError("Memory error handler did not raise.")


async def _cleanup_memory_data(
    learner_id: UUID,
    request: MemoryCleanupRequest,
    service: MemoryService,
) -> MemoryCleanupResponse:
    try:
        counts = await service.cleanup(learner_id, request.requestId, request.reason)
    except (MemoryNotFoundError, MemoryRepositoryError) as error:
        _raise_memory_http_error(error)
        raise AssertionError("Memory error handler did not raise.")
    return MemoryCleanupResponse(
        requestId=request.requestId,
        learnerId=learner_id,
        reason=request.reason,
        deletedMemories=counts.deleted_memories,
        deletedEvidence=counts.deleted_evidence,
        deletedSummaries=counts.deleted_summaries,
        deletedJobs=counts.deleted_jobs,
        deletedAudits=counts.deleted_audits,
        idempotent=all(
            count == 0
            for count in (
                counts.deleted_memories,
                counts.deleted_evidence,
                counts.deleted_summaries,
                counts.deleted_jobs,
                counts.deleted_audits,
            )
        ),
    )


async def _delete_problem_memory_evidence(
    learner_id: UUID,
    request: MemoryEvidenceDeleteRequest,
    service: MemoryService,
) -> MemoryEvidenceCleanupResponse:
    if request.learnerId is not None and request.learnerId != learner_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The learner in the request does not match the route owner.",
        )
    try:
        counts = await service.delete_problem_evidence(
            learner_id,
            request.requestId,
            request.problemProvider,
            request.problemExternalId,
        )
    except (MemoryNotFoundError, MemoryRepositoryError) as error:
        _raise_memory_http_error(error)
        raise AssertionError("Memory error handler did not raise.")
    return MemoryEvidenceCleanupResponse(
        requestId=request.requestId,
        learnerId=learner_id,
        reason="manual_request",
        problemProvider=request.problemProvider,
        problemExternalId=request.problemExternalId,
        deletedMemories=counts.deleted_memories,
        deletedEvidence=counts.deleted_evidence,
        deletedSummaries=counts.deleted_summaries,
        deletedJobs=counts.deleted_jobs,
        deletedAudits=counts.deleted_audits,
        idempotent=all(
            count == 0
            for count in (
                counts.deleted_memories,
                counts.deleted_evidence,
                counts.deleted_summaries,
                counts.deleted_jobs,
                counts.deleted_audits,
            )
        ),
    )


@app.delete(
    "/internal/learners/{learner_id}/memory-evidence",
    response_model=MemoryEvidenceCleanupResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def delete_learner_problem_memory_evidence(
    learner_id: UUID,
    request: MemoryEvidenceDeleteRequest,
    service: Annotated[MemoryService, Depends(get_memory_service)],
) -> MemoryEvidenceCleanupResponse:
    return await _delete_problem_memory_evidence(learner_id, request, service)


@app.delete(
    "/internal/memory/evidence/delete",
    response_model=MemoryEvidenceCleanupResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def delete_memory_problem_evidence(
    request: MemoryEvidenceDeleteRequest,
    service: Annotated[MemoryService, Depends(get_memory_service)],
) -> MemoryEvidenceCleanupResponse:
    if request.learnerId is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A learnerId is required for memory evidence deletion.",
        )
    return await _delete_problem_memory_evidence(
        request.learnerId,
        request,
        service,
    )


@app.post(
    "/internal/learners/{learner_id}/memory-consent/revoke",
    response_model=MemoryCleanupResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def revoke_memory_consent(
    learner_id: UUID,
    request: MemoryCleanupRequest,
    service: Annotated[MemoryService, Depends(get_memory_service)],
) -> MemoryCleanupResponse:
    if request.reason != "consent_revoked":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Consent cleanup requires reason=consent_revoked.",
        )
    return await _cleanup_memory_data(learner_id, request, service)


@app.delete(
    "/internal/learners/{learner_id}/memory-data",
    response_model=MemoryCleanupResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def delete_learner_memory_data(
    learner_id: UUID,
    request: MemoryCleanupRequest,
    service: Annotated[MemoryService, Depends(get_memory_service)],
) -> MemoryCleanupResponse:
    return await _cleanup_memory_data(learner_id, request, service)


@app.delete(
    "/internal/learners/{learner_id}/preference-memory",
    response_model=MemoryCleanupResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def delete_learner_preference_memory(
    learner_id: UUID,
    request: MemoryCleanupRequest,
    service: Annotated[MemoryService, Depends(get_memory_service)],
) -> MemoryCleanupResponse:
    if request.reason != "profile_preference_changed":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Preference cleanup requires reason=profile_preference_changed.",
        )
    return await _cleanup_memory_data(learner_id, request, service)


@app.delete(
    "/internal/learners/{learner_id}",
    response_model=MemoryCleanupResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def delete_learner_memory_owner(
    learner_id: UUID,
    service: Annotated[MemoryService, Depends(get_memory_service)],
    request: MemoryCleanupRequest | None = OPTIONAL_CLEANUP_BODY,
) -> MemoryCleanupResponse:
    cleanup_request = request or MemoryCleanupRequest(
        requestId=f"learner_delete_{learner_id.hex}",
        reason="learner_deleted",
    )
    if cleanup_request.reason != "learner_deleted":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Learner deletion requires reason=learner_deleted.",
        )
    return await _cleanup_memory_data(learner_id, cleanup_request, service)


def _raise_mentor_http_error(error: Exception) -> None:
    if isinstance(error, MentorProblemUnavailableError):
        raise HTTPException(
            # 424, not 422: FastAPI already uses 422 for invalid requests.
            status_code=status.HTTP_424_FAILED_DEPENDENCY,
            detail="PROBLEM_UNREADABLE",
        ) from error
    if isinstance(error, MentorNotConfiguredError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Mentor tools are not configured.",
        ) from error
    if isinstance(error, MentorRateLimitedError):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="The mentor model is rate limited. Try again shortly.",
        ) from error
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Mentor tools are temporarily unavailable.",
    ) from error


_MENTOR_ERRORS = (
    MentorNotConfiguredError,
    MentorGenerationError,
    MentorProblemUnavailableError,
)


@app.post(
    "/internal/mentor/problem-help",
    response_model=ProblemHelpResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def mentor_problem_help(
    request: ProblemHelpRequest,
    service: Annotated[MentorService, Depends(get_mentor_service)],
) -> ProblemHelpResponse:
    try:
        return await service.problem_help(request)
    except _MENTOR_ERRORS as error:
        _raise_mentor_http_error(error)
        raise AssertionError("Mentor error handler did not raise.") from error


@app.post(
    "/internal/mentor/solutions",
    response_model=SolutionResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def mentor_solutions(
    request: SolutionRequest,
    service: Annotated[MentorService, Depends(get_mentor_service)],
) -> SolutionResponse:
    try:
        return await service.solutions(request)
    except _MENTOR_ERRORS as error:
        _raise_mentor_http_error(error)
        raise AssertionError("Mentor error handler did not raise.") from error


@app.post(
    "/internal/mentor/solution-chat",
    response_model=SolutionChatResponse,
    dependencies=[Depends(require_internal_service)],
)
async def mentor_solution_chat(
    request: SolutionChatRequest,
    service: Annotated[MentorService, Depends(get_mentor_service)],
) -> SolutionChatResponse:
    try:
        return await service.solution_chat(request)
    except _MENTOR_ERRORS as error:
        _raise_mentor_http_error(error)
        raise AssertionError("Mentor error handler did not raise.") from error


@app.post(
    "/internal/mentor/contest-analysis",
    response_model=ContestNarrativeOutput,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def mentor_contest_analysis(
    request: ContestAnalysisRequest,
    service: Annotated[MentorService, Depends(get_mentor_service)],
) -> ContestNarrativeOutput:
    try:
        return await service.contest_analysis(request)
    except _MENTOR_ERRORS as error:
        _raise_mentor_http_error(error)
        raise AssertionError("Mentor error handler did not raise.") from error


@app.post(
    "/internal/mentor/contest-patterns",
    response_model=ContestPatternsOutput,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def mentor_contest_patterns(
    request: ContestPatternsRequest,
    service: Annotated[MentorService, Depends(get_mentor_service)],
) -> ContestPatternsOutput:
    try:
        return await service.contest_patterns(request)
    except _MENTOR_ERRORS as error:
        _raise_mentor_http_error(error)
        raise AssertionError("Mentor error handler did not raise.") from error


@app.post(
    "/internal/mentor/progress-narrative",
    response_model=ProgressNarrativeOutput,
    response_model_exclude_none=True,
    dependencies=[Depends(require_internal_service)],
)
async def mentor_progress_narrative(
    request: ProgressNarrativeRequest,
    service: Annotated[MentorService, Depends(get_mentor_service)],
) -> ProgressNarrativeOutput:
    try:
        return await service.progress_narrative(request)
    except _MENTOR_ERRORS as error:
        _raise_mentor_http_error(error)
        raise AssertionError("Mentor error handler did not raise.") from error
