from __future__ import annotations

import math
import re
from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from statistics import fmean


class TeachingStyle(StrEnum):
    SOCRATIC = "socratic"
    GUIDED = "guided"
    DIRECT = "direct"


class MomentumState(StrEnum):
    ACCELERATING = "accelerating"
    STEADY = "steady"
    PLATEAUING = "plateauing"
    DECLINING = "declining"
    INACTIVE = "inactive"


@dataclass(frozen=True)
class Momentum:
    state: MomentumState
    recent_average: float
    prior_average: float
    recent_difficulty: float | None
    prior_difficulty: float | None


@dataclass(frozen=True)
class GoalTemplate:
    required: tuple[str, ...]
    strongly_helpful: tuple[str, ...]
    target_difficulty_range: tuple[int, int]
    problems_per_topic_recommended: int
    estimated_weeks: int


@dataclass(frozen=True)
class LearningPlan:
    goal: str
    timeline_weeks: int
    weeks: tuple[dict[str, object], ...]
    gap_topics: tuple[str, ...]


BLOOM_LABELS = (
    "remember",
    "understand",
    "apply",
    "analyse",
    "evaluate",
    "create",
)

MISTAKE_PATTERNS: dict[str, tuple[str, ...]] = {
    "missing_base_case": ("base case", "base-case", "initial state"),
    "off_by_one": ("off by one", "off-by-one", "index out of range"),
    "integer_overflow": ("overflow", "long long", "integer width"),
    "wrong_data_structure": (
        "wrong data structure",
        "should use a map",
        "should use a set",
    ),
    "complexity_wrong": (
        "too slow",
        "time limit",
        "times out",
        "complexity",
        "quadratic",
    ),
    "edge_case_empty_input": ("empty input", "n = 0", "n=0", "empty array"),
    "edge_case_single_element": ("n = 1", "n=1", "single element"),
    "graph_visited_wrong": ("visited", "bfs", "dfs", "visit twice"),
    "greedy_not_proven": ("greedy", "exchange argument", "proof"),
    "dp_state_wrong": ("dp state", "state transition", "transition"),
    "modular_arithmetic_missed": ("mod", "modulo", "modular arithmetic"),
    "pointer_null_check": ("null pointer", "nullptr", "none check"),
    "loop_invariant_broken": ("loop invariant", "invariant", "iteration"),
    "wrong_order_of_ops": ("order of operations", "wrong order", "sequence"),
}


@dataclass(frozen=True)
class HintLadder:
    topic: str
    hints: tuple[str, ...]

    def next_hint(self, delivered: int) -> tuple[int, str] | None:
        next_level = max(0, delivered)
        if next_level >= len(self.hints):
            return None
        return next_level + 1, self.hints[next_level]


def build_hint_ladder(topic: str) -> HintLadder:
    label = topic.replace("-", " ").strip() or "this topic"
    return HintLadder(
        topic=topic,
        hints=(
            f"What constraint or invariant stands out in this {label} problem?",
            f"Which {label} pattern could reduce the amount of repeated work?",
            "Write down the state, transition, and one edge case before coding.",
            "Trace the smallest counterexample and check the boundary conditions.",
            "Explain the complete approach and its worst-case complexity in your own words.",
        ),
    )


def hint_outcome_grade(hints_needed: int, solved: bool) -> int:
    if not solved:
        return 0
    if hints_needed <= 0:
        return 5
    if hints_needed <= 2:
        return 3
    if hints_needed <= 4:
        return 2
    return 1


def infer_bloom_level(
    question: str, recent_turns: list[Mapping[str, object]] | None = None
) -> int:
    text = question.lower()
    if any(
        term in text
        for term in ("design a variant", "invent", "generalize", "create a")
    ):
        return 6
    if any(
        term in text
        for term in ("prove", "justify", "compare", "trade-off", "critique")
    ):
        return 5
    if any(
        term in text
        for term in (
            "debug",
            "why does",
            "fails",
            "counterexample",
            "analyse",
            "analyze",
        )
    ):
        return 4
    if any(term in text for term in ("solve", "implement", "code", "approach", "hint")):
        return 3
    if any(term in text for term in ("why", "explain", "intuition", "summarize")):
        return 2
    if recent_turns:
        for turn in reversed(recent_turns):
            if str(turn.get("role", "")) == "user":
                previous = str(turn.get("content", "")).lower()
                if "solve" in previous or "code" in previous:
                    return 3
    return 1


