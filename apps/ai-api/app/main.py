from typing import Annotated
from uuid import UUID

from fastapi import Body, Depends, FastAPI, Header, HTTPException, Query, status

from .auth import AuthenticatedUser, require_authenticated_user
from .internal_auth import require_internal_service
from .memory_models import (
    MemoryActionRequest,
    MemoryActionResponse,
    MemoryCleanupRequest,
    MemoryCleanupResponse,
    MemoryCorrectionRequest,
    MemoryDeleteRequest,
    MemoryEvidenceCleanupResponse,
    MemoryEvidenceDeleteRequest,
    MemoryProcessRequest,
    MemoryProcessResponse,
    MemoryRetrievalResponse,
)
from .memory_repository import (
    MemoryConflictError,
    MemoryOwnershipError,
    MemoryRepositoryError,
    MemoryStorageError,
)
from .memory_service import MemoryNotFoundError, MemoryService, get_memory_service
from .ranking_models import RankingRequest, RankingResponse
from .ranking_service import RankingService, get_ranking_service

app = FastAPI(title="AlgoMemtor AI API", version="0.1.0")
OPTIONAL_CLEANUP_BODY = Body(default=None)


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
    limit: Annotated[int, Query(ge=1, le=5)] = 5,
) -> MemoryRetrievalResponse:
    try:
        return await service.retrieve(learner_id, query, limit)
    except (MemoryNotFoundError, MemoryRepositoryError) as error:
        _raise_memory_http_error(error)
        raise AssertionError("Memory error handler did not raise.")


@app.get(
    "/internal/learners/{learner_id}/memory-list",
    response_model=list,
    dependencies=[Depends(require_internal_service)],
)
async def list_learner_memories(
    learner_id: UUID,
    service: Annotated[MemoryService, Depends(get_memory_service)],
) -> list:
    try:
        return await service.list_memories(learner_id)
    except (MemoryNotFoundError, MemoryRepositoryError) as error:
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
