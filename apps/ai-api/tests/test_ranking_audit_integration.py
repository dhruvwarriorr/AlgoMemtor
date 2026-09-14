from __future__ import annotations

import hashlib
import os
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from app.ranking_audit import RankingAudit, RankingAuditRepository
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

ALEMBIC_INI = Path(__file__).parents[1] / "alembic.ini"
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")
HAS_TEST_DATABASE = bool(TEST_DATABASE_URL and TEST_DATABASE_URL.strip())

pytestmark = pytest.mark.skipif(
    not HAS_TEST_DATABASE,
    reason="TEST_DATABASE_URL is required for PostgreSQL integration tests.",
)


def _test_database_url() -> str:
    if TEST_DATABASE_URL is None or not TEST_DATABASE_URL.strip():
        raise RuntimeError("TEST_DATABASE_URL is required for this integration test.")
    return TEST_DATABASE_URL.strip()


def _async_database_url(database_url: str) -> str:
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+psycopg://", 1)
    return database_url


@pytest.fixture
def migrated_database(monkeypatch: pytest.MonkeyPatch) -> str:
    database_url = _test_database_url()
    monkeypatch.setenv("DATABASE_URL", database_url)
    command.upgrade(Config(str(ALEMBIC_INI)), "head")
    return database_url


@pytest.mark.asyncio
async def test_ranking_audit_migration_and_repository_store_only_preference_hash(
    migrated_database: str,
) -> None:
    engine = create_async_engine(
        _async_database_url(migrated_database),
        pool_pre_ping=True,
    )
    request_id = f"ranking_audit_integration_{uuid4().hex}"
    learner_id = uuid4()
    raw_preference = f"private preference {uuid4().hex}"
    preference_hash = hashlib.sha256(raw_preference.encode()).hexdigest()
    audit = RankingAudit(
        request_id=request_id,
        learner_id=learner_id,
        model="integration-test-model",
        ranking_version="ai-gemini-v1",
        pricing_version="integration-pricing-v1",
        candidate_ids=["codeforces:100A", "codeforces:200B"],
        returned_ids=["codeforces:200B", "codeforces:100A"],
        fallback=False,
        fallback_reason=None,
        latency_ms=123,
        input_tokens=100,
        output_tokens=20,
        estimated_cost_usd=Decimal("0.00123456"),
        preference_hash=preference_hash,
    )
    table_exists = False

    try:
        async with engine.connect() as connection:
            table_exists = (
                await connection.scalar(text("SELECT to_regclass('ai.ranking_audits')"))
                == "ai.ranking_audits"
            )
            assert table_exists

            revision = await connection.scalar(
                text("SELECT version_num FROM public.ai_alembic_version")
            )
            assert revision == "202609130200"

            column_result = await connection.execute(
                text(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'ai' AND table_name = 'ranking_audits'
                    """
                )
            )
            column_names = {row[0] for row in column_result}
            assert "preference_hash" in column_names
            assert "preference" not in column_names

        repository = RankingAuditRepository(engine)
        audit_id = await repository.save(audit)

        async with engine.connect() as connection:
            result = await connection.execute(
                text(
                    """
                    SELECT id, request_id, learner_id, model, ranking_version,
                           pricing_version, candidate_ids, returned_ids,
                           fallback, fallback_reason,
                           latency_ms, input_tokens, output_tokens,
                           estimated_cost_usd, preference_hash, created_at
                    FROM ai.ranking_audits
                    WHERE request_id = :request_id
                    """
                ),
                {"request_id": request_id},
            )
            row = result.mappings().one()

        assert row["id"] == audit_id
        assert row["request_id"] == request_id
        assert row["learner_id"] == learner_id
        assert row["model"] == audit.model
        assert row["ranking_version"] == audit.ranking_version
        assert row["pricing_version"] == audit.pricing_version
        assert row["candidate_ids"] == audit.candidate_ids
        assert row["returned_ids"] == audit.returned_ids
        assert row["fallback"] is False
        assert row["fallback_reason"] is None
        assert row["latency_ms"] == audit.latency_ms
        assert row["input_tokens"] == audit.input_tokens
        assert row["output_tokens"] == audit.output_tokens
        assert str(row["estimated_cost_usd"]) == "0.00123456"
        assert row["preference_hash"] == preference_hash
        assert row["created_at"] is not None
        assert raw_preference not in repr(dict(row))
    finally:
        try:
            if table_exists:
                async with engine.begin() as connection:
                    await connection.execute(
                        text(
                            "DELETE FROM ai.ranking_audits "
                            "WHERE request_id = :request_id"
                        ),
                        {"request_id": request_id},
                    )
        finally:
            await engine.dispose()