def bloom_prompt(level: int) -> str:
    bounded = max(1, min(6, level))
    current = BLOOM_LABELS[bounded - 1]
    next_level = min(6, bounded + 1)
    target = BLOOM_LABELS[next_level - 1]
    return (
        f"LEARNER COGNITIVE LEVEL: {current} ({bounded}/6). "
        f"Use this turn to move the learner one step toward {target}."
    )


def detect_mistake_patterns(text: str) -> tuple[str, ...]:
    lowered = text.lower()
    matches = [
        category
        for category, signals in MISTAKE_PATTERNS.items()
        if any(signal in lowered for signal in signals)
    ]
    return tuple(matches[:6])


def mistake_prompt(patterns: tuple[str, ...]) -> str:
    if not patterns:
        return ""
    labels = ", ".join(pattern.replace("_", " ") for pattern in patterns)
    return (
        "KNOWN MISTAKE SIGNALS FROM RECENT LEARNER TURNS: "
        f"{labels}. Ask one diagnostic question about the most relevant signal "
        "before giving a correction; do not treat a single mention as a confirmed pattern."
    )


FRUSTRATION_PATTERNS = (
    r"\b(stuck|frustrated|confused|lost|give\s+up|cant\s+do|can't\s+do|impossible)\b",
    r"\b(don'?t understand|make no sense|not getting it|still don'?t)\b",
    r"\b(wasted|hours|entire day|all day|forever|never going to)\b",
    r"\b(quit|stop|done with|hate|stupid|dumb)\b",
)


def detect_frustration(question: str) -> float:
    matched = sum(
        len(re.findall(pattern, question, re.IGNORECASE))
        for pattern in FRUSTRATION_PATTERNS
    )
    short_vent = len(question.split()) < 20 and matched > 0
    return min(1.0, matched * 0.3 + (0.2 if short_vent else 0.0))


def infer_teaching_style(context: Mapping[str, object]) -> TeachingStyle:
    profile = context.get("profile")
    if isinstance(profile, Mapping):
        profile_preferences = profile.get("learningPreferences")
        if isinstance(profile_preferences, list):
            preferences = {str(value).lower() for value in profile_preferences}
            if "solve_problems_directly" in preferences:
                return TeachingStyle.DIRECT
            if "learn_concept_then_solve" in preferences:
                return TeachingStyle.GUIDED
    memories = context.get("memories")
    if isinstance(memories, list):
        for item in memories:
            if not isinstance(item, Mapping):
                continue
            statement = str(item.get("statement", "")).lower()
            if any(term in statement for term in ("socratic", "ask me questions")):
                return TeachingStyle.SOCRATIC
            if any(
                term in statement for term in ("direct explanation", "show solution")
            ):
                return TeachingStyle.DIRECT
            if any(term in statement for term in ("hint first", "progressive hint")):
                return TeachingStyle.GUIDED
    return TeachingStyle.GUIDED


def teaching_prompt(style: TeachingStyle, frustration: float) -> str:
    blocks = {
        TeachingStyle.SOCRATIC: (
            "TEACHING MODE: SOCRATIC\n"
            "Start a new problem by asking what the learner tried and what constraint or invariant they see. "
            "Use counterexamples to expose a wrong approach. Do not provide code or a complete algorithm unless "
            "the learner explicitly asks for it or has been stuck across several turns."
        ),
        TeachingStyle.DIRECT: (
            "TEACHING MODE: DIRECT\n"
            "Explain intuition, approach, correctness, and complexity in that order. Still ask a short check-for-understanding "
            "question before moving to a harder variation."
        ),
        TeachingStyle.GUIDED: (
            "TEACHING MODE: GUIDED\n"
            "Offer one numbered hint at a time, from technique signal to implementation detail. Ask whether the learner wants "
            "the next hint before escalating and reserve a full solution for an explicit request."
        ),
    }
    if frustration >= 0.6:
        return (
            blocks[style]
            + "\nFRUSTRATION MODE: acknowledge the effort first, normalize the difficulty, offer one tiny next step, "
            "and ask whether the learner wants a break, a simpler example, or the next hint. Do not lecture or reveal a full solution."
        )
    if frustration >= 0.3:
        return (
            blocks[style]
            + "\nMILD STRUGGLE: briefly acknowledge the struggle and choose the smallest actionable hint before explaining more."
        )
    return blocks[style]


