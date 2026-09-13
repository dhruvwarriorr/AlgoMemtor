from typing import Annotated

from fastapi import Depends, FastAPI

from .auth import AuthenticatedUser, require_authenticated_user
from .internal_auth import require_internal_service
from .ranking_models import RankingRequest, RankingResponse
from .ranking_service import RankingService, get_ranking_service

app = FastAPI(title="AlgoMemtor AI API", version="0.1.0")


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
