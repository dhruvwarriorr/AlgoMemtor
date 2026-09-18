from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from datetime import UTC, datetime

from .memory_models import StoredMemory


def decayed_confidence(
    memory: StoredMemory,
    *,
    now: datetime | None = None,
    half_life_days: int = 30,
) -> float:
    """Apply conservative confidence decay without mutating persisted memory."""
    reference = now or datetime.now(UTC)
    age_days = max(0.0, (reference - memory.updatedAt).total_seconds() / 86_400)
    if memory.learnerCorrected:
        return round(max(0.0, min(1.0, memory.confidence)), 3)
    decay = 0.9 ** (age_days / max(1, half_life_days))
    return round(max(0.0, min(1.0, memory.confidence * decay)), 3)


def group_for_consolidation(
    memories: Iterable[StoredMemory], *, minimum_size: int = 3
) -> dict[tuple[str, str], list[StoredMemory]]:
    groups: dict[tuple[str, str], list[StoredMemory]] = defaultdict(list)
    for memory in memories:
        if memory.status != "active":
            continue
        topic = str(memory.structuredValue.get("topic", "general")).lower()
        groups[(memory.category, topic)].append(memory)
    return {
        key: values for key, values in groups.items() if len(values) >= minimum_size
    }


def consolidation_prompt(memories: Iterable[StoredMemory]) -> str:
    statements = [
        memory.statement.strip() for memory in memories if memory.statement.strip()
    ]
    return (
        "Summarize these learner evidence statements into one cautious, durable "
        "fact. Preserve uncertainty and never invent a detail:\n- "
        + "\n- ".join(statements[:8])
    )
