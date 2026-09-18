from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "202609160900"
down_revision: str | None = "202609130200"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "coach_invocation_audits",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("request_id", sa.String(length=100), nullable=False),
        sa.Column("learner_id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=False),
        sa.Column("coach_version", sa.String(length=64), nullable=False),
        sa.Column("fallback", sa.Boolean(), nullable=False),
        sa.Column("fallback_reason", sa.String(length=64), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("estimated_cost_usd", sa.Numeric(12, 8), nullable=True),
        sa.Column("context_fingerprint", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        schema="ai",
    )
    op.create_index(
        "coach_invocation_audits_learner_created_idx",
        "coach_invocation_audits",
        ["learner_id", "created_at"],
        schema="ai",
    )
    op.create_index(
        "coach_invocation_audits_conversation_idx",
        "coach_invocation_audits",
        ["learner_id", "conversation_id"],
        schema="ai",
    )
    op.create_index(
        "coach_invocation_audits_request_idx",
        "coach_invocation_audits",
        ["request_id"],
        unique=True,
        schema="ai",
    )


def downgrade() -> None:
    op.drop_index(
        "coach_invocation_audits_request_idx",
        table_name="coach_invocation_audits",
        schema="ai",
    )
    op.drop_index(
        "coach_invocation_audits_conversation_idx",
        table_name="coach_invocation_audits",
        schema="ai",
    )
    op.drop_index(
        "coach_invocation_audits_learner_created_idx",
        table_name="coach_invocation_audits",
        schema="ai",
    )
    op.drop_table("coach_invocation_audits", schema="ai")
