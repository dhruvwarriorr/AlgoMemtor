"""Calls from the AI service back to the core (Express) API."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse
from uuid import UUID

import httpx

from .settings import AiSettings

LIVE_REFRESH_PROVIDERS = frozenset({"codeforces", "codechef", "leetcode", "cses"})


def live_refresh_available(settings: AiSettings) -> bool:
    url = urlparse(settings.core_api_url)
    return (
        url.scheme in {"http", "https"}
        and bool(url.netloc)
        and bool(settings.internal_service_token)
    )


async def request_live_refresh(
    settings: AiSettings, learner_id: UUID, provider: str
) -> dict[str, Any]:
    """Ask the core API to fetch a learner's newest data from one platform.

    The core API owns provider access, rate limits, and storage; this only
    relays the learner ID and platform and returns its bounded summary.
    """
    if provider not in LIVE_REFRESH_PROVIDERS:
        return {"error": "Unknown platform."}
    if not live_refresh_available(settings):
        return {"error": "Live platform refresh is not configured."}
    url = f"{settings.core_api_url.rstrip('/')}/internal/coach/live-refresh"
    try:
        async with httpx.AsyncClient(
            timeout=settings.coach_live_refresh_timeout_seconds
        ) as client:
            response = await client.post(
                url,
                json={"learnerId": str(learner_id), "provider": provider},
                headers={"x-internal-service-token": settings.internal_service_token},
            )
    except httpx.HTTPError:
        return {"error": "The platform could not be refreshed right now."}
    if response.status_code != 200:
        return {"error": "The platform could not be refreshed right now."}
    try:
        body = response.json()
    except ValueError:
        return {"error": "The platform refresh returned an invalid response."}
    data = body.get("data") if isinstance(body, dict) else None
    return (
        data
        if isinstance(data, dict)
        else {"error": "The platform refresh returned an invalid response."}
    )


async def request_problem_content(
    settings: AiSettings, reference: dict[str, str]
) -> dict[str, Any]:
    """Read a platform problem statement through the core provider adapters.

    ``reference`` is ``{"url": ...}`` or ``{"provider": ..., "externalId": ...}``.
    """
    if not live_refresh_available(settings):
        return {"error": "Problem lookup is not configured."}
    url = f"{settings.core_api_url.rstrip('/')}/internal/coach/problem-content"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                url,
                json=reference,
                headers={"x-internal-service-token": settings.internal_service_token},
            )
    except httpx.HTTPError:
        return {"error": "The problem could not be opened right now."}
    if response.status_code == 404:
        return {"error": "That problem or link is not a known platform problem."}
    if response.status_code != 200:
        return {"error": "The problem could not be opened right now."}
    try:
        body = response.json()
    except ValueError:
        return {"error": "The problem lookup returned an invalid response."}
    data = body.get("data") if isinstance(body, dict) else None
    return (
        data
        if isinstance(data, dict)
        else {"error": "The problem lookup returned an invalid response."}
    )
