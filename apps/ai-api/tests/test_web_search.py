from typing import Any

import pytest
from app.settings import AiSettings
from app.web_grounding import PublicCitation, PublicResearch
from app.web_search import search_public_web


def settings() -> AiSettings:
    return AiSettings(_env_file=None)


@pytest.mark.asyncio
async def test_openrouter_grounding_result_is_returned() -> None:
    async def ground(*_args: Any, **_kwargs: Any) -> PublicResearch:
        return PublicResearch(
            summary="found",
            citations=[PublicCitation(id="w1", title="t", url="https://a.dev/x")],
            searched=True,
        )

    result = await search_public_web(settings(), "q", instruction="i", ground=ground)
    assert result is not None
    assert result.provider == "openrouter"
    assert result.citations[0].url == "https://a.dev/x"


@pytest.mark.asyncio
async def test_search_failure_is_optional_and_does_not_call_another_cloud() -> None:
    calls = 0

    async def ground(*_args: Any, **_kwargs: Any) -> PublicResearch:
        nonlocal calls
        calls += 1
        raise RuntimeError("429 temporary provider failure")

    result = await search_public_web(settings(), "q", instruction="i", ground=ground)
    assert result is None
    assert calls == 1