def compute_momentum(
    recent_solved: list[float],
    prior_solved: list[float],
    recent_difficulty: list[float] | None = None,
    prior_difficulty: list[float] | None = None,
) -> Momentum:
    recent_average = fmean(recent_solved) if recent_solved else 0.0
    prior_average = fmean(prior_solved) if prior_solved else 0.0
    recent_level = fmean(recent_difficulty) if recent_difficulty else None
    prior_level = fmean(prior_difficulty) if prior_difficulty else None
    if recent_average == 0 and prior_average == 0:
        state = MomentumState.INACTIVE
    elif prior_average > 0 and recent_average < prior_average * 0.6:
        state = MomentumState.DECLINING
    elif (
        prior_average > 0
        and recent_average > prior_average * 1.3
        and (recent_level is None or prior_level is None or recent_level >= prior_level)
    ):
        state = MomentumState.ACCELERATING
    elif (
        recent_level is not None
        and prior_level is not None
        and recent_level < prior_level * 0.9
    ):
        state = MomentumState.PLATEAUING
    else:
        state = MomentumState.STEADY
    return Momentum(state, recent_average, prior_average, recent_level, prior_level)


def sm2_update(ease_factor: float, interval_days: int, grade: int) -> tuple[float, int]:
    grade = max(0, min(5, grade))
    if grade < 3:
        interval_days = 1
    elif interval_days <= 1:
        interval_days = 6
    else:
        interval_days = max(1, round(interval_days * ease_factor))
    ease_factor = max(
        1.3,
        ease_factor + 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02),
    )
    return round(ease_factor, 3), interval_days


def compute_mastery(
    problems_solved: int,
    avg_hints_needed: float,
    avg_difficulty_percentile: float,
    spaced_repetition_grade: float,
    days_since_last_practice: int,
) -> float:
    quantity = min(1.0, math.log(max(0, problems_solved) + 1) / math.log(21))
    quality = max(0.0, min(1.0, avg_difficulty_percentile)) * (
        1 - max(0.0, min(5.0, avg_hints_needed)) / 5
    )
    decay = max(0.3, 1.0 - 0.02 * max(0, days_since_last_practice - 7))
    score = (
        0.3 * quantity
        + 0.3 * quality
        + 0.2 * decay
        + 0.2 * max(0.0, min(1.0, spaced_repetition_grade))
    )
    return round(score, 3)


PREREQUISITES: dict[str, tuple[str, ...]] = {
    "arrays": ("implementation",),
    "sorting": ("arrays",),
    "binary-search": ("arrays", "sorting"),
    "hashing": ("arrays",),
    "two-pointers": ("arrays", "sorting"),
    "sliding-window": ("arrays", "two-pointers"),
    "prefix-sums": ("arrays",),
    "stacks-and-queues": ("arrays",),
    "recursion-and-backtracking": ("implementation",),
    "graphs": ("arrays",),
    "bfs-and-dfs": ("graphs", "stacks-and-queues"),
    "heaps-and-priority-queues": ("arrays", "sorting"),
    "trees": ("recursion-and-backtracking",),
    "tries": ("strings", "trees"),
    "disjoint-set-union": ("graphs", "bfs-and-dfs"),
    "shortest-paths": ("graphs", "bfs-and-dfs", "heaps-and-priority-queues"),
    "topological-sort": ("graphs", "bfs-and-dfs"),
    "minimum-spanning-trees": ("disjoint-set-union", "shortest-paths"),
    "dynamic-programming": ("recursion-and-backtracking", "arrays"),
    "advanced-dynamic-programming": ("dynamic-programming",),
    "segment-trees": ("arrays", "recursion-and-backtracking", "prefix-sums"),
    "fenwick-trees": ("arrays", "prefix-sums"),
    "binary-lifting": ("trees", "sparse-tables"),
    "lca": ("binary-lifting", "trees"),
    "heavy-light-decomposition": ("segment-trees", "lca"),
    "sparse-tables": ("arrays", "binary-search"),
    "bit-manipulation": ("implementation",),
    "bitmask-dp": ("dynamic-programming", "bit-manipulation"),
    "dp-on-trees": ("dynamic-programming", "trees", "bfs-and-dfs"),
    "kmp": ("strings", "arrays"),
    "string-hashing": ("strings", "hashing"),
    "strongly-connected-components": ("graphs", "bfs-and-dfs"),
    "network-flow": ("graphs", "bfs-and-dfs"),
    "game-theory": ("dynamic-programming",),
    "computational-geometry": ("math",),
}


