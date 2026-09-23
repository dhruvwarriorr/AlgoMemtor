"""Accept synced platform activity as memory evidence.

Revision ID: 202609231800
Revises: 202609181500
"""

from collections.abc import Sequence

from alembic import op

revision: str = "202609231800"
down_revision: str | None = "202609181500"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PREVIOUS = (
    "'reflection', 'manual_progress', 'recommendation_feedback', "
    "'profile_preference', 'status_action', 'timer', 'bookmark', "
    "'outbound_open', 'analytics', 'coach_conversation', "
    "'hint_ladder_outcome', 'contest_performance', 'frustration'"
)
_EVIDENCE_TYPES = f"{_PREVIOUS}, 'provider_activity'"


def _replace(values: str) -> None:
    op.drop_constraint(
        "memory_evidence_type_check",
        "memory_evidence",
        schema="ai",
        type_="check",
    )
    op.create_check_constraint(
        "memory_evidence_type_check",
        "memory_evidence",
        f"evidence_type IN ({values})",
        schema="ai",
    )


def upgrade() -> None:
    _replace(_EVIDENCE_TYPES)


def downgrade() -> None:
    op.execute(
        "DELETE FROM ai.memory_evidence WHERE evidence_type = 'provider_activity'"
    )
    _replace(_PREVIOUS)
