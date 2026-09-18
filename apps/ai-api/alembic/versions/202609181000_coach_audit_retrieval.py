from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "202609181000"
down_revision: str | None = "202609171300"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for name in (
        "knowledge_retrieved",
        "memory_retrieved",
        "web_grounding_used",
    ):
        op.add_column(
            "coach_invocation_audits",
            sa.Column(name, sa.Boolean(), nullable=False, server_default=sa.false()),
            schema="ai",
        )
        op.alter_column(
            "coach_invocation_audits",
            name,
            server_default=None,
            schema="ai",
        )


def downgrade() -> None:
    for name in (
        "web_grounding_used",
        "memory_retrieved",
        "knowledge_retrieved",
    ):
        op.drop_column("coach_invocation_audits", name, schema="ai")
