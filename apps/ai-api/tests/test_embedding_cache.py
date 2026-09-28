from __future__ import annotations

import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app import embedding
from app.embedding import OpenRouterEmbedder


def fake_embedder(dimensions: int = 4) -> OpenRouterEmbedder:
    embedder = OpenRouterEmbedder.__new__(OpenRouterEmbedder)
    embedder.model = "test-model"
    embedder.dimensions = dimensions
    create = AsyncMock(
        return_value=SimpleNamespace(
            data=[SimpleNamespace(embedding=[1.0, 0.0, 0.0, 0.0])]
        )
    )
    embedder.client = SimpleNamespace(embeddings=SimpleNamespace(create=create))  # type: ignore[assignment]
    return embedder


class EmbeddingCacheTests(unittest.TestCase):
    def setUp(self) -> None:
        embedding._cache.clear()

    def test_same_text_is_embedded_once(self) -> None:
        embedder = fake_embedder()

        async def run() -> None:
            first = await embedder.embed("binary search", task_type="RETRIEVAL_QUERY")
            second = await embedder.embed(
                "binary search", task_type="RETRIEVAL_DOCUMENT"
            )
            self.assertEqual(first, second)
            await embedder.embed("dynamic programming", task_type="RETRIEVAL_QUERY")

        asyncio.run(run())
        self.assertEqual(embedder.client.embeddings.create.await_count, 2)  # type: ignore[attr-defined]

    def test_cache_is_bounded(self) -> None:
        embedder = fake_embedder()

        async def run() -> None:
            for index in range(embedding._CACHE_LIMIT + 10):
                await embedder.embed(f"text {index}", task_type="RETRIEVAL_QUERY")

        asyncio.run(run())
        self.assertEqual(len(embedding._cache), embedding._CACHE_LIMIT)


if __name__ == "__main__":
    unittest.main()
