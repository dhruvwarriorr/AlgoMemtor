from __future__ import annotations

from uuid import UUID

import pytest
from app.evaluation.memory_rag_eval import (
    MemoryEvaluationCase,
    MemoryEvaluationHarness,
    evaluate_cases,
    validate_case_matrix,
)


def case(name: str = "topic_weakness") -> MemoryEvaluationCase:
    return MemoryEvaluationCase(
        name=name,
        expected_ids=frozenset({"graphs:900A", "graphs:901A"}),
        vector_ids=("graphs:900A", "graphs:901A"),
        sql_ids=("graphs:900A", "graphs:902A"),
        with_memory_score=0.9,
        without_memory_score=0.8,
        deterministic_score=0.7,
        latency_ms=100,
        cost_usd=0.001,
    )


def test_evaluation_gates_require_vector_non_regression_and_safe_ranking() -> None:
    result = evaluate_cases([case(), case("difficulty_pattern")])

    assert result.vector_gate_passed is True
    assert result.ranking_gate_passed is True
    assert result.passed is True
    assert result.targeted_improvement_points == pytest.approx(10)
    assert result.deterministic_improvement_points == pytest.approx(20)


def test_strict_matrix_requires_all_categories_and_safety_scenarios() -> None:
    with pytest.raises(ValueError, match="missing memory categories"):
        validate_case_matrix(
            [
                MemoryEvaluationCase(
                    **{
                        **case().__dict__,
                        "evidence_facts": ("reflection:1",),
                        "memory_statements": ("graph practice",),
                    }
                )
            ]
        )


class TrackingStore:
    def __init__(self) -> None:
        self.seeded: list[UUID] = []
        self.cleaned: list[UUID] = []

    async def seed(self, learner_id: UUID, case: MemoryEvaluationCase) -> None:
        del case
        self.seeded.append(learner_id)

    async def cleanup(self, learner_id: UUID) -> None:
        self.cleaned.append(learner_id)


class IdentityRunner:
    async def run(
        self, learner_id: UUID, value: MemoryEvaluationCase
    ) -> MemoryEvaluationCase:
        assert learner_id is not None
        return value


@pytest.mark.asyncio
async def test_harness_uses_unique_learners_and_always_cleans_up() -> None:
    store = TrackingStore()
    result = await MemoryEvaluationHarness(store, IdentityRunner()).run(
        [case()], repeats=3, require_matrix=False
    )

    assert result.passed is True
    assert len(store.seeded) == 3
    assert len(set(store.seeded)) == 3
    assert store.cleaned == store.seeded
