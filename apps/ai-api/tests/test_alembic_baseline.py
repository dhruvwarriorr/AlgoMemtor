from __future__ import annotations

import io
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config

ALEMBIC_INI = Path(__file__).parents[1] / "alembic.ini"
DATABASE_URL = "postgresql://algomemtor:pass%25word@localhost:5432/algomemtor"


def render_sql(
    monkeypatch: pytest.MonkeyPatch,
    operation: str,
    revision: str,
) -> str:
    monkeypatch.setenv("DATABASE_URL", DATABASE_URL)
    output = io.StringIO()
    config = Config(str(ALEMBIC_INI), output_buffer=output)

    if operation == "upgrade":
        command.upgrade(config, revision, sql=True)
    else:
        command.downgrade(config, revision, sql=True)

    return output.getvalue()


def test_upgrade_creates_only_the_ai_schema_and_ranking_audits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sql = render_sql(monkeypatch, "upgrade", "head")

    assert "CREATE SCHEMA IF NOT EXISTS ai;" in sql
    assert "CREATE TABLE ai.ranking_audits" in sql
    assert "CREATE EXTENSION IF NOT EXISTS vector;" in sql
    assert "CREATE TABLE ai.memory_evidence" in sql
    assert "evidence_id UUID NOT NULL" in sql
    assert "idempotency_key VARCHAR(160) NOT NULL" in sql
    assert "'recommendation_feedback'" in sql
    assert "'profile_preference'" in sql
    assert "problem_provider VARCHAR(32)" in sql
    assert "problem_external_id VARCHAR(128)" in sql
    assert "memory_evidence_problem_identity_check" in sql
    assert "memory_evidence_learner_problem_idx" in sql
    assert "CREATE TABLE ai.reflection_summaries" in sql
    assert "CREATE TABLE ai.learner_memories" in sql
    assert "embedding VECTOR(768)" in sql
    assert "USING hnsw" in sql
    assert "vector_cosine_ops" in sql
    assert "CREATE TABLE ai.memory_evidence_links" in sql
    assert "CREATE TABLE ai.memory_processing_outbox" in sql
    assert "attempts INTEGER" in sql
    assert "attempts >= 0 AND attempts <= 4" in sql
    assert "CREATE TABLE ai.memory_generation_audits" in sql
    assert "raw_prompt" not in sql
    assert "CREATE TABLE core." not in sql
    assert "CREATE TABLE ai_alembic_version" in sql
    assert "CREATE TABLE alembic_version" not in sql


def test_downgrade_removes_only_the_ai_schema(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sql = render_sql(monkeypatch, "downgrade", "head:base")

    assert "DROP SCHEMA IF EXISTS ai;" in sql
    assert "DROP TABLE ai.ranking_audits" in sql
    assert "DROP TABLE ai.memory_generation_audits" in sql
    assert "DROP TABLE ai.memory_processing_outbox" in sql
    assert "DROP TABLE ai.memory_evidence_links" in sql
    assert "DROP TABLE ai.learner_memories" in sql
    assert "DROP TABLE ai.reflection_summaries" in sql
    assert "DROP TABLE ai.memory_evidence" in sql
    assert "DROP TABLE core." not in sql


def test_database_url_is_required(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    config = Config(str(ALEMBIC_INI), output_buffer=io.StringIO())

    with pytest.raises(RuntimeError, match="DATABASE_URL must be set"):
        command.upgrade(config, "head", sql=True)
