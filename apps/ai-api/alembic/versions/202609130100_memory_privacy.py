from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "202609130100"
down_revision: str | None = "202609130000"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "memory_evidence",
        sa.Column("problem_provider", sa.String(length=32), nullable=True),
        schema="ai",
    )
    op.add_column(
        "memory_evidence",
        sa.Column("problem_external_id", sa.String(length=128), nullable=True),
        schema="ai",
    )
    op.create_check_constraint(
        "memory_evidence_problem_identity_check",
        "memory_evidence",
        "(problem_provider IS NULL) = (problem_external_id IS NULL)",
        schema="ai",
    )
    op.create_index(
        "memory_evidence_learner_problem_idx",
        "memory_evidence",
        ["learner_id", "problem_provider", "problem_external_id", "created_at"],
        schema="ai",
    )
    op.drop_constraint(
        "memory_evidence_type_check",
        "memory_evidence",
        schema="ai",
        type_="check",
    )
    op.create_check_constraint(
        "memory_evidence_type_check",
        "memory_evidence",
        "evidence_type IN ('reflection', 'manual_progress', "
        "'recommendation_feedback', 'profile_preference', 'status_action', "
        "'timer', 'bookmark', 'outbound_open', 'analytics')",
        schema="ai",
    )


def downgrade() -> None:
    op.drop_constraint(
        "memory_evidence_type_check",
        "memory_evidence",
        schema="ai",
        type_="check",
    )
    op.create_check_constraint(
        "memory_evidence_type_check",
        "memory_evidence",
        "evidence_type IN ('reflection', 'manual_progress', "
        "'recommendation_feedback', 'status_action', 'timer', 'bookmark', "
        "'outbound_open', 'analytics')",
        schema="ai",
    )
    op.drop_index(
        "memory_evidence_learner_problem_idx",
        table_name="memory_evidence",
        schema="ai",
    )
    op.drop_constraint(
        "memory_evidence_problem_identity_check",
        "memory_evidence",
        schema="ai",
        type_="check",
    )
    op.drop_column("memory_evidence", "problem_external_id", schema="ai")
    op.drop_column("memory_evidence", "problem_provider", schema="ai")
