"""Turn a raw model payload into a validated coach answer without losing it.

The strict Pydantic contract in ``coach_models`` stays the source of truth for
what may leave this service. Models, however, routinely produce answers that
are *almost* valid: a reference URL inside prose, a sixth suggested question,
one malformed proposal. Rejecting the entire turn for that makes the coach look
broken, so this module repairs what can be repaired (redacting links, trimming
lists, truncating text) and drops only the individual items that cannot be.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

from pydantic import ValidationError

from .coach_models import (
    CoachEvidence,
    CoachModelOutput,
    CoachPresentation,
    CoachProposal,
)

ANSWER_LIMIT = 12_000

_URL = re.compile(r"(?:https?://|www\.)[^\s)\]>\"'`]+", re.IGNORECASE)
_EMAIL = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
_SECRET = re.compile(
    r"\bbearer\s+[A-Za-z0-9._~+/=-]{12,}|"
    r"\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*\S+",
    re.IGNORECASE,
)
_DATASET_IDS = {
    "learner-summary",
    "topic-assessments",
    "practice-trend-30d",
    "contest-rating-history",
    "trusted-problems",
    "topic-comparison",
}
_PROBLEM_ID = re.compile(r"(?:codeforces|codechef|leetcode|cses):[^\s:][^\s]{0,127}")
_WEB_CITATION_ID = re.compile(r"web-[1-9][0-9]{0,2}")


def _host_only(match: re.Match[str]) -> str:
    """Keep the site name so prose still reads naturally, drop the link."""
    raw = match.group(0)
    candidate = raw if raw.lower().startswith("http") else f"https://{raw}"
    try:
        host = (urlparse(candidate).hostname or "").lower()
    except ValueError:
        host = ""
    host = host.removeprefix("www.")
    return host or "[link removed]"


_MARKDOWN_LINK = re.compile(r"(?<!!)\[([^\]\n]{1,200})\]\(([^)\s]{0,2048})\)")


def redact_text(value: str) -> str:
    # Keep a Markdown link's text, drop its target: links are attached by the
    # application from validated citations, never from model prose.
    parts = re.split(r"(```[\s\S]*?```)", value)
    text = "".join(
        part
        if part.startswith("```")
        else _MARKDOWN_LINK.sub(lambda m: m.group(1), part)
        for part in parts
    )
    text = _URL.sub(_host_only, text)
    text = _EMAIL.sub("[contact removed]", text)
    return _SECRET.sub("[secret removed]", text)


def _clip(value: object, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    text = redact_text(value).strip()
    if not text:
        return None
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _truncate_answer(answer: str) -> str:
    if len(answer) <= ANSWER_LIMIT:
        return answer
    cut = answer[: ANSWER_LIMIT - 80]
    # Never leave a dangling open code fence: it would swallow the rest of
    # the rendered message.
    if cut.count("```") % 2 == 1:
        cut = cut[: cut.rfind("```")].rstrip()
    return cut.rstrip() + "\n\n_(Answer shortened. Ask me to continue.)_"


def _evidence(items: object) -> list[CoachEvidence]:
    if not isinstance(items, list):
        return []
    evidence: list[CoachEvidence] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        label = _clip(item.get("label"), 160)
        detail = _clip(item.get("detail"), 500)
        if label is None or detail is None:
            continue
        completeness = item.get("completeness")
        try:
            evidence.append(
                CoachEvidence(
                    source=item.get("source"),  # type: ignore[arg-type]
                    label=label,
                    detail=detail,
                    completeness=completeness
                    if completeness in {"complete", "partial", "unknown"}
                    else "partial",
                    stale=item.get("stale") is True,
                )
            )
        except ValidationError:
            continue
        if len(evidence) == 12:
            break
    return evidence


def _proposals(items: object) -> list[CoachProposal]:
    if not isinstance(items, list):
        return []
    proposals: list[CoachProposal] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        payload = {key: value for key, value in item.items() if value is not None}
        for key, limit in (("label", 160), ("reason", 500), ("memoryText", 500)):
            if key in payload:
                clipped = _clip(payload[key], limit)
                if clipped is None:
                    payload.pop(key)
                else:
                    payload[key] = clipped
        try:
            proposals.append(CoachProposal.model_validate(payload))
        except ValidationError:
            continue
        if len(proposals) == 8:
            break
    return proposals


def _presentation(value: object) -> CoachPresentation | None:
    if not isinstance(value, dict):
        return None

    def strings(key: str) -> list[str]:
        raw = value.get(key)
        return (
            [item.strip() for item in raw if isinstance(item, str) and item.strip()]
            if isinstance(raw, list)
            else []
        )

    questions: list[str] = []
    for question in strings("suggestedQuestions"):
        clipped = _clip(question, 240)
        if clipped and clipped not in questions and "removed]" not in clipped:
            questions.append(clipped)
    return CoachPresentation(
        datasetIds=[
            item
            for item in dict.fromkeys(strings("datasetIds"))
            if item in _DATASET_IDS
        ][:6],
        problemIds=[
            item
            for item in dict.fromkeys(strings("problemIds"))
            if _PROBLEM_ID.fullmatch(item)
        ][:5],
        webProblemCitationIds=[
            item
            for item in dict.fromkeys(strings("webProblemCitationIds"))
            if _WEB_CITATION_ID.fullmatch(item)
        ][:5],
        suggestedQuestions=questions[:4],
    )


def coerce_coach_output(raw: object) -> CoachModelOutput | None:
    """Repair a raw model payload. Returns ``None`` only without a usable answer."""
    if isinstance(raw, CoachModelOutput):
        return raw
    if not isinstance(raw, dict):
        return None
    answer = raw.get("answer")
    if not isinstance(answer, str) or not answer.strip():
        return None
    try:
        return CoachModelOutput(
            answer=_truncate_answer(redact_text(answer).strip()),
            evidence=_evidence(raw.get("evidence")),
            proposals=_proposals(raw.get("proposals")),
            presentation=_presentation(raw.get("presentation")),
        )
    except ValidationError:
        return None


def coach_output_json_schema() -> dict[str, Any]:
    """A permissive schema for the final-answer tool.

    Validation happens in ``coerce_coach_output``; a looser declaration keeps
    Gemini from failing function calls over pattern constraints it cannot see.
    """
    evidence_sources = [
        "profile",
        "analytics",
        "activity",
        "progress",
        "roadmap",
        "memory",
        "recommendations",
        "contest",
    ]
    return {
        "type": "object",
        "properties": {
            "answer": {
                "type": "string",
                "description": (
                    "The complete markdown answer shown to the learner. Use "
                    "headings, lists, tables, LaTeX-free math, and fenced code "
                    "blocks where they help. Never include URLs."
                ),
            },
            "evidence": {
                "type": "array",
                "description": "Up to 12 learner-data facts that support personal claims.",
                "items": {
                    "type": "object",
                    "properties": {
                        "source": {"type": "string", "enum": evidence_sources},
                        "label": {"type": "string"},
                        "detail": {"type": "string"},
                        "completeness": {
                            "type": "string",
                            "enum": ["complete", "partial", "unknown"],
                        },
                        "stale": {"type": "boolean"},
                    },
                    "required": ["source", "label", "detail", "completeness"],
                },
            },
            "proposals": {
                "type": "array",
                "description": (
                    "Optional confirmation-gated learner actions. Usually empty."
                ),
                "items": {
                    "type": "object",
                    "properties": {
                        "actionType": {
                            "type": "string",
                            "enum": [
                                "set_topic_status",
                                "save_memory",
                                "set_problem_status",
                                "bookmark_problem",
                                "mark_problem_solved",
                            ],
                        },
                        "label": {"type": "string"},
                        "reason": {"type": "string"},
                        "topic": {"type": "string"},
                        "topicStatus": {
                            "type": "string",
                            "enum": [
                                "working_on",
                                "practiced",
                                "completed",
                                "revisit",
                                "skip_for_now",
                            ],
                        },
                        "problem": {
                            "type": "object",
                            "properties": {
                                "provider": {
                                    "type": "string",
                                    "enum": [
                                        "codeforces",
                                        "codechef",
                                        "leetcode",
                                        "cses",
                                    ],
                                },
                                "externalId": {"type": "string"},
                            },
                            "required": ["provider", "externalId"],
                        },
                        "learnerStatus": {
                            "type": "string",
                            "enum": ["unsolved", "attempted", "solved"],
                        },
                        "memoryText": {"type": "string"},
                        "memoryCategory": {"type": "string"},
                    },
                    "required": ["actionType", "label", "reason"],
                },
            },
            "presentation": {
                "type": "object",
                "properties": {
                    "datasetIds": {
                        "type": "array",
                        "items": {"type": "string", "enum": sorted(_DATASET_IDS)},
                    },
                    "problemIds": {
                        "type": "array",
                        "description": "Exact provider:externalId practice problem IDs from tools or context.",
                        "items": {"type": "string"},
                    },
                    "webProblemCitationIds": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "suggestedQuestions": {
                        "type": "array",
                        "description": "Two to four short follow-up questions the learner could ask next.",
                        "items": {"type": "string"},
                    },
                },
            },
        },
        "required": ["answer"],
    }
