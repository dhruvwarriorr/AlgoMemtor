"""Public web search for mentor tools, with a second provider as fallback.

Gemini's Google Search grounding is used first. Its quota is separate from
normal generation and runs out quickly on small plans, so when it fails or
finds nothing the search is repeated through Groq's built-in `browser_search`
tool (gpt-oss models). Only result titles and URLs are used; callers validate
every URL before showing it.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any

from .settings import AiSettings
from .web_grounding import (
    PublicCitation,
    _is_safe_public_https_url,
    ground_public_question,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SearchResults:
    summary: str
    citations: list[PublicCitation]
    provider: str


def _field(value: Any, name: str) -> Any:
    if isinstance(value, dict):
        return value.get(name)
    return getattr(value, name, None)


def groq_search_citations(message: Any, limit: int = 8) -> list[PublicCitation]:
    """Result links from the `browser_search` calls in a Groq message."""
    citations: list[PublicCitation] = []
    seen: set[str] = set()
    for tool in _field(message, "executed_tools") or []:
        if _field(tool, "type") not in {"browser_search", "search"}:
            continue
        results = _field(_field(tool, "search_results"), "results") or []
        for result in results:
            url = _field(result, "url")
            title = _field(result, "title")
            if not isinstance(url, str) or not _is_safe_public_https_url(url):
                continue
            if url in seen:
                continue
            seen.add(url)
            citations.append(
                PublicCitation(
                    id=f"web-{len(citations) + 1}",
                    title=(title if isinstance(title, str) and title.strip() else url)[
                        :160
                    ],
                    url=url,
                )
            )
            if len(citations) == limit:
                return citations
    return citations


async def _groq_search(
    settings: AiSettings, query: str, instruction: str
) -> SearchResults | None:
    if not settings.groq_api_key or not settings.web_search_groq_model:
        return None
    from groq import AsyncGroq

    client = AsyncGroq(api_key=settings.groq_api_key, max_retries=1)
    async with asyncio.timeout(settings.web_search_timeout_seconds):
        response = await client.chat.completions.create(
            model=settings.web_search_groq_model,
            messages=[{"role": "user", "content": f"{instruction}\n\n{query}"}],
            tools=[{"type": "browser_search"}],
            tool_choice="required",
            max_completion_tokens=1_500,
        )
    message = response.choices[0].message
    citations = groq_search_citations(message)
    if not citations:
        return None
    return SearchResults(
        summary=(message.content or "").strip()[:4_000],
        citations=citations,
        provider="groq",
    )


async def search_public_web(
    settings: AiSettings,
    query: str,
    topic_hints: tuple[str, ...] = (),
    *,
    instruction: str,
    ground: Any = ground_public_question,
    groq_search: Any = _groq_search,
) -> SearchResults | None:
    """Search the public web; None when neither provider finds anything."""
    try:
        research = await ground(settings, query, topic_hints, instruction=instruction)
    except Exception as error:  # noqa: BLE001 - fall back to the next provider
        logger.info(
            "web_search_grounding_failed", extra={"error": type(error).__name__}
        )
        research = None
    if research is not None and research.citations:
        return SearchResults(
            summary=research.summary, citations=research.citations, provider="gemini"
        )
    try:
        return await groq_search(settings, query, instruction)
    except Exception as error:  # noqa: BLE001 - search is optional
        logger.info("web_search_groq_failed", extra={"error": type(error).__name__})
        return None
