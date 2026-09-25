"""Add versioned 1024-dimensional Qwen embedding storage.

Revision ID: 202609251200
Revises: 202609231800

The existing 768-dimensional vectors remain intact until the restartable
reindex command has populated the new columns.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import VECTOR

revision: str = "202609251200"
down_revision: str | None = "202609231800"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "learner_memories",
        sa.Column("embedding_v2", VECTOR(1024), nullable=True),
        schema="ai",
    )
    op.add_column(
        "learner_memories",
        sa.Column("embedding_version", sa.String(length=128), nullable=True),
        schema="ai",
    )
    op.add_column(
        "coach_knowledge_chunks",
        sa.Column("embedding_v2", VECTOR(1024), nullable=True),
        schema="ai",
    )
    op.add_column(
        "coach_knowledge_chunks",
        sa.Column("embedding_version", sa.String(length=128), nullable=True),
        schema="ai",
    )
    op.execute(
        "CREATE INDEX learner_memories_embedding_v2_hnsw "
        "ON ai.learner_memories USING hnsw (embedding_v2 vector_cosine_ops)"
    )
    op.execute(
        "CREATE INDEX coach_knowledge_embedding_v2_hnsw "
        "ON ai.coach_knowledge_chunks USING hnsw (embedding_v2 vector_cosine_ops)"
    )
    op.create_index(
        "learner_memories_embedding_version_idx",
        "learner_memories",
        ["embedding_version"],
        schema="ai",
    )
    op.create_index(
        "coach_knowledge_embedding_version_idx",
        "coach_knowledge_chunks",
        ["embedding_version"],
        schema="ai",
    )


def downgrade() -> None:
    op.drop_index(
        "coach_knowledge_embedding_version_idx",
        table_name="coach_knowledge_chunks",
        schema="ai",
    )
    op.drop_index(
        "learner_memories_embedding_version_idx",
        table_name="learner_memories",
        schema="ai",
    )
    op.drop_index(
        "coach_knowledge_embedding_v2_hnsw",
        table_name="coach_knowledge_chunks",
        schema="ai",
    )
    op.drop_index(
        "learner_memories_embedding_v2_hnsw",
        table_name="learner_memories",
        schema="ai",
    )
    op.drop_column("coach_knowledge_chunks", "embedding_version", schema="ai")
    op.drop_column("coach_knowledge_chunks", "embedding_v2", schema="ai")
    op.drop_column("learner_memories", "embedding_version", schema="ai")
    op.drop_column("learner_memories", "embedding_v2", schema="ai")
