from __future__ import annotations

import asyncio
from collections.abc import Sequence
from dataclasses import dataclass
from statistics import median
from time import perf_counter
from typing import Protocol
from uuid import UUID, uuid4

MEMORY_CATEGORIES = frozenset(
    {
        "preference",
        "difficulty_calibration",
        "topic_weakness",
        "scheduling_preference",
        "recommendation_feedback_pattern",
    }
)
REQUIRED_SCENARIOS = frozenset(
    {
        "conflicting_evidence",
        "correction",
        "consent_revocation",
        "deletion",
        "irrelevant_memory",
        "embedding_failure",
        "llm_failure",
    }
)


@dataclass(frozen=True)
class MemoryEvaluationCase:
    name: str
    expected_ids: frozenset[str]
    vector_ids: tuple[str, ...]
    sql_ids: tuple[str, ...]
    with_memory_score: float
    without_memory_score: float
    deterministic_score: float
    latency_ms: int
    cost_usd: float
    unknown_ids: int = 0
    privacy_leaks: int = 0
    category: str = "topic_weakness"
    scenario: str = "baseline"
    evidence_facts: tuple[str, ...] = ()
    memory_statements: tuple[str, ...] = ()


@dataclass(frozen=True)
class MemoryEvaluationResult:
    vector_recall_at_5: float
    sql_recall_at_5: float
    targeted_improvement_points: float
    deterministic_improvement_points: float
    overall_regression_points: float
    p95_latency_ms: float
    average_cost_usd: float
    unknown_ids: int
    privacy_leaks: int
    vector_gate_passed: bool
    ranking_gate_passed: bool
    passed: bool


class EvaluationStore(Protocol):
    async def seed(self, learner_id: UUID, case: MemoryEvaluationCase) -> None: ...

    async def cleanup(self, learner_id: UUID) -> None: ...


class EvaluationRunner(Protocol):
    async def run(
        self, learner_id: UUID, case: MemoryEvaluationCase
    ) -> MemoryEvaluationCase: ...


def recall_at_5(expected_ids: frozenset[str], returned_ids: Sequence[str]) -> float:
    if not expected_ids:
        return 1.0
    return len(expected_ids.intersection(returned_ids[:5])) / len(expected_ids)


def evaluate_cases(cases: Sequence[MemoryEvaluationCase]) -> MemoryEvaluationResult:
    if not cases:
        raise ValueError("At least one evaluation case is required.")
    vector_recall = median(
        recall_at_5(case.expected_ids, case.vector_ids) for case in cases
    )
    sql_recall = median(recall_at_5(case.expected_ids, case.sql_ids) for case in cases)
    targeted = [case for case in cases if case.expected_ids]
    improvement = 100 * median(
        case.with_memory_score - case.without_memory_score for case in targeted
    )
    deterministic_improvement = 100 * median(
        case.with_memory_score - case.deterministic_score for case in targeted
    )
    overall_regression = 100 * median(
        case.without_memory_score - case.with_memory_score for case in cases
    )
    latencies = sorted(case.latency_ms for case in cases)
    p95_index = min(len(latencies) - 1, max(0, round(0.95 * len(latencies)) - 1))
    p95_latency = float(latencies[p95_index])
    average_cost = sum(case.cost_usd for case in cases) / len(cases)
    unknown_ids = sum(case.unknown_ids for case in cases)
    privacy_leaks = sum(case.privacy_leaks for case in cases)
    vector_gate = vector_recall >= sql_recall
    ranking_gate = (
        improvement >= 5
        and overall_regression <= 1
        and p95_latency < 8_000
        and average_cost <= 0.02
        and unknown_ids == 0
        and privacy_leaks == 0
    )
    return MemoryEvaluationResult(
        vector_recall_at_5=vector_recall,
        sql_recall_at_5=sql_recall,
        targeted_improvement_points=improvement,
        deterministic_improvement_points=deterministic_improvement,
        overall_regression_points=overall_regression,
        p95_latency_ms=p95_latency,
        average_cost_usd=average_cost,
        unknown_ids=unknown_ids,
        privacy_leaks=privacy_leaks,
        vector_gate_passed=vector_gate,
        ranking_gate_passed=ranking_gate,
        passed=vector_gate and ranking_gate,
    )


def validate_case_matrix(cases: Sequence[MemoryEvaluationCase]) -> None:
    missing_fixtures = [
        case.name
        for case in cases
        if not case.evidence_facts or not case.memory_statements
    ]
    if missing_fixtures:
        raise ValueError(
            "Each evaluation case needs explicit evidence and memory fixtures: "
            + ", ".join(sorted(missing_fixtures))
        )
    categories = {case.category for case in cases}
    missing_categories = MEMORY_CATEGORIES - categories
    if missing_categories:
        raise ValueError(
            "Evaluation cases are missing memory categories: "
            + ", ".join(sorted(missing_categories))
        )
    scenarios_by_category = {
        category: {case.scenario for case in cases if case.category == category}
        for category in MEMORY_CATEGORIES
    }
    underrepresented = {
        category: len(scenarios)
        for category, scenarios in scenarios_by_category.items()
        if len(scenarios) < 3
    }
    if underrepresented:
        raise ValueError(
            "Each memory category needs at least three scenarios: "
            + ", ".join(
                f"{category}={scenario_count}"
                for category, scenario_count in sorted(underrepresented.items())
            )
        )
    missing_scenarios = REQUIRED_SCENARIOS - {case.scenario for case in cases}
    if missing_scenarios:
        raise ValueError(
            "Evaluation cases are missing required scenarios: "
            + ", ".join(sorted(missing_scenarios))
        )


class MemoryEvaluationHarness:
    def __init__(self, store: EvaluationStore, runner: EvaluationRunner) -> None:
        self.store = store
        self.runner = runner

    async def run(
        self,
        cases: Sequence[MemoryEvaluationCase],
        repeats: int = 3,
        require_matrix: bool = True,
    ) -> MemoryEvaluationResult:
        if repeats < 1:
            raise ValueError("Evaluation repeats must be positive.")
        if require_matrix:
            validate_case_matrix(cases)
        results: list[MemoryEvaluationCase] = []
        for case in cases:
            for _ in range(repeats):
                learner_id = uuid4()
                started = perf_counter()
                try:
                    await self.store.seed(learner_id, case)
                    result = await self.runner.run(learner_id, case)
                    elapsed_ms = max(0, round((perf_counter() - started) * 1000))
                    results.append(
                        MemoryEvaluationCase(
                            **{
                                **result.__dict__,
                                "latency_ms": max(result.latency_ms, elapsed_ms),
                            }
                        )
                    )
                finally:
                    await self.store.cleanup(learner_id)
        return evaluate_cases(results)


def run(
    cases: Sequence[MemoryEvaluationCase],
    store: EvaluationStore,
    runner: EvaluationRunner,
    *,
    require_matrix: bool = True,
) -> MemoryEvaluationResult:
    return asyncio.run(
        MemoryEvaluationHarness(store, runner).run(cases, require_matrix=require_matrix)
    )