GOAL_TEMPLATES: dict[str, GoalTemplate] = {
    "codeforces_expert": GoalTemplate(
        required=(
            "sorting",
            "binary-search",
            "two-pointers",
            "prefix-sums",
            "hashing",
            "bfs-and-dfs",
            "dynamic-programming",
            "greedy",
            "segment-trees",
        ),
        strongly_helpful=(
            "fenwick-trees",
            "disjoint-set-union",
            "topological-sort",
            "bitmask-dp",
        ),
        target_difficulty_range=(1200, 1700),
        problems_per_topic_recommended=15,
        estimated_weeks=12,
    ),
    "cf_1600": GoalTemplate(
        required=(
            "sorting",
            "binary-search",
            "two-pointers",
            "prefix-sums",
            "hashing",
            "bfs-and-dfs",
            "dynamic-programming",
            "greedy",
        ),
        strongly_helpful=("fenwick-trees", "disjoint-set-union", "topological-sort"),
        target_difficulty_range=(1200, 1700),
        problems_per_topic_recommended=15,
        estimated_weeks=12,
    ),
    "faang_interview": GoalTemplate(
        required=(
            "arrays",
            "strings",
            "hashing",
            "two-pointers",
            "sliding-window",
            "binary-search",
            "sorting",
            "bfs-and-dfs",
            "trees",
            "dynamic-programming",
            "heaps-and-priority-queues",
            "stacks-and-queues",
        ),
        strongly_helpful=(
            "tries",
            "segment-trees",
            "greedy",
            "recursion-and-backtracking",
        ),
        target_difficulty_range=(800, 1400),
        problems_per_topic_recommended=20,
        estimated_weeks=8,
    ),
    "icpc_foundations": GoalTemplate(
        required=(
            "implementation",
            "math",
            "sorting",
            "graphs",
            "bfs-and-dfs",
            "dynamic-programming",
            "greedy",
        ),
        strongly_helpful=(
            "number-theory",
            "combinatorics",
            "segment-trees",
            "disjoint-set-union",
        ),
        target_difficulty_range=(1000, 1800),
        problems_per_topic_recommended=12,
        estimated_weeks=12,
    ),
}


def learning_path(
    target_topic: str, mastery: Mapping[str, float], threshold: float = 0.7
) -> list[str]:
    graph = PREREQUISITES
    order: list[str] = []
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(topic: str) -> None:
        if topic in visited or mastery.get(topic, 0.0) >= threshold:
            return
        if topic in visiting:
            raise ValueError("Prerequisite graph contains a cycle")
        visiting.add(topic)
        for prerequisite in graph.get(topic, ()):
            visit(prerequisite)
        visiting.remove(topic)
        visited.add(topic)
        order.append(topic)

    visit(target_topic)
    return order


def generate_learning_plan(
    goal_type: str,
    timeline_weeks: int | None,
    mastery: Mapping[str, float],
    *,
    due_reviews: Mapping[int, tuple[str, ...]] | None = None,
) -> LearningPlan:
    """Create a deterministic, prerequisite-ordered plan for a learner goal."""
    template = GOAL_TEMPLATES.get(goal_type)
    if template is None:
        raise ValueError(f"Unknown learning goal: {goal_type}")
    weeks = max(1, min(52, timeline_weeks or template.estimated_weeks))
    gaps: list[str] = []
    for topic in (*template.required, *template.strongly_helpful):
        if mastery.get(topic, 0.0) < 0.7:
            for prerequisite in learning_path(topic, mastery):
                if prerequisite not in gaps and mastery.get(prerequisite, 0.0) < 0.7:
                    gaps.append(prerequisite)
    per_week = max(1, math.ceil(len(gaps) / weeks)) if gaps else 0
    week_plans: list[dict[str, object]] = []
    for index in range(weeks):
        start = index * per_week
        end = min(len(gaps), start + per_week)
        review_topics = list((due_reviews or {}).get(index + 1, ()))[:5]
        week_plans.append(
            {
                "week": index + 1,
                "new_topics": gaps[start:end],
                "review_topics": review_topics,
                "problem_count_target": template.problems_per_topic_recommended,
                "difficulty_range": template.target_difficulty_range,
            }
        )
    return LearningPlan(
        goal=goal_type,
        timeline_weeks=weeks,
        weeks=tuple(week_plans),
        gap_topics=tuple(gaps),
    )
