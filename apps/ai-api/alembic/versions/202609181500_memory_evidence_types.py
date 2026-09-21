from collections.abc import Sequence

from alembic import op

revision: str = "202609181500"
down_revision: str | None = "202609181300"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_EVIDENCE_TYPES = (
    "'reflection', 'manual_progress', 'recommendation_feedback', "
    "'profile_preference', 'status_action', 'timer', 'bookmark', "
    "'outbound_open', 'analytics', 'coach_conversation', "
    "'hint_ladder_outcome', 'contest_performance', 'frustration'"
)


def upgrade() -> None:
    op.drop_constraint(
        "memory_evidence_type_check",
        "memory_evidence",
        schema="ai",
        type_="check",
    )
    op.create_check_constraint(
        "memory_evidence_type_check",
        "memory_evidence",
        f"evidence_type IN ({_EVIDENCE_TYPES})",
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
        "'recommendation_feedback', 'profile_preference', 'status_action', "
        "'timer', 'bookmark', 'outbound_open', 'analytics')",
        schema="ai",
    )
