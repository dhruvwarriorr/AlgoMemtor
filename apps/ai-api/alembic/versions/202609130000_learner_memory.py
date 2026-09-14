from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import VECTOR
from sqlalchemy.dialects import postgresql

revision: str = "202609130000"
down_revision: str | None = "202609120000"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "memory_evidence",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("learner_id", sa.Uuid(), nullable=False),
        sa.Column("evidence_id", sa.Uuid(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=160), nullable=False),
        sa.Column("evidence_type", sa.String(length=32), nullable=False),
        sa.Column("context_hash", sa.String(length=64), nullable=False),
        sa.Column("has_note", sa.Boolean(), nullable=False),
        sa.Column("has_structured_context", sa.Boolean(), nullable=False),
        sa.Column(
            "evidence_strength",
            sa.Numeric(4, 3),
            server_default=sa.text("1.000"),
            nullable=False,
        ),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "evidence_type IN ('reflection', 'manual_progress', "
            "'recommendation_feedback', 'status_action', 'timer', "
            "'bookmark', 'outbound_open', 'analytics')",
            name="memory_evidence_type_check",
        ),
        sa.CheckConstraint(
            "evidence_strength >= 0 AND evidence_strength <= 1",
            name="memory_evidence_strength_check",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("evidence_id", name="memory_evidence_evidence_key"),
        sa.UniqueConstraint(
            "learner_id",
            "idempotency_key",
            name="memory_evidence_idempotency_key",
        ),
        schema="ai",
    )
    op.create_index(
        "memory_evidence_learner_created_idx",
        "memory_evidence",
        ["learner_id", "created_at"],
        schema="ai",
    )

    op.create_table(
        "reflection_summaries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("learner_id", sa.Uuid(), nullable=False),
        sa.Column("evidence_id", sa.Uuid(), nullable=False),
        sa.Column("summary", sa.String(length=800), nullable=False),
        sa.Column("key_signals", postgresql.JSONB(), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=False),
        sa.Column("generation_version", sa.String(length=64), nullable=False),
        sa.Column("consent_policy_version", sa.String(length=64), nullable=False),
        sa.Column("prompt_version", sa.String(length=64), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("estimated_cost_usd", sa.Numeric(12, 8), nullable=True),
        sa.Column("input_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["evidence_id"], ["ai.memory_evidence.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("evidence_id", name="reflection_summaries_evidence_key"),
        schema="ai",
    )
    op.create_index(
        "reflection_summaries_learner_created_idx",
        "reflection_summaries",
        ["learner_id", "created_at"],
        schema="ai",
    )

    op.create_table(
        "learner_memories",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("learner_id", sa.Uuid(), nullable=False),
        sa.Column("memory_key", sa.String(length=64), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=False),
        sa.Column("statement", sa.String(length=500), nullable=False),
        sa.Column("structured_value", postgresql.JSONB(), nullable=False),
        sa.Column("confidence", sa.Numeric(4, 3), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("supersedes_memory_id", sa.Uuid(), nullable=True),
        sa.Column("learner_corrected", sa.Boolean(), nullable=False),
        sa.Column("embedding", VECTOR(768), nullable=True),
        sa.Column("embedding_model", sa.String(length=128), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "category IN ('preference', 'difficulty_calibration', "
            "'topic_weakness', 'scheduling_preference', "
            "'recommendation_feedback_pattern')",
            name="learner_memories_category_check",
        ),
        sa.CheckConstraint(
            "confidence >= 0 AND confidence <= 1",
            name="learner_memories_confidence_check",
        ),
        sa.CheckConstraint(
            "status IN ('proposed', 'active', 'archived')",
            name="learner_memories_status_check",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "learner_id", "memory_key", name="learner_memories_learner_key"
        ),
        sa.ForeignKeyConstraint(
            ["supersedes_memory_id"],
            ["ai.learner_memories.id"],
            ondelete="SET NULL",
        ),
        schema="ai",
    )
    op.create_index(
        "learner_memories_learner_status_idx",
        "learner_memories",
        ["learner_id", "status", "confidence", "updated_at"],
        schema="ai",
    )
    op.execute(
        "CREATE INDEX learner_memories_embedding_hnsw_idx "
        "ON ai.learner_memories USING hnsw "
        "(embedding vector_cosine_ops) "
        "WHERE status = 'active' AND confidence >= 0.75"
    )

    op.create_table(
        "memory_evidence_links",
        sa.Column("memory_id", sa.Uuid(), nullable=False),
        sa.Column("evidence_id", sa.Uuid(), nullable=False),
        sa.Column("support_strength", sa.Numeric(4, 3), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "support_strength >= 0 AND support_strength <= 1",
            name="memory_evidence_links_strength_check",
        ),
        sa.ForeignKeyConstraint(
            ["memory_id"], ["ai.learner_memories.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["evidence_id"], ["ai.memory_evidence.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("memory_id", "evidence_id"),
        schema="ai",
    )

    op.create_table(
        "memory_processing_outbox",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("learner_id", sa.Uuid(), nullable=False),
        sa.Column("evidence_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column(
            "attempts", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column(
            "available_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_code", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'processing', 'completed', 'failed')",
            name="memory_processing_outbox_status_check",
        ),
        sa.CheckConstraint(
            "attempts >= 0 AND attempts <= 4",
            name="memory_processing_outbox_attempts_check",
        ),
        sa.ForeignKeyConstraint(
            ["evidence_id"], ["ai.memory_evidence.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "evidence_id", name="memory_processing_outbox_evidence_key"
        ),
        schema="ai",
    )
    op.create_index(
        "memory_processing_outbox_status_idx",
        "memory_processing_outbox",
        ["status", "available_at"],
        schema="ai",
    )

    op.create_table(
        "memory_generation_audits",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("request_id", sa.String(length=160), nullable=False),
        sa.Column("learner_id", sa.Uuid(), nullable=False),
        sa.Column("evidence_id", sa.Uuid(), nullable=True),
        sa.Column("memory_id", sa.Uuid(), nullable=True),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=False),
        sa.Column("generation_version", sa.String(length=64), nullable=False),
        sa.Column("embedding_model", sa.String(length=128), nullable=True),
        sa.Column("fallback", sa.Boolean(), nullable=False),
        sa.Column("fallback_reason", sa.String(length=64), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("estimated_cost_usd", sa.Numeric(12, 8), nullable=True),
        sa.Column("memory_ids", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("input_hash", sa.String(length=64), nullable=True),
        sa.Column("output_hash", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "action IN ('process', 'approve', 'correct', 'archive', 'restore', 'delete')",
            name="memory_generation_audits_action_check",
        ),
        sa.CheckConstraint(
            "latency_ms >= 0", name="memory_generation_audits_latency_check"
        ),
        sa.PrimaryKeyConstraint("id"),
        schema="ai",
    )
    op.create_index(
        "memory_generation_audits_learner_created_idx",
        "memory_generation_audits",
        ["learner_id", "created_at"],
        schema="ai",
    )
    op.create_index(
        "memory_generation_audits_request_id_idx",
        "memory_generation_audits",
        ["request_id"],
        schema="ai",
    )


def downgrade() -> None:
    op.drop_index(
        "memory_generation_audits_request_id_idx",
        table_name="memory_generation_audits",
        schema="ai",
    )
    op.drop_index(
        "memory_generation_audits_learner_created_idx",
        table_name="memory_generation_audits",
        schema="ai",
    )
    op.drop_table("memory_generation_audits", schema="ai")
    op.drop_index(
        "memory_processing_outbox_status_idx",
        table_name="memory_processing_outbox",
        schema="ai",
    )
    op.drop_table("memory_processing_outbox", schema="ai")
    op.drop_table("memory_evidence_links", schema="ai")
    op.execute("DROP INDEX IF EXISTS ai.learner_memories_embedding_hnsw_idx")
    op.drop_index(
        "learner_memories_learner_status_idx",
        table_name="learner_memories",
        schema="ai",
    )
    op.drop_table("learner_memories", schema="ai")
    op.drop_index(
        "reflection_summaries_learner_created_idx",
        table_name="reflection_summaries",
        schema="ai",
    )
    op.drop_table("reflection_summaries", schema="ai")
    op.drop_index(
        "memory_evidence_learner_created_idx",
        table_name="memory_evidence",
        schema="ai",
    )
    op.drop_table("memory_evidence", schema="ai")
