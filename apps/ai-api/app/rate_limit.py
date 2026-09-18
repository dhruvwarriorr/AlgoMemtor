from __future__ import annotations

import asyncio
import hashlib
import time
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable

from fastapi import HTTPException, Request, status
from starlette.responses import Response


class InMemoryRateLimiter:
    def __init__(self, limit: int = 120, window_seconds: int = 60) -> None:
        self.limit = max(1, limit)
        self.window_seconds = max(1, window_seconds)
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def check(self, key: str) -> None:
        now = time.monotonic()
        async with self._lock:
            hits = self._hits[key]
            cutoff = now - self.window_seconds
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if len(hits) >= self.limit:
                retry_after = max(1, int(hits[0] + self.window_seconds - now))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="AI request rate limit exceeded. Try again shortly.",
                    headers={"Retry-After": str(retry_after)},
                )
            hits.append(now)
            if len(self._hits) > 2_048:
                stale = [
                    candidate
                    for candidate, values in self._hits.items()
                    if not values or values[-1] <= cutoff
                ]
                for candidate in stale[:512]:
                    self._hits.pop(candidate, None)


def request_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    address = forwarded.split(",", 1)[0].strip() or (
        request.client.host if request.client is not None else "unknown"
    )
    digest = hashlib.sha256(address.encode()).hexdigest()[:24]
    return f"{digest}:{request.url.path}"


async def rate_limit_internal_request(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
    limiter: InMemoryRateLimiter,
) -> Response:
    if request.url.path.startswith("/internal/"):
        await limiter.check(request_key(request))
    return await call_next(request)
