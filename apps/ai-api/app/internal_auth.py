from hmac import compare_digest
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from .settings import AiSettings, get_ai_settings


def require_internal_service(
    settings: Annotated[AiSettings, Depends(get_ai_settings)],
    supplied_token: Annotated[
        str | None, Header(alias="X-Internal-Service-Token")
    ] = None,
) -> None:
    configured_token = settings.internal_service_token
    if not configured_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Internal ranking is not configured.",
        )

    if supplied_token is None or not compare_digest(
        supplied_token.encode(), configured_token.encode()
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal service token.",
        )
