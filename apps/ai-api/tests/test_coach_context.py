from typing import Any

from app.coach_context import (
    estimate_tokens,
    pack_context,
    plan_turn_budget,
    turn_tier,
)
from app.coach_intent import is_page_snapshot
from app.settings import AiSettings


def settings(**updates: Any) -> AiSettings:
    return AiSettings(_env_file=None, **updates)


def big_context() -> dict[str, object]:
    return {
        "excludedTopics": ["geometry"],
        "userInstructions": ["Keep answers short."],
        "profile": {"experience": "intermediate", "goal": "codeforces_1600"},
        "memories": [
            {"statement": f"Memory {index} about unrelated preferences."}
            for index in range(30)
        ]
        + [{"statement": "Struggles with binary search on answer boundaries."}],
        "recentTurns": [
            {"role": "user", "content": f"Old turn {index} " + "x" * 400}
            for index in range(20)
        ],
        "roadmap": {
            "dataCompleteness": "partial",
            "topics": [
                {"topic": f"topic-{index}", "name": f"Topic {index}", "lane": "later"}
                for index in range(40)
            ]
            + [
                {
                    "topic": "binary-search",
                    "name": "Binary search",
                    "lane": "current_focus",
                }
            ],
        },
        "activityDigest": {"summary": "y" * 20_000},
        "currentRecommendations": [
            {"title": f"Problem {index}", "topics": ["graphs"]} for index in range(20)
        ],
    }


def test_turn_tiers_follow_the_question() -> None:
    assert turn_tier("What is my rating?") == "quick"
    assert turn_tier("Explain how segment trees support lazy propagation") in {
        "standard",
        "deep",
    }
    assert turn_tier("Why does my code get wrong answer on test 3?") == "deep"
    assert turn_tier("hi there, what", has_linked_problems=True) == "deep"


def test_openrouter_budgets_scale_with_the_turn() -> None:
    config = settings(solution_max_output_tokens=12_000)
    quick = plan_turn_budget(config, question="What is my rating?", context={})
    deep = plan_turn_budget(
        config,
        question="Prove why this greedy works and write the code",
        context={},
    )
    assert quick.output_tokens == 1_024
    assert quick.agent_steps == 1
    assert deep.output_tokens == 12_000
    assert deep.deep_reasoning is True


def test_packing_keeps_required_and_relevant_context_within_budget() -> None:
    context = big_context()
    packed = pack_context(
        context, "How should I practice binary search next?", budget_tokens=3_000
    )
    assert estimate_tokens(packed) <= 3_300
    assert packed["excludedTopics"] == ["geometry"]
    assert packed["userInstructions"] == ["Keep answers short."]
    roadmap = packed["roadmap"]
    assert isinstance(roadmap, dict)
    topics = roadmap["topics"]
    assert isinstance(topics, list)
    assert topics[0]["topic"] == "binary-search"
    memories = packed.get("memories")
    assert isinstance(memories, list)
    assert "binary search" in memories[0]["statement"]
    notes = packed["contextNotes"]
    assert isinstance(notes, dict)
    assert "activityDigest" in notes["omitted"]


def test_newest_turns_are_kept_for_follow_ups() -> None:
    packed = pack_context(big_context(), "and then?", budget_tokens=2_000)
    turns = packed.get("recentTurns")
    assert isinstance(turns, list) and turns
    assert turns[-1]["content"].startswith("Old turn 19")


def test_a_long_last_answer_is_shortened_not_dropped() -> None:
    context: dict[str, object] = {
        "recentTurns": [
            {"role": "user", "content": "Explain Dijkstra briefly."},
            {"role": "assistant", "content": "Dijkstra relaxes edges. " * 400},
        ]
    }
    packed = pack_context(context, "And with a Fibonacci heap?", budget_tokens=3_200)
    turns = packed.get("recentTurns")
    assert isinstance(turns, list) and len(turns) == 1
    assert turns[0]["role"] == "assistant"
    assert turns[0]["content"].startswith("Dijkstra relaxes edges.")
    assert turns[0]["content"].endswith("…")
    assert estimate_tokens(turns) <= 3_200 * 0.2 + 1


def test_small_contexts_pass_through_unchanged() -> None:
    context: dict[str, object] = {
        "profile": {"goal": "interviews"},
        "recentTurns": [{"role": "user", "content": "hi"}],
    }
    packed = pack_context(context, "What next?", budget_tokens=5_000)
    assert packed == context


def test_page_questions_from_mello_answer_quickly() -> None:
    page = "The learner has this AlgoMemtor page open while asking.\nTitle: X"
    assert is_page_snapshot(page)
    assert not is_page_snapshot("int main() { return 0; }")
    assert not is_page_snapshot(None)
    assert turn_tier("explain me the dashboard page", page_snapshot=True) == "quick"
    # A page does not make a question deep, but a deep question stays deep.
    assert (
        turn_tier("Why does my code get wrong answer on test 3?", page_snapshot=True)
        == "deep"
    )
    assert turn_tier("explain me the dashboard page") == "standard"
