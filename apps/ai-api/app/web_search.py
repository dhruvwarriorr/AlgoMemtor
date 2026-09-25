from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from .settings import AiSettings
from .web_grounding import PublicCitation, ground_public_question

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SearchResults:
    summary: str
    citations: list[PublicCitation]
    provider: str


async def search_public_web(
    settings: AiSettings,
    query: str,
    topic_hints: tuple[str, ...] = (),
    *,
    instruction: str,
    ground: Any = ground_public_question,
) -> SearchResults | None:
    try:
        research = await ground(settings, query, topic_hints, instruction=instruction)
    except Exception as error:  # noqa: BLE001 - search is optional
        logger.info(
            "openrouter_web_search_failed", extra={"error": type(error).__name__}
        )
        return None
    if research is None or not research.citations:
        return None
    return SearchResults(
        summary=research.summary,
        citations=research.citations,
        provider="openrouter",
    )
