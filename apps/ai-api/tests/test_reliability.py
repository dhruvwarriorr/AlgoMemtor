from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from starlette.requests import Request
from starlette.responses import Response

from app import ai_health
from app.knowledge_repository import KnowledgeRepository
from app.rate_limit import InMemoryRateLimiter, rate_limit_internal_request
from app.settings import AiSettings


def request(headers: list[tuple[bytes, bytes]] | None = None) -> Request:
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "POST",
            "scheme": "https",
            "path": "/internal/test/learner-id",
            "raw_path": b"/internal/test/learner-id",
            "query_string": b"",
            "headers": headers or [],
            "client": ("127.0.0.1", 1234),
            "server": ("testserver", 443),
        }
    )


class HealthTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        ai_health._cached_at = 0
        ai_health._cached_result = None

    async def test_readiness_requires_provider_and_database(self) -> None:
        settings = AiSettings(
            database_url="postgresql://user:pass@localhost/db",
            openrouter_api_key="test-key",
            health_cache_seconds=0,
        )
        with (
            patch.object(ai_health, "_provider_ready", AsyncMock(return_value=True)),
            patch.object(ai_health, "_database_ready", AsyncMock(return_value=False)),
        ):
            result = await ai_health.ai_health(settings)

        self.assertFalse(result["ready"])
        self.assertTrue(result["chat"]["available"])
        self.assertFalse(result["database"]["available"])

    async def test_readiness_result_is_cached(self) -> None:
        settings = AiSettings(
            database_url="postgresql://user:pass@localhost/db",
            openrouter_api_key="test-key",
            health_cache_seconds=30,
        )
        provider = AsyncMock(return_value=True)
        database = AsyncMock(return_value=True)
        with (
            patch.object(ai_health, "_provider_ready", provider),
            patch.object(ai_health, "_database_ready", database),
        ):
            first = await ai_health.ai_health(settings)
            second = await ai_health.ai_health(settings)

        self.assertTrue(first["ready"])
        self.assertIs(first, second)
        provider.assert_awaited_once()
        database.assert_awaited_once()


class RateLimitTests(unittest.IsolatedAsyncioTestCase):
    async def test_valid_internal_calls_return_429_without_trusting_forwarded_ip(
        self,
    ) -> None:
        limiter = InMemoryRateLimiter(limit=1)
        headers = [
            (b"x-internal-service-token", b"test-token"),
            (b"x-forwarded-for", b"spoofed"),
        ]

        async def call_next(_request: Request) -> Response:
            return Response(status_code=204)

        first = await rate_limit_internal_request(
            request(headers), call_next, limiter, "test-token"
        )
        second = await rate_limit_internal_request(
            request(headers), call_next, limiter, "test-token"
        )

        self.assertEqual(first.status_code, 204)
        self.assertEqual(second.status_code, 429)
        self.assertIn("retry-after", second.headers)


class FakeConnection:
    def __init__(self, checksum: str) -> None:
        self.checksum = checksum
        self.statements: list[object] = []

    async def scalar(self, statement: object) -> object:
        self.statements.append(statement)
        return self.checksum if len(self.statements) == 1 else 0


class KnowledgeSeedTests(unittest.IsolatedAsyncioTestCase):
    async def test_pending_embedding_check_is_scoped_to_source(self) -> None:
        connection = FakeConnection("checksum")
        repository = KnowledgeRepository.__new__(KnowledgeRepository)

        seeded = await repository._already_seeded(
            connection,  # type: ignore[arg-type]
            uuid4(),
            "checksum",
            "embedding-v1",
        )

        self.assertTrue(seeded)
        pending_query = str(connection.statements[1])
        self.assertIn("coach_knowledge_chunks.source_id", pending_query)


if __name__ == "__main__":
    unittest.main()
