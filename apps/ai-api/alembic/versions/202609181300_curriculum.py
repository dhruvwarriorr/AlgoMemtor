from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "202609181300"
down_revision: str | None = "202609181100"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "coach_hint_ladders",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("learner_id", sa.Uuid(), nullable=False),
        sa.Column("problem_provider", sa.String(length=32), nullable=False),
        sa.Column("problem_external_id", sa.String(length=128), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("hints_generated", sa.JSON(), nullable=False),
        sa.Column(
            "highest_hint_delivered", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "problem_solved", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "learner_id",
            "problem_provider",
            "problem_external_id",
            "conversation_id",
            name="coach_hint_ladders_identity_key",
        ),
        schema="ai",
    )
    op.create_index(
        "coach_hint_ladders_learner_idx",
        "coach_hint_ladders",
        ["learner_id", "updated_at"],
        schema="ai",
    )

    op.create_table(
        "topic_prerequisite_graph",
        sa.Column("topic", sa.String(length=80), nullable=False),
        sa.Column("requires", sa.String(length=80), nullable=False),
        sa.Column(
            "strength",
            sa.String(length=16),
            nullable=False,
            server_default="required",
        ),
        sa.PrimaryKeyConstraint("topic", "requires"),
        sa.CheckConstraint(
            "strength IN ('required', 'helpful')",
            name="topic_prerequisite_strength_check",
        ),
        schema="ai",
    )

    op.create_table(
        "learner_topic_mastery",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("learner_id", sa.Uuid(), nullable=False),
        sa.Column("topic", sa.String(length=80), nullable=False),
        sa.Column(
            "mastery_level", sa.Numeric(4, 3), nullable=False, server_default="0"
        ),
        sa.Column("bloom_level", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("problems_solved", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_practiced_at", sa.DateTime(timezone=True)),
        sa.Column("next_review_at", sa.DateTime(timezone=True)),
        sa.Column(
            "ease_factor", sa.Numeric(4, 3), nullable=False, server_default="2.5"
        ),
        sa.Column("interval_days", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "learner_id", "topic", name="learner_topic_mastery_identity_key"
        ),
        sa.CheckConstraint(
            "mastery_level >= 0 AND mastery_level <= 1",
            name="learner_topic_mastery_level_check",
        ),
        sa.CheckConstraint(
            "bloom_level >= 1 AND bloom_level <= 6",
            name="learner_topic_mastery_bloom_check",
        ),
        schema="ai",
    )
    op.create_index(
        "learner_topic_mastery_review_idx",
        "learner_topic_mastery",
        ["learner_id", "next_review_at"],
        schema="ai",
    )

    op.create_table(
        "contest_performance",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("learner_id", sa.Uuid(), nullable=False),
        sa.Column("contest_id", sa.String(length=160), nullable=False),
        sa.Column("platform", sa.String(length=32), nullable=False),
        sa.Column("solved_count", sa.Integer(), nullable=False),
        sa.Column("attempted_count", sa.Integer(), nullable=False),
        sa.Column("rank", sa.Integer()),
        sa.Column("rating_change", sa.Integer()),
        sa.Column("miss_reasons", sa.JSON()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "learner_id",
            "contest_id",
            "platform",
            name="contest_performance_identity_key",
        ),
        schema="ai",
    )
    op.create_index(
        "contest_performance_learner_idx",
        "contest_performance",
        ["learner_id", "created_at"],
        schema="ai",
    )


def downgrade() -> None:
    op.drop_index(
        "contest_performance_learner_idx", table_name="contest_performance", schema="ai"
    )
    op.drop_table("contest_performance", schema="ai")
    op.drop_index(
        "learner_topic_mastery_review_idx",
        table_name="learner_topic_mastery",
        schema="ai",
    )
    op.drop_table("learner_topic_mastery", schema="ai")
    op.drop_table("topic_prerequisite_graph", schema="ai")
    op.drop_index(
        "coach_hint_ladders_learner_idx", table_name="coach_hint_ladders", schema="ai"
    )
    op.drop_table("coach_hint_ladders", schema="ai")
