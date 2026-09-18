from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "202609181100"
down_revision: str | None = "202609181000"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MEMORY_CATEGORIES = (
    "preference",
    "difficulty_calibration",
    "topic_weakness",
    "scheduling_preference",
    "recommendation_feedback_pattern",
    "learning_goal",
    "topic_strength",
    "coding_style",
    "problem_solving_approach",
    "learning_pace",
    "time_availability",
    "mistake_pattern",
    "contest_performance",
    "explanation_preference",
    "communication_preference",
    "user_instruction",
    "conversation_summary",
    "learning_milestone",
    "bloom_level",
    "spaced_repetition_state",
)


def upgrade() -> None:
    op.drop_constraint(
        "learner_memories_category_check",
        "learner_memories",
        schema="ai",
        type_="check",
    )
    categories = ", ".join(f"'{category}'" for category in MEMORY_CATEGORIES)
    op.create_check_constraint(
        "learner_memories_category_check",
        "learner_memories",
        f"category IN ({categories})",
        schema="ai",
    )
    op.add_column(
        "learner_memories",
        sa.Column(
            "statement_tsv",
            postgresql.TSVECTOR(),
            sa.Computed("to_tsvector('english', statement)", persisted=True),
        ),
        schema="ai",
    )
    op.execute(
        "CREATE INDEX learner_memories_statement_tsv_idx "
        "ON ai.learner_memories USING gin (statement_tsv)"
    )
    for name, column in (
        ("difficulty_level", sa.String(length=32)),
        ("prerequisites", sa.JSON()),
        ("related_topics", sa.JSON()),
        (
            "usage_count",
            sa.Integer(),
        ),
        ("avg_helpfulness", sa.Numeric(3, 2)),
        ("content_checksum", sa.String(length=64)),
    ):
        op.add_column(
            "coach_knowledge_chunks",
            sa.Column(
                name,
                column,
                nullable=(name != "usage_count"),
                server_default="0" if name == "usage_count" else None,
            ),
            schema="ai",
        )
    op.execute(
        "CREATE INDEX coach_knowledge_chunks_content_tsv_idx "
        "ON ai.coach_knowledge_chunks USING gin "
        "(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')))"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ai.coach_knowledge_chunks_content_tsv_idx")
    for name in (
        "content_checksum",
        "avg_helpfulness",
        "usage_count",
        "related_topics",
        "prerequisites",
        "difficulty_level",
    ):
        op.drop_column("coach_knowledge_chunks", name, schema="ai")
    op.execute("DROP INDEX IF EXISTS ai.learner_memories_statement_tsv_idx")
    op.drop_column("learner_memories", "statement_tsv", schema="ai")
    op.drop_constraint(
        "learner_memories_category_check",
        "learner_memories",
        schema="ai",
        type_="check",
    )
    op.create_check_constraint(
        "learner_memories_category_check",
        "learner_memories",
        "category IN ('preference', 'difficulty_calibration', 'topic_weakness', 'scheduling_preference', 'recommendation_feedback_pattern')",
        schema="ai",
    )
