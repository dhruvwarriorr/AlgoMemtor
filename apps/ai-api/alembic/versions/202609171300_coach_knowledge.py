from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import VECTOR

revision: str = "202609171300"
down_revision: str | None = "202609160900"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "coach_knowledge_sources",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("source_key", sa.String(length=120), nullable=False, unique=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("publisher", sa.String(length=120), nullable=False),
        sa.Column("source_url", sa.String(length=2_048), nullable=True),
        sa.Column("version", sa.String(length=64), nullable=False),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        schema="ai",
    )
    op.create_table(
        "coach_knowledge_chunks",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("chunk_key", sa.String(length=160), nullable=False, unique=True),
        sa.Column("topic", sa.String(length=80), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("content", sa.String(length=4_000), nullable=False),
        sa.Column("embedding", VECTOR(768), nullable=True),
        sa.Column("embedding_model", sa.String(length=128), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["source_id"],
            ["ai.coach_knowledge_sources.id"],
            ondelete="CASCADE",
        ),
        schema="ai",
    )
    op.create_index(
        "coach_knowledge_chunks_topic_idx",
        "coach_knowledge_chunks",
        ["topic"],
        schema="ai",
    )
    op.execute(
        "CREATE INDEX coach_knowledge_chunks_embedding_hnsw_idx "
        "ON ai.coach_knowledge_chunks USING hnsw "
        "(embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ai.coach_knowledge_chunks_embedding_hnsw_idx")
    op.drop_index(
        "coach_knowledge_chunks_topic_idx",
        table_name="coach_knowledge_chunks",
        schema="ai",
    )
    op.drop_table("coach_knowledge_chunks", schema="ai")
    op.drop_table("coach_knowledge_sources", schema="ai")
