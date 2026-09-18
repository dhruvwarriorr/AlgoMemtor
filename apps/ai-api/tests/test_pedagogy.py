from app.pedagogy import (
    MomentumState,
    TeachingStyle,
    bloom_prompt,
    build_hint_ladder,
    compute_mastery,
    compute_momentum,
    detect_frustration,
    detect_mistake_patterns,
    generate_learning_plan,
    hint_outcome_grade,
    infer_bloom_level,
    learning_path,
    mistake_prompt,
    sm2_update,
    teaching_prompt,
)


def test_frustration_detection_and_adaptive_prompt() -> None:
    assert detect_frustration("I am stuck and want to give up") >= 0.6
    assert detect_frustration("Explain a prefix sum") < 0.3
    prompt = teaching_prompt(TeachingStyle.GUIDED, 0.8)
    assert "acknowledge" in prompt.lower()
    assert "full solution" in prompt.lower()


def test_momentum_classification() -> None:
    momentum = compute_momentum([4, 5, 4], [1, 2, 1])
    assert momentum.state is MomentumState.ACCELERATING
    assert compute_momentum([], []).state is MomentumState.INACTIVE


def test_sm2_and_mastery_are_bounded() -> None:
    ease, interval = sm2_update(2.5, 6, 5)
    assert ease > 2.5
    assert interval > 6
    assert 0 <= compute_mastery(20, 0, 1, 1, 0) <= 1


def test_learning_path_respects_prerequisites_and_mastery() -> None:
    path = learning_path("heavy-light-decomposition", {"arrays": 0.9})
    assert path[-1] == "heavy-light-decomposition"
    assert path.index("segment-trees") < path.index("heavy-light-decomposition")


def test_goal_plan_is_bounded_and_review_aware() -> None:
    plan = generate_learning_plan(
        "cf_1600",
        4,
        {"arrays": 0.9},
        due_reviews={1: ("arrays", "sorting")},
    )
    assert plan.timeline_weeks == 4
    assert plan.weeks[0]["review_topics"] == ["arrays", "sorting"]
    assert "binary-search" in plan.gap_topics


def test_hint_ladder_is_progressive_and_grades_outcomes() -> None:
    ladder = build_hint_ladder("dynamic-programming")
    assert ladder.next_hint(0) == (1, ladder.hints[0])
    assert ladder.next_hint(len(ladder.hints)) is None
    assert hint_outcome_grade(0, True) == 5
    assert hint_outcome_grade(4, True) == 2
    assert hint_outcome_grade(1, False) == 0


def test_bloom_and_mistake_signals_shape_coaching_guidance() -> None:
    assert infer_bloom_level("Compare top-down and bottom-up DP") == 5
    assert "evaluate" in bloom_prompt(5)
    patterns = detect_mistake_patterns(
        "My solution times out and I forgot the base case for n=1."
    )
    assert "complexity_wrong" in patterns
    assert "missing_base_case" in patterns
    assert "diagnostic" in mistake_prompt(patterns)
