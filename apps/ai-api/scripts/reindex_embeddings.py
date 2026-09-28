"""Restartable, idempotent reindex for the versioned 1024-d embedding columns."""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from collections.abc import Sequence
from pathlib import Path

import sqlalchemy as sa

# Run from the repository root (npm script) or from apps/ai-api: resolve the
# app package and read apps/ai-api/.env either way.
SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))
os.chdir(SERVICE_ROOT)

from app.database import shared_engine
from app.embedding import create_embedder
from app.knowledge_repository import get_knowledge_repository
from app.settings import get_ai_settings

TABLES = {
    "memories": (
        "ai.learner_memories",
        "statement",
        "status IN ('active', 'proposed')",
    ),
    "knowledge": (
        "ai.coach_knowledge_chunks",
        "topic || ': ' || title || E'\\n' || content",
        "TRUE",
    ),
}


def vector_literal(values: Sequence[float]) -> str:
    return "[" + ",".join(f"{value:.9g}" for value in values) + "]"


async def reindex_table(name: str, batch_size: int) -> int:
    settings = get_ai_settings()
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is required.")
    table, text_expression, extra_filter = TABLES[name]
    engine = shared_engine(settings.database_url)
    embedder = create_embedder(settings)
    updated = 0
    try:
        if name == "knowledge":
            repository = get_knowledge_repository()
            if repository is not None:
                # Insert/update the built-in text in a short transaction.
                # Embedding provider calls remain in this maintenance script,
                # outside application startup and database transactions.
                await repository.seed_default()
        while True:
            query = sa.text(
                f"SELECT id, {text_expression} AS text FROM {table} "
                f"WHERE {extra_filter} AND (embedding_v2 IS NULL "
                "OR embedding_version IS DISTINCT FROM :version) "
                "ORDER BY id LIMIT :batch_size"
            )
            async with engine.connect() as connection:
                rows = list(
                    (
                        await connection.execute(
                            query,
                            {
                                "version": settings.active_embedding_version,
                                "batch_size": batch_size,
                            },
                        )
                    ).mappings()
                )
            if not rows:
                break
            for row in rows:
                vector = await embedder.embed(
                    str(row["text"]), task_type="RETRIEVAL_DOCUMENT"
                )
                update = sa.text(
                    f"UPDATE {table} SET embedding_v2 = CAST(:vector AS vector), "
                    "embedding_version = :version WHERE id = :id AND "
                    "(embedding_v2 IS NULL OR embedding_version IS DISTINCT FROM :version)"
                )
                async with engine.begin() as connection:
                    result = await connection.execute(
                        update,
                        {
                            "id": row["id"],
                            "vector": vector_literal(vector),
                            "version": settings.active_embedding_version,
                        },
                    )
                    updated += result.rowcount
            print(f"{name}: {updated} rows updated", flush=True)
    finally:
        await engine.dispose()
    return updated


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--table", choices=["memories", "knowledge", "all"], default="all"
    )
    parser.add_argument("--batch-size", type=int, default=50)
    args = parser.parse_args()
    names = TABLES if args.table == "all" else (args.table,)
    for name in names:
        await reindex_table(name, max(1, min(args.batch_size, 500)))


if __name__ == "__main__":
    asyncio.run(main())
