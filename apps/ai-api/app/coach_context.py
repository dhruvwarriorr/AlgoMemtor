"""Per-turn token budgets and relevance-ranked context packing for the Coach.

Sending the whole learner context and one fixed output ceiling on every turn
made simple questions slow and let long answers run out of room on Groq. Each
turn now gets:

- a tier (quick, standard, deep) from deterministic signals in the question;
- an output budget and reasoning depth sized for that tier, kept inside the
  provider's per-minute token allowance on Groq;
- an input budget, filled with the context sections that matter for this
  question. List items (topics, memories, recommendations, turns, knowledge)
  are ranked by relevance to the question, with the vector-ranked knowledge
  and memory order preserved, and packed greedily until the budget is used.
  What is left out is summarized so the model can fetch it with its tools.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Literal

from .coach_intent import is_complex_turn
from .settings import AiSettings

Tier = Literal["quick", "standard", "deep"]
Provider = Literal["gemini", "groq"]

# Characters per token for compact JSON and English prose; deliberately a
# little pessimistic so a packed context does not overshoot the budget.
_CHARS_PER_TOKEN = 3.6

_OUTPUT_TOKENS: dict[Provider, dict[Tier, int]] = {
    "gemini": {"quick": 2_048, "standard": 8_192, "deep": 65_536},
    "groq": {"quick": 900, "standard": 2_400, "deep": 8_192},
}
_INPUT_TOKENS: dict[Provider, dict[Tier, int]] = {
    "gemini": {"quick": 5_000, "standard": 12_000, "deep": 36_000},
    "groq": {"quick": 2_500, "standard": 4_500, "deep": 9_000},
}
_AGENT_STEPS: dict[Tier, int] = {"quick": 1, "standard": 2, "deep": 12}
_TOOL_RESULT_CHARS: dict[Tier, int] = {
    "quick": 6_000,
    "standard": 14_000,
    "deep": 30_000,
}

_QUICK = re.compile(
    r"^(?:what(?:'s| is| are)|which|how many|how much|when|who|list|show|"
    r"define|meaning of|is my|am i|do i|did i)\b",
    re.IGNORECASE,
)

# Question keywords that make a context section relevant.
_SECTION_SIGNALS: dict[str, re.Pattern[str]] = {
    "roadmap": re.compile(
        r"\b(plan|roadmap|focus|next|topic|topics|learn|study|weak|strong|"
        r"improve|practice|schedule|path|should i)\b",
        re.IGNORECASE,
    ),
    "activity": re.compile(
        r"\b(rating|progress|solved|streak|accuracy|stats?|history|submission|"
        r"submissions|how am i|doing|performance|trend|week|month|recent|"
        r"verdict|wrong|tle)\b",
        re.IGNORECASE,
    ),
    "contest": re.compile(
        r"\b(contest|round|div\.?\s*\d|rank|rated|virtual|upsolve)\b",
        re.IGNORECASE,
    ),
    "recommendations": re.compile(
        r"\b(recommend|suggest|problem|problems|question|questions|next|"
        r"practice|try|solve)\b",
        re.IGNORECASE,
    ),
    "memory": re.compile(
        r"\b(remember|prefer|preference|goal|told you|my style|last time|"
        r"earlier|before)\b",
        re.IGNORECASE,
    ),
    "personal": re.compile(
        r"\b(my|me|i|i'm|i've|mine|myself)\b",
        re.IGNORECASE,
    ),
}

# Always kept: they govern what the answer may say or are the question itself.
_REQUIRED_KEYS = (
    "turnKind",
    "excludedTopics",
    "userInstructions",
    "preferences",
    "coachingGuidance",
    "linkedProblems",
    "pastedUrls",
)


@dataclass(frozen=True)
class TurnBudget:
    tier: Tier
    output_tokens: int
    input_tokens: int
    agent_steps: int
    tool_result_chars: int
    deep_reasoning: bool


def estimate_tokens(value: object) -> int:
    text = (
        value
        if isinstance(value, str)
        else json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)
    )
    return int(len(text) / _CHARS_PER_TOKEN) + 1


def turn_tier(
    question: str,
    *,
    has_transient_context: bool = False,
    has_media: bool = False,
    has_linked_problems: bool = False,
) -> Tier:
    if has_linked_problems or is_complex_turn(
        question, has_transient_context=has_transient_context, has_media=has_media
    ):
        return "deep"
    words = len(question.split())
    if words <= 14 and _QUICK.search(question.strip()):
        return "quick"
    return "standard"


def plan_turn_budget(
    settings: AiSettings,
    *,
    provider: Provider,
    question: str,
    context: dict[str, object],
    has_transient_context: bool = False,
    has_media: bool = False,
) -> TurnBudget:
    tier = turn_tier(
        question,
        has_transient_context=has_transient_context,
        has_media=has_media,
        has_linked_problems=bool(context.get("linkedProblems")),
    )
    output = _OUTPUT_TOKENS[provider][tier]
    input_budget = _INPUT_TOKENS[provider][tier]
    if provider == "groq":
        output = min(output, settings.groq_max_completion_tokens)
        # Groq's on-demand tier meters input and output together per
        # minute. Keep one request inside that allowance, giving the answer
        # at least a third of it.
        allowance = settings.groq_tokens_per_minute - 300
        input_budget = min(input_budget, max(1_200, allowance * 2 // 3))
        output = max(600, min(output, allowance - input_budget))
    else:
        output = min(output, settings.coach_max_output_tokens)
    return TurnBudget(
        tier=tier,
        output_tokens=output,
        input_tokens=input_budget,
        agent_steps=min(_AGENT_STEPS[tier], settings.coach_agent_max_steps),
        tool_result_chars=_TOOL_RESULT_CHARS[tier],
        deep_reasoning=tier == "deep",
    )


# --- Relevance ---------------------------------------------------------------

_WORD = re.compile(r"[a-z0-9+#]+")
_STOP = frozenset(
    [
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "by",
        "can",
        "do",
        "for",
        "from",
        "how",
        "i",
        "in",
        "is",
        "it",
        "me",
        "my",
        "of",
        "on",
        "or",
        "so",
        "the",
        "this",
        "to",
        "was",
        "what",
        "when",
        "which",
        "why",
        "with",
        "you",
        "your",
        "should",
        "would",
        "could",
    ]
)
_SYNONYMS = {
    "dp": "dynamic programming",
    "bfs": "breadth first search graphs",
    "dfs": "depth first search graphs",
    "bs": "binary search",
    "seg": "segment tree",
    "dsu": "disjoint set union",
    "mst": "minimum spanning tree graphs",
    "nt": "number theory math",
    "greedy": "greedy",
    "graph": "graphs",
    "tree": "trees",
    "string": "strings",
}


def _terms(text: str) -> set[str]:
    words = [word for word in _WORD.findall(text.lower()) if word not in _STOP]
    expanded = set(words)
    for word in words:
        if word in _SYNONYMS:
            expanded.update(_SYNONYMS[word].split())
        if word.endswith("s") and len(word) > 3:
            expanded.add(word[:-1])
    return expanded


def relevance(question_terms: set[str], item: object) -> float:
    if not question_terms:
        return 0.0
    item_terms = _terms(
        item if isinstance(item, str) else json.dumps(item, default=str)[:2_000]
    )
    if not item_terms:
        return 0.0
    overlap = len(question_terms & item_terms)
    return overlap / (len(question_terms) ** 0.5)


def section_focus(question: str) -> dict[str, bool]:
    return {
        name: bool(pattern.search(question))
        for name, pattern in _SECTION_SIGNALS.items()
    }


def _rank(
    items: list[Any], question_terms: set[str], *, keep_order_weight: float = 0.0
) -> list[Any]:
    """Most relevant first; `keep_order_weight` favors the incoming order."""
    total = max(1, len(items))
    scored = [
        (
            relevance(question_terms, item) + keep_order_weight * (1 - index / total),
            -index,
            item,
        )
        for index, item in enumerate(items)
    ]
    scored.sort(key=lambda entry: (entry[0], entry[1]), reverse=True)
    return [item for _, _, item in scored]


def _take(items: list[Any], budget: int) -> tuple[list[Any], int]:
    """The longest prefix of `items` that fits in `budget` tokens."""
    kept: list[Any] = []
    used = 0
    for item in items:
        cost = estimate_tokens(item)
        if used + cost > budget:
            break
        kept.append(item)
        used += cost
    return kept, used


def pack_context(
    context: dict[str, object], question: str, budget_tokens: int
) -> dict[str, object]:
    """The context sections this question needs, within `budget_tokens`."""
    focus = section_focus(question)
    terms = _terms(question)
    personal = focus["personal"] or any(
        focus[name] for name in ("roadmap", "activity", "contest", "memory")
    )
    packed: dict[str, object] = {
        key: context[key] for key in _REQUIRED_KEYS if key in context
    }
    used = estimate_tokens(packed)
    omitted: dict[str, int] = {}

    def add(key: str, value: object, share: float) -> None:
        nonlocal used
        remaining = budget_tokens - used
        allowance = int(min(remaining, budget_tokens * share))
        if allowance <= 0:
            if value:
                omitted[key] = len(value) if isinstance(value, list) else 1
            return
        if isinstance(value, list):
            kept, cost = _take(value, allowance)
            if kept:
                packed[key] = kept
                used += cost
            if len(kept) < len(value):
                omitted[key] = len(value) - len(kept)
            return
        cost = estimate_tokens(value)
        if cost <= allowance:
            packed[key] = value
            used += cost
        else:
            omitted[key] = 1

    # Who the learner is: always, compactly.
    if "profile" in context:
        add("profile", context["profile"], 0.15)

    retrieval = context.get("retrieval")
    if isinstance(retrieval, dict):
        # Knowledge chunks arrive vector-ranked; keep that order but still
        # drop chunks that share nothing with the question when space is short.
        knowledge = retrieval.get("knowledge")
        packed_retrieval: dict[str, object] = {
            key: value for key, value in retrieval.items() if key not in {"knowledge"}
        }
        used += estimate_tokens(packed_retrieval)
        if isinstance(knowledge, list) and knowledge:
            kept, cost = _take(
                _rank(knowledge, terms, keep_order_weight=1.0),
                int(min(budget_tokens - used, budget_tokens * 0.35)),
            )
            packed_retrieval["knowledge"] = kept
            used += cost
            if len(kept) < len(knowledge):
                omitted["knowledge"] = len(knowledge) - len(kept)
        packed["retrieval"] = packed_retrieval

    recent = context.get("recentTurns")
    if isinstance(recent, list) and recent:
        # Newest turns matter most for follow-ups; keep them in order.
        newest_first = list(reversed(recent))
        kept, cost = _take(newest_first, int(budget_tokens * 0.2))
        packed["recentTurns"] = list(reversed(kept))
        used += cost
        if len(kept) < len(recent):
            omitted["recentTurns"] = len(recent) - len(kept)

    memories = context.get("memories")
    if isinstance(memories, list) and memories:
        # Memories arrive in retrieval order (vector + keyword); relevance to
        # this question re-ranks them before packing.
        add(
            "memories",
            _rank(memories, terms, keep_order_weight=0.5),
            0.15 if personal or focus["memory"] else 0.06,
        )

    ordered_sections: list[tuple[str, float, bool]] = [
        ("roadmap", 0.25, focus["roadmap"] or focus["recommendations"]),
        ("activityDigest", 0.2, focus["activity"] or focus["contest"]),
        ("profileDigest", 0.15, focus["activity"]),
        ("providerProfiles", 0.1, focus["activity"] or focus["contest"]),
        ("currentRecommendations", 0.15, focus["recommendations"]),
        ("recentSubmissions", 0.1, focus["activity"]),
        ("recentSolved", 0.08, focus["activity"]),
        ("recentTimers", 0.05, focus["activity"]),
        ("dismissedProblems", 0.04, focus["recommendations"]),
        ("availablePresentationDatasets", 0.04, personal),
        ("availablePresentationProblems", 0.08, focus["recommendations"]),
    ]
    # Relevant sections first, then the rest while room remains.
    for key, share, relevant in sorted(
        ordered_sections, key=lambda entry: not entry[2]
    ):
        if key not in context:
            continue
        value = context[key]
        if key == "roadmap" and isinstance(value, dict):
            topics = value.get("topics")
            roadmap = {k: v for k, v in value.items() if k != "topics"}
            if isinstance(topics, list):
                roadmap["topics"] = _rank(topics, terms, keep_order_weight=0.6)
            value = roadmap
            cost = estimate_tokens(value)
            allowance = int(
                min(budget_tokens - used, budget_tokens * (share if relevant else 0.08))
            )
            all_topics = value.get("topics")
            if cost > allowance and isinstance(all_topics, list):
                base_cost = estimate_tokens({**value, "topics": []})
                kept, _ = _take(all_topics, max(0, allowance - base_cost))
                value = {**value, "topics": kept}
                cost = estimate_tokens(value)
                if len(kept) < len(all_topics):
                    omitted["roadmap.topics"] = len(all_topics) - len(kept)
            if cost <= max(0, budget_tokens - used):
                packed[key] = value
                used += cost
            else:
                omitted[key] = 1
            continue
        if isinstance(value, list):
            value = _rank(value, terms, keep_order_weight=0.8)
        add(key, value, share if relevant else min(share, 0.05))

    # Anything else the core sends (new fields) is kept when it fits.
    for key, value in context.items():
        if key in packed or key in omitted or key == "roadmap":
            continue
        if key in {section for section, _, _ in ordered_sections}:
            continue
        add(key, value, 0.05)

    if omitted:
        packed["contextNotes"] = {
            "omitted": omitted,
            "note": (
                "Less relevant context was left out to answer faster. Use the "
                "workspace tools when you need those details."
            ),
        }
    return packed
