from collections.abc import Sequence

from alembic import op

revision: str = "202609130200"
down_revision: str | None = "202609130100"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        "memory_processing_outbox_attempts_check",
        "memory_processing_outbox",
        schema="ai",
        type_="check",
    )
    op.create_check_constraint(
        "memory_processing_outbox_attempts_check",
        "memory_processing_outbox",
        "attempts >= 0 AND attempts <= 4",
        schema="ai",
    )


def downgrade() -> None:
    op.drop_constraint(
        "memory_processing_outbox_attempts_check",
        "memory_processing_outbox",
        schema="ai",
        type_="check",
    )
    op.create_check_constraint(
        "memory_processing_outbox_attempts_check",
        "memory_processing_outbox",
        "attempts >= 0 AND attempts <= 3",
        schema="ai",
    )
