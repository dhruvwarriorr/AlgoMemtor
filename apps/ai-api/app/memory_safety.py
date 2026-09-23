import hashlib
import hmac
import json
import re
from typing import Any

from .memory_models import (
    GeneratedMemory,
    MemoryProcessRequest,
    ReflectionGenerationOutput,
)

_SENSITIVE_PATTERNS = (
    re.compile(r"(?:https?://|www\.)\S+", re.IGNORECASE),
    re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE),
    re.compile(
        r"\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-"
        r"[89ab][0-9a-f]{3}-[0-9a-f]{12}\b",
        re.IGNORECASE,
    ),
    re.compile(r"\b(?:bearer|token|api[_ -]?key)\s*[:=]?\s*\S+", re.IGNORECASE),
    re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)"),
    re.compile(r"@[A-Z0-9_]{2,}", re.IGNORECASE),
)


def contains_sensitive_text(value: str) -> bool:
    return any(pattern.search(value) for pattern in _SENSITIVE_PATTERNS)


def redact_text(value: str, max_length: int) -> str:
    redacted = value
    for pattern in _SENSITIVE_PATTERNS:
        redacted = pattern.sub("<redacted>", redacted)
    return " ".join(redacted.split())[:max_length].strip()


def redact_structured_value(
    value: dict[str, str | int | float | bool],
) -> dict[str, str | int | float | bool]:
    sanitized: dict[str, str | int | float | bool] = {}
    for key, item in value.items():
        clean_key = redact_text(key, 64) or "field"
        sanitized[clean_key] = redact_text(item, 256) if isinstance(item, str) else item
    return sanitized


def redacted_evidence_payload(request: MemoryProcessRequest) -> dict[str, Any]:
    payload: dict[str, Any] = {"evidenceType": request.evidenceType}
    if request.note is not None:
        payload["note"] = redact_text(request.note, 1200)
    if request.perceivedDifficulty is not None:
        payload["perceivedDifficulty"] = request.perceivedDifficulty
    if request.timeSpentMinutes is not None:
        payload["timeSpentMinutes"] = request.timeSpentMinutes
    if request.feedback is not None:
        payload["feedback"] = request.feedback
    if request.explicitPreference is not None:
        payload["explicitPreference"] = redact_text(request.explicitPreference, 500)
    if request.topic is not None:
        payload["topic"] = request.topic
    if request.problemStatus is not None:
        payload["problemStatus"] = request.problemStatus
    if request.evidenceStrength != 1.0:
        payload["evidenceStrength"] = request.evidenceStrength
    return payload


def model_payload(request: MemoryProcessRequest) -> dict[str, Any]:
    payload = redacted_evidence_payload(request)
    payload["instruction"] = (
        "Summarize only the supplied learner evidence and propose durable patterns."
    )
    return payload


def keyed_payload_hash(payload: Any, secret: str) -> str:
    encoded = json.dumps(
        payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True
    ).encode()
    key = secret.encode() if secret else b"algomemtor-memory-audit"
    return hmac.new(key, encoded, hashlib.sha256).hexdigest()


def memory_key(
    category: str,
    statement: str,
    structured_value: dict[str, str | int | float | bool] | None = None,
) -> str:
    normalized = " ".join(statement.lower().split())
    normalized_value = (
        json.dumps(
            structured_value,
            ensure_ascii=True,
            separators=(",", ":"),
            sort_keys=True,
        )
        if structured_value is not None
        else ""
    )
    return hashlib.sha256(
        f"{category}:{normalized}:{normalized_value}".encode()
    ).hexdigest()


def validate_generation_output(output: ReflectionGenerationOutput) -> None:
    values = [output.summary, *output.keySignals]
    values.extend(memory.statement for memory in output.memories)
    values.extend(
        value
        for memory in output.memories
        for value in memory.structuredValue.values()
        if isinstance(value, str)
    )
    if any(not value.strip() or contains_sensitive_text(value) for value in values):
        raise ValueError("Generated memory content failed privacy validation.")
    keys: set[tuple[str, str]] = set()
    for memory in output.memories:
        key = (memory.category, " ".join(memory.statement.lower().split()))
        if key in keys:
            raise ValueError("Generated memories must be unique.")
        keys.add(key)


def valid_automatic_memory(
    memory: GeneratedMemory,
    *,
    evidence_type: str,
    evidence_strength: float,
    confidence_threshold: float,
    evidence_threshold: float,
) -> bool:
    if evidence_type not in {
        "reflection",
        "manual_progress",
        "recommendation_feedback",
        "profile_preference",
        "bookmark",
        # Measured submission history synced from the learner's platforms.
        "provider_activity",
    }:
        return False
    return (
        evidence_strength >= evidence_threshold
        and memory.confidence >= confidence_threshold
    )
