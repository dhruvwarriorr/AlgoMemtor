from typing import Any

import pytest
from app.settings import AiSettings
from app.web_grounding import PublicCitation, PublicResearch
from app.web_search import SearchResults, groq_search_citations, search_public_web


def settings() -> AiSettings:
    return AiSettings(_env_file=None)


def test_groq_search_results_are_read_from_executed_tools() -> None:
    message = {
        "executed_tools": [
            {"type": "browser.open", "search_results": None},
            {
                "type": "browser_search",
                "search_results": {
                    "results": [
                        {"title": "D. Falling Concrete", "url": "https://youtu.be/x"},
                        {"title": "dup", "url": "https://youtu.be/x"},
                        {"title": "local", "url": "https://127.0.0.1/admin"},
                        {"title": "", "url": "https://github.com/a/b"},
                    ]
                },
            },
        ]
    }
    citations = groq_search_citations(message)
    assert [(item.title, item.url) for item in citations] == [
        ("D. Falling Concrete", "https://youtu.be/x"),
        ("https://github.com/a/b", "https://github.com/a/b"),
    ]


@pytest.mark.asyncio
async def test_grounding_is_used_first() -> None:
    async def ground(*_args: Any, **_kwargs: Any) -> PublicResearch:
        return PublicResearch(
            summary="found",
            citations=[PublicCitation(id="w1", title="t", url="https://a.dev/x")],
            searched=True,
        )

    async def groq(*_args: Any) -> SearchResults:
        raise AssertionError("not needed")

    result = await search_public_web(
        settings(), "q", instruction="i", ground=ground, groq_search=groq
    )
    assert result is not None and result.provider == "gemini"


@pytest.mark.asyncio
async def test_groq_search_takes_over_when_grounding_is_out_of_quota() -> None:
    async def ground(*_args: Any, **_kwargs: Any) -> PublicResearch:
        raise RuntimeError("429 RESOURCE_EXHAUSTED")

    async def groq(*_args: Any) -> SearchResults:
        return SearchResults(
            summary="",
            citations=[PublicCitation(id="w1", title="t", url="https://b.dev/y")],
            provider="groq",
        )

    result = await search_public_web(
        settings(), "q", instruction="i", ground=ground, groq_search=groq
    )
    assert result is not None and result.provider == "groq"
    assert result.citations[0].url == "https://b.dev/y"
