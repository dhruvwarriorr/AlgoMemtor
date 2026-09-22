from __future__ import annotations

import re


def _searchable_text(value: object, limit: int) -> str:
    if not isinstance(value, str):
        return ""
    text = re.sub(r"```[\s\S]*?```|`[^`]*`", " ", value)
    text = re.sub(r"https?://\S+|www\.\S+", " ", text, flags=re.IGNORECASE)
    text = re.sub(
        r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", " ", text, flags=re.IGNORECASE
    )
    text = re.sub(
        r"\b(?:bearer|token|api[_ -]?key)\s*[:=]?\s*\S+",
        " ",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"\[.*?(?:omitted|not saved).*?\]", " ", text, flags=re.IGNORECASE)
    return " ".join(text.split())[:limit]


def build_knowledge_query(question: str, recent_turns: object) -> str:
    """Carry a short follow-up's topic into private retrieval, never public search."""
    current = _searchable_text(question, 320)
    if not isinstance(recent_turns, list) or len(current) > 160:
        return current
    is_follow_up = bool(
        re.search(
            r"\b(it|that|this|those|these|one|above|previous|earlier|same)\b",
            current,
            flags=re.IGNORECASE,
        )
        or re.fullmatch(
            r"(?:why|how|explain more|go deeper|continue)[?.! ]*",
            current,
            flags=re.IGNORECASE,
        )
    )
    if not is_follow_up:
        return current

    previous_user = ""
    previous_assistant = ""
    for turn in reversed(recent_turns[-8:]):
        if not isinstance(turn, dict):
            continue
        content = _searchable_text(turn.get("content"), 180)
        if not content or content == current:
            continue
        if turn.get("role") == "assistant" and not previous_assistant:
            previous_assistant = content
        elif turn.get("role") == "user" and not previous_user:
            previous_user = content
        if previous_user and previous_assistant:
            break
    if not previous_user and not previous_assistant:
        return current
    return " ".join(
        part for part in (current, previous_user, previous_assistant) if part
    )[:680]
