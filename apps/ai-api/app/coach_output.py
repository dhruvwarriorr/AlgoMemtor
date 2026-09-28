"""Turn a raw model payload into a validated coach answer without losing it.

The strict Pydantic contract in ``coach_models`` stays the source of truth for
what may leave this service. Models, however, routinely produce answers that
are *almost* valid: a reference URL inside prose, a sixth suggested question,
one malformed proposal. Rejecting the entire turn for that makes the coach look
broken, so this module repairs what can be repaired (redacting links, trimming
lists, truncating text) and drops only the individual items that cannot be.
"""

from __future__ import annotations

import json
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
from .web_reader import normalize_public_url

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


def redact_text(value: str, *, keep_urls: bool = False) -> str:
    """Remove contacts and secrets; links too unless ``keep_urls``.

    Answers keep their links here and are filtered against the turn's allowed
    URLs by ``restrict_links``, which keeps safe public https links.
    """
    if not keep_urls:
        parts = re.split(r"(```[\s\S]*?```)", value)
        value = "".join(
            part
            if part.startswith("```")
            else _MARKDOWN_LINK.sub(lambda m: m.group(1), part)
            for part in parts
        )
        value = _URL.sub(_host_only, value)
    text = _EMAIL.sub("[contact removed]", value)
    return _SECRET.sub("[secret removed]", text)


def _normal_url(value: str) -> str:
    return value.rstrip(".,;:!?").rstrip("/")


def _is_clickable(url: str) -> bool:
    return url.lower().startswith("https://") and normalize_public_url(url) is not None


def restrict_links(value: str, allowed: set[str] | frozenset[str] | None = None) -> str:
    """Keep answer links clickable when they are safe public https URLs.

    With ``allowed`` given, only those URLs stay clickable. Unsafe links
    (other schemes, credentials, private or internal hosts) are always reduced
    to their site name.
    """
    allowed_normal = None if allowed is None else {_normal_url(url) for url in allowed}

    def keep(url: str) -> bool:
        if not _is_clickable(url.rstrip(".,;:!?")):
            return False
        return allowed_normal is None or _normal_url(url) in allowed_normal

    def link(match: re.Match[str]) -> str:
        return match.group(0) if keep(match.group(2)) else match.group(1)

    def bare(match: re.Match[str]) -> str:
        raw = match.group(0)
        trailing = raw[len(raw.rstrip(".,;:!?")) :]
        if keep(raw):
            return raw
        return _host_only(match) if not trailing else _host_only(match) + trailing

    def clean(part: str) -> str:
        placeholders: list[str] = []

        def keep_markdown(match: re.Match[str]) -> str:
            placeholders.append(link(match))
            return f"\u0000{len(placeholders) - 1}\u0000"

        text = _MARKDOWN_LINK.sub(keep_markdown, part)
        text = _URL.sub(bare, text)
        return re.sub(
            "\u0000(\\d+)\u0000", lambda m: placeholders[int(m.group(1))], text
        )

    parts = re.split(r"(```[\s\S]*?```)", value)
    cleaned = [part if part.startswith("```") else clean(part) for part in parts]
    return "".join(cleaned)


_PROBLEM_ID_IN_PARENS = re.compile(
    r"\s*\(\s*`?(?:codeforces|codechef|leetcode|cses):[^\s`()]{1,128}`?\s*\)",
    re.IGNORECASE,
)
_BARE_PROBLEM_ID = re.compile(
    r"`?\b(?:codeforces|codechef|leetcode|cses):[A-Za-z0-9_\-/]{1,128}`?",
    re.IGNORECASE,
)


def strip_problem_ids(value: str) -> str:
    """Remove raw ``provider:externalId`` tokens from answer prose.

    Internal identifiers are not what learners see on the platform (LeetCode's
    internal id 1007 is public problem 967), so printing them reads as a wrong
    or invented reference. Problem cards carry the trusted links instead.
    Fenced code is left untouched.
    """
    parts = re.split(r"(```[\s\S]*?```)", value)
    cleaned = []
    for part in parts:
        if part.startswith("```"):
            cleaned.append(part)
            continue
        text = _PROBLEM_ID_IN_PARENS.sub("", part)
        text = _BARE_PROBLEM_ID.sub("", text)
        text = re.sub(r"[ \t]{2,}", " ", text)
        text = re.sub(r" +([,.;:])", r"\1", text)
        cleaned.append(text)
    return "".join(cleaned)


