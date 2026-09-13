from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "202609120000"
down_revision: str | None = "202609100000"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ranking_audits",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("request_id", sa.String(length=100), nullable=False),
        sa.Column("learner_id", sa.Uuid(), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=False),
        sa.Column("ranking_version", sa.String(length=64), nullable=False),
        sa.Column("pricing_version", sa.String(length=64), nullable=False),
        sa.Column("candidate_ids", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("returned_ids", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("fallback", sa.Boolean(), nullable=False),
        sa.Column("fallback_reason", sa.String(length=64), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("estimated_cost_usd", sa.Numeric(12, 8), nullable=True),
        sa.Column("preference_hash", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("latency_ms >= 0", name="ranking_audits_latency_check"),
        sa.PrimaryKeyConstraint("id"),
        schema="ai",
    )
    op.create_index(
        "ranking_audits_learner_created_idx",
        "ranking_audits",
        ["learner_id", "created_at"],
        schema="ai",
    )
    op.create_index(
        "ranking_audits_request_id_idx",
        "ranking_audits",
        ["request_id"],
        schema="ai",
    )


def downgrade() -> None:
    op.drop_index(
        "ranking_audits_request_id_idx", table_name="ranking_audits", schema="ai"
    )
    op.drop_index(
        "ranking_audits_learner_created_idx",
        table_name="ranking_audits",
        schema="ai",
    )
    op.drop_table("ranking_audits", schema="ai")
