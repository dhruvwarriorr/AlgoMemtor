from typing import Annotated

from fastapi import Depends, FastAPI

from .auth import AuthenticatedUser, require_authenticated_user

app = FastAPI(title="AlgoMemtor AI API", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai-api"}


@app.get("/api/me")
async def authenticated_user(
    user: Annotated[AuthenticatedUser, Depends(require_authenticated_user)],
) -> dict[str, dict[str, str]]:
    return {"user": {"id": user.subject}}
