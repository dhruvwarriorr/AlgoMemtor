from __future__ import annotations

from app.knowledge_base import retrieve_knowledge
from app.knowledge_query import build_knowledge_query


def test_short_follow_up_retrieves_the_previous_topic() -> None:
    query = build_knowledge_query(
        "Why does that work?",
        [
            {"role": "user", "content": "Explain the sliding-window invariant."},
            {
                "role": "assistant",
                "content": "A sliding window keeps a monotone validity condition.",
            },
            {"role": "user", "content": "Why does that work?"},
        ],
    )
    assert "sliding-window" in query
    assert any(chunk.topic == "sliding-window" for chunk in retrieve_knowledge(query))


def test_new_topic_does_not_inherit_old_conversation() -> None:
    assert (
        build_knowledge_query(
            "Explain segment trees",
            [{"role": "assistant", "content": "Earlier we covered greedy algorithms."}],
        )
        == "Explain segment trees"
    )


def test_retrieval_query_omits_transient_content_and_is_bounded() -> None:
    query = build_knowledge_query(
        "Can you explain it again?",
        [
            {
                "role": "user",
                "content": "Binary search `secret_code()` https://private.example/x "
                "learner@example.com ```python\nprint('secret')\n```",
            },
            {"role": "assistant", "content": "A binary-search invariant " * 100},
        ],
    )
    assert "binary search" in query.lower()
    assert "secret" not in query
    assert "private.example" not in query
    assert "learner@example.com" not in query
    assert len(query) <= 680
