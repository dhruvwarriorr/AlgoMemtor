from app.coach_intent import is_world_fact_question
from app.coach_service import (
    _reasoning_variant,
    invented_problem_titles,
    listed_problem_ids,
)
from app.mentor_service import shorten_text
from langchain_openai import ChatOpenAI


def test_short_world_facts_are_told_apart_from_cp_and_personal_questions() -> None:
    assert is_world_fact_question("Who won the 2022 FIFA World Cup?")
    assert is_world_fact_question("What is the capital of Australia?")
    assert not is_world_fact_question("Which algorithm is best for shortest paths?")
    assert not is_world_fact_question("How many problems have I solved?")
    assert not is_world_fact_question("When should I use a heap?")
    assert not is_world_fact_question("Who wrote https://example.com/post?")


def test_reasoning_variant_turns_reasoning_on_with_room_to_answer() -> None:
    model = ChatOpenAI(
        model="openai/gpt-oss-20b",
        base_url="https://openrouter.ai/api/v1",
        api_key="test-key",
        max_tokens=600,
        extra_body={"reasoning_effort": "none"},
    )
    variant = _reasoning_variant(model)
    assert isinstance(variant, ChatOpenAI)
    assert variant.extra_body == {"reasoning_effort": "high"}
    assert variant.max_tokens == 2_000
    assert model.extra_body is not None
    assert model.extra_body["reasoning_effort"] == "none"


def test_invented_recommendations_are_found_only_in_problem_lists() -> None:
    workspace: dict[str, object] = {
        "practicePool": [
            {"title": "Binary Tree Cameras"},
            {"title": "Distribute Coins in Binary Tree"},
        ]
    }
    answer = (
        '1. **"AND, OR and square sum" (Codeforces, rating 1700)** - bits\n'
        '2. **"Bitwise AND of Numbers Range" (Leetcode)** - bits\n'
        "3. **Binary Tree Cameras** - trees"
    )
    assert invented_problem_titles(answer, workspace) == [
        "AND, OR and square sum",
        "Bitwise AND of Numbers Range",
    ]
    trusted = (
        "1. **Binary Tree Cameras** - dp on trees\n"
        "2. **Distribute Coins in Binary Tree** - dfs"
    )
    assert invented_problem_titles(trusted, workspace) == []
    # One bold label is a heading, not a set of recommendations.
    assert invented_problem_titles("- **Time complexity**: O(n)", workspace) == []


def test_listed_pool_problems_get_their_ids_back() -> None:
    workspace: dict[str, object] = {
        "practicePool": [
            {"id": "codeforces:1368D", "title": "AND, OR and square sum"},
            {"id": "codeforces:118E", "title": "Bertown roads"},
        ]
    }
    answer = (
        "1. **Codeforces 1368D - AND, OR and square sum**\n"
        "2. **Bertown roads** - graphs\n"
        "3. **Unknown Problem** - ?"
    )
    assert listed_problem_ids(answer, workspace) == [
        "codeforces:1368D",
        "codeforces:118E",
    ]


def test_long_mentor_text_is_shortened_at_a_boundary() -> None:
    headline = (
        "You solve problems quickly but struggle with the harder ones. You "
        "tend to focus on topics you're comfortable with, like math and greedy "
        "algorithms, but have difficulty with more complex topics like dynamic "
        "programming."
    )
    assert shorten_text(headline, 90) == (
        "You solve problems quickly but struggle with the harder ones."
    )
    words = "alpha beta gamma delta epsilon zeta eta theta iota kappa"
    shortened = shorten_text(words, 30)
    assert shortened.endswith("…") and len(shortened) <= 30
    assert " ".join(shortened[:-1].split()) in words
    assert shorten_text("short", 30) == "short"
