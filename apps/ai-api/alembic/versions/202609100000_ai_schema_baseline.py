from collections.abc import Sequence

from alembic import op

revision: str = "202609100000"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS ai")


def downgrade() -> None:
    op.execute("DROP SCHEMA IF EXISTS ai")