_LATEX_SYMBOLS = {
    r"\log": "log",
    r"\ln": "ln",
    r"\lg": "lg",
    r"\min": "min",
    r"\max": "max",
    r"\gcd": "gcd",
    r"\bmod": "mod",
    r"\pmod": "mod",
    r"\mod": "mod",
    r"\leq": "≤",
    r"\le": "≤",
    r"\geq": "≥",
    r"\ge": "≥",
    r"\neq": "≠",
    r"\ne": "≠",
    r"\approx": "≈",
    r"\cdot": "·",
    r"\cdots": "…",
    r"\ldots": "…",
    r"\dots": "…",
    r"\times": "×",
    r"\div": "÷",
    r"\pm": "±",
    r"\infty": "∞",
    r"\to": "→",
    r"\rightarrow": "→",
    r"\Rightarrow": "⇒",
    r"\leftarrow": "←",
    r"\iff": "⇔",
    r"\implies": "⇒",
    r"\in": "∈",
    r"\notin": "∉",
    r"\subseteq": "⊆",
    r"\subset": "⊂",
    r"\cup": "∪",
    r"\cap": "∩",
    r"\sum": "Σ",
    r"\prod": "Π",
    r"\forall": "∀",
    r"\exists": "∃",
    r"\oplus": "⊕",
    r"\land": "∧",
    r"\lor": "∨",
    r"\neg": "¬",
    r"\lfloor": "⌊",
    r"\rfloor": "⌋",
    r"\lceil": "⌈",
    r"\rceil": "⌉",
    r"\alpha": "α",
    r"\beta": "β",
    r"\gamma": "γ",
    r"\delta": "δ",
    r"\epsilon": "ε",
    r"\lambda": "λ",
    r"\mu": "μ",
    r"\pi": "π",
    r"\sigma": "σ",
    r"\theta": "θ",
    r"\phi": "φ",
    r"\omega": "ω",
    r"\Theta": "Θ",
    r"\Omega": "Ω",
    r"\left": "",
    r"\right": "",
    r"\,": " ",
    r"\;": " ",
    r"\!": "",
    r"\quad": " ",
    r"\qquad": " ",
}
_SUPERSCRIPTS = str.maketrans("0123456789+-n", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿ")
_MATH_SPAN = re.compile(
    r"\$\$([^$]{1,400})\$\$|\$([^$\n]{1,200})\$|\\\((.{1,200}?)\\\)"
)


def _plain_formula(formula: str) -> str:
    text = formula
    for _ in range(3):
        text = re.sub(r"\\frac\{([^{}]*)\}\{([^{}]*)\}", r"(\1)/(\2)", text)
        text = re.sub(r"\\sqrt\{([^{}]*)\}", r"√(\1)", text)
        text = re.sub(
            r"\\(?:text|mathrm|mathbf|mathit|mathcal|operatorname|textbf)\{([^{}]*)\}",
            r"\1",
            text,
        )
    for command in sorted(_LATEX_SYMBOLS, key=len, reverse=True):
        text = re.sub(
            re.escape(command) + r"(?![A-Za-z])", _LATEX_SYMBOLS[command], text
        )
    text = re.sub(
        r"\^\{?([0-9+\-n]{1,3})\}?",
        lambda m: m.group(1).translate(_SUPERSCRIPTS),
        text,
    )
    text = re.sub(r"\^\{([^{}]*)\}", r"^(\1)", text)
    text = re.sub(r"_\{([^{}]*)\}", r"_\1", text)
    text = text.replace(r"\{", "{").replace(r"\}", "}").replace("\\\\", " ")
    text = re.sub(r"\\([A-Za-z]+)", r"\1", text)
    return re.sub(r"\s{2,}", " ", text).strip()


def _math_replacement(match: re.Match[str]) -> str:
    formula = match.group(1) or match.group(2) or match.group(3) or ""
    # "$5 and $10" is money, not math: TeX spans hug their content and carry
    # at least one math character. Models also pad spans ("$ O(n) $"); a
    # padded span still counts when it holds something only TeX writes.
    if match.group(2) is not None:
        hugged = formula == formula.strip() and re.search(
            r"[\\^_=()+*/<>a-zA-Z]", formula
        )
        padded_tex = re.search(r"[\\^_]|\bO\(", formula)
        if not (hugged or padded_tex):
            return match.group(0)
    return _plain_formula(formula)


def plain_math(value: str) -> str:
    """Turn LaTeX math (``$O(N \\log N)$``) into readable plain text.

    The chat renders Markdown without a math engine, so raw LaTeX showed up as
    dollar signs and backslashes. Code blocks and inline code are untouched.
    """
    parts = re.split(r"(```[\s\S]*?```|`[^`\n]*`)", value)
    return "".join(
        part if part.startswith("`") else _MATH_SPAN.sub(_math_replacement, part)
        for part in parts
    )


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


_JSON_ANSWER = re.compile(r"^\s*(?:```(?:json)?\s*)?\{")
_JSON_DECODER = json.JSONDecoder(strict=False)


def _unwrap_json_answer(raw: dict[str, Any]) -> dict[str, Any]:
    """Recover a reply the model wrote as JSON text instead of structured output.

    Answering in prose rather than through the final tool (or the plain-text
    path) puts the model's whole payload, ``{"presentation": ..., "answer":
    ...}``, into the answer text, and the learner would see raw JSON. The
    inner answer replaces it; the inner lists fill only fields the outer
    payload left empty.
    """
    answer = raw.get("answer")
    if not isinstance(answer, str) or not _JSON_ANSWER.match(answer):
        return raw
    text = answer.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        text = text.rsplit("```", 1)[0]
    text = text[text.find("{") :]
    for candidate in (text, text.replace("\u201c", '"').replace("\u201d", '"')):
        try:
            inner, _ = _JSON_DECODER.raw_decode(candidate)
        except ValueError:
            continue
        inner_answer = inner.get("answer") if isinstance(inner, dict) else None
        if not isinstance(inner_answer, str) or not inner_answer.strip():
            continue
        merged: dict[str, Any] = {**raw, "answer": inner_answer}
        for key in ("evidence", "proposals"):
            if not raw.get(key) and isinstance(inner.get(key), list):
                merged[key] = inner[key]
        outer_presentation = raw.get("presentation")
        inner_presentation = inner.get("presentation")
        if isinstance(inner_presentation, dict):
            merged["presentation"] = {
                **inner_presentation,
                **{
                    key: value
                    for key, value in (
                        outer_presentation.items()
                        if isinstance(outer_presentation, dict)
                        else []
                    )
                    if value
                },
            }
        return merged
    return raw


def coerce_coach_output(raw: object) -> CoachModelOutput | None:
    """Repair a raw model payload. Returns ``None`` only without a usable answer."""
    if isinstance(raw, CoachModelOutput):
        return raw
    if not isinstance(raw, dict):
        return None
    raw = _unwrap_json_answer(_unwrap_json_answer(raw))
    answer = raw.get("answer")
    if not isinstance(answer, str) or not answer.strip():
        return None
    try:
        return CoachModelOutput(
            answer=_truncate_answer(
                plain_math(
                    strip_problem_ids(redact_text(answer, keep_urls=True))
                ).strip()
            ),
            evidence=_evidence(raw.get("evidence")),
            proposals=_proposals(raw.get("proposals")),
            presentation=_presentation(raw.get("presentation")),
        )
    except ValidationError:
        return None


def coach_output_json_schema() -> dict[str, Any]:
    """A permissive schema for the final-answer tool.

    Validation happens in ``coerce_coach_output``; a looser declaration keeps
    providers from failing function calls over pattern constraints they cannot see.
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
