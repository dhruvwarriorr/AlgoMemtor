from __future__ import annotations

import asyncio
import hashlib
import re
from functools import lru_cache
from typing import Protocol
from uuid import NAMESPACE_URL, uuid5

import sqlalchemy as sa
from pgvector.sqlalchemy import VECTOR
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from .knowledge_base import KNOWLEDGE_CHUNKS, KnowledgeChunk
from .settings import get_ai_settings

metadata = sa.MetaData()

knowledge_sources = sa.Table(
    "coach_knowledge_sources",
    metadata,
    sa.Column("id", sa.Uuid()),
    sa.Column("source_key", sa.String(length=120)),
    sa.Column("title", sa.String(length=200)),
    sa.Column("publisher", sa.String(length=120)),
    sa.Column("source_url", sa.String(length=2_048)),
    sa.Column("version", sa.String(length=64)),
    sa.Column("checksum", sa.String(length=64)),
    sa.Column("status", sa.String(length=16)),
    schema="ai",
)

knowledge_chunks = sa.Table(
    "coach_knowledge_chunks",
    metadata,
    sa.Column("id", sa.Uuid()),
    sa.Column("source_id", sa.Uuid()),
    sa.Column("chunk_key", sa.String(length=160)),
    sa.Column("topic", sa.String(length=80)),
    sa.Column("title", sa.String(length=200)),
    sa.Column("content", sa.String(length=4_000)),
    sa.Column("embedding", VECTOR(768)),
    sa.Column("embedding_model", sa.String(length=128)),
    schema="ai",
)

_SOURCE_KEY = "algomemtor-core-cp-dsa"
_SOURCE_VERSION = "coach-knowledge-v1"
_STOP_WORDS = {
    "a",
    "an",
    "and",
    "for",
    "how",
    "in",
    "is",
    "me",
    "my",
    "of",
    "on",
    "or",
    "the",
    "to",
    "what",
    "which",
    "with",
    "you",
    "your",
}


def _tokens(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9][a-z0-9-]*", value.lower())
        if token not in _STOP_WORDS and (len(token) >= 2 or token == "c")
    }


class KnowledgeRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine
        self._seeded = False
        self._seed_lock = asyncio.Lock()

    async def seed_default(
        self,
        embedder: KnowledgeEmbedder | None = None,
        embedding_model: str | None = None,
        timeout_seconds: float = 4,
    ) -> None:
        if self._seeded:
            return
        async with self._seed_lock:
            if self._seeded:
                return
            source_id = uuid5(NAMESPACE_URL, f"algomemtor:{_SOURCE_KEY}")
            checksum = hashlib.sha256(
                "\n".join(chunk.content for chunk in KNOWLEDGE_CHUNKS).encode()
            ).hexdigest()
            async with self.engine.begin() as connection:
                await connection.execute(
                    insert(knowledge_sources)
                    .values(
                        id=source_id,
                        source_key=_SOURCE_KEY,
                        title="AlgoMemtor CP/DSA reference",
                        publisher="AlgoMemtor",
                        source_url=None,
                        version=_SOURCE_VERSION,
                        checksum=checksum,
                        status="active",
                    )
                    .on_conflict_do_update(
                        index_elements=[knowledge_sources.c.source_key],
                        set_={
                            "title": "AlgoMemtor CP/DSA reference",
                            "version": _SOURCE_VERSION,
                            "checksum": checksum,
                            "status": "active",
                        },
                    )
                )
                for chunk in KNOWLEDGE_CHUNKS:
                    await connection.execute(
                        insert(knowledge_chunks)
                        .values(
                            id=uuid5(NAMESPACE_URL, f"algomemtor:chunk:{chunk.id}"),
                            source_id=source_id,
                            chunk_key=chunk.id,
                            topic=chunk.topic,
                            title=chunk.title,
                            content=chunk.content,
                            embedding=None,
                            embedding_model=None,
                        )
                        .on_conflict_do_update(
                            index_elements=[knowledge_chunks.c.chunk_key],
                            set_={
                                "source_id": source_id,
                                "topic": chunk.topic,
                                "title": chunk.title,
                                "content": chunk.content,
                            },
                        )
                    )
                if embedder is not None:
                    await self._populate_embeddings(
                        connection,
                        embedder,
                        embedding_model,
                        timeout_seconds,
                    )
            self._seeded = True

    async def _populate_embeddings(
        self,
        connection: sa.Connection,
        embedder: KnowledgeEmbedder,
        embedding_model: str | None,
        timeout_seconds: float,
    ) -> None:
        rows = await connection.execute(
            sa.select(
                knowledge_chunks.c.chunk_key,
                knowledge_chunks.c.topic,
                knowledge_chunks.c.title,
                knowledge_chunks.c.content,
            ).where(knowledge_chunks.c.embedding.is_(None))
        )
        pending = list(rows.mappings())
        if not pending:
            return
        semaphore = asyncio.Semaphore(4)

        async def embed(row: sa.RowMapping) -> tuple[str, list[float] | None]:
            async with semaphore:
                async with asyncio.timeout(timeout_seconds):
                    vector = await embedder.embed(
                        f"{row['topic']}: {row['title']}\n{row['content']}",
                        task_type="RETRIEVAL_DOCUMENT",
                    )
                return row["chunk_key"], vector

        results = await asyncio.gather(
            *(embed(row) for row in pending), return_exceptions=True
        )
        for result in results:
            if isinstance(result, asyncio.CancelledError):
                raise result
            if isinstance(result, BaseException):
                continue
            chunk_key, vector = result
            await connection.execute(
                knowledge_chunks.update()
                .where(knowledge_chunks.c.chunk_key == chunk_key)
                .values(embedding=vector, embedding_model=embedding_model)
            )

    async def search(
        self,
        query: str,
        limit: int = 8,
        query_embedding: list[float] | None = None,
    ) -> list[KnowledgeChunk]:
        result: list[KnowledgeChunk] = []
        async with self.engine.connect() as connection:
            columns = [
                knowledge_chunks.c.chunk_key,
                knowledge_chunks.c.topic,
                knowledge_chunks.c.title,
                knowledge_chunks.c.content,
            ]
            distance = None
            if query_embedding is not None:
                distance = knowledge_chunks.c.embedding.cosine_distance(
                    sa.bindparam("query_embedding", type_=VECTOR(768))
                ).label("distance")
                columns.append(distance)
            statement = sa.select(*columns)
            if distance is not None:
                statement = statement.order_by(distance.asc().nulls_last())
            else:
                statement = statement.order_by(
                    knowledge_chunks.c.topic, knowledge_chunks.c.chunk_key
                )
            rows = await connection.execute(
                statement,
                {} if query_embedding is None else {"query_embedding": query_embedding},
            )
            query_tokens = _tokens(query)
            scored: list[tuple[int, str, KnowledgeChunk]] = []
            for row in rows.mappings():
                chunk = KnowledgeChunk(
                    id=row["chunk_key"],
                    topic=row["topic"],
                    title=row["title"],
                    content=row["content"],
                )
                overlap = len(
                    query_tokens
                    & _tokens(f"{chunk.topic} {chunk.title} {chunk.content}")
                )
                semantic = 0.0
                if distance is not None and row.get("distance") is not None:
                    semantic = max(0.0, 1.0 - float(row["distance"]))
                score = overlap * 10 + round(semantic * 5)
                if score:
                    scored.append((score, chunk.id, chunk))
            scored.sort(key=lambda item: (-item[0], item[1]))
            topics: set[str] = set()
            for _, _, chunk in scored:
                if (
                    chunk.topic in topics
                    and sum(1 for selected in result if selected.topic == chunk.topic)
                    >= 2
                ):
                    continue
                result.append(chunk)
                topics.add(chunk.topic)
                if len(result) >= limit:
                    break
        return result


class KnowledgeEmbedder(Protocol):
    async def embed(self, text: str, *, task_type: str) -> list[float]: ...


@lru_cache
def get_knowledge_repository() -> KnowledgeRepository | None:
    database_url = get_ai_settings().database_url
    if not database_url:
        return None
    return KnowledgeRepository(create_async_engine(database_url, pool_pre_ping=True))
