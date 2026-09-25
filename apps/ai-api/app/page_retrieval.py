"""Read a public page the way a chat assistant's browsing tool would.

Mentor tools and the Coach need only a link to work: the page is read for the
current request and never stored. Some sites (Codeforces among them) answer
server-side requests with a bot challenge, so a direct read that fails or comes
back as a challenge page is retried once through a configured public reader
service (`WEB_READER_PROXY_URL`, r.jina.ai by default), which renders the page
and returns its readable text. The target URL is validated as public before
either route is used, the reader host is fixed by configuration, and responses
are bounded in time and size. Successful reads are cached in memory briefly so
consecutive turns on one problem do not refetch it.
"""

from __future__ import annotations

import re
import time
from collections import OrderedDict
from urllib.parse import urlparse

import httpx

from .settings import AiSettings, get_ai_settings
from .web_reader import (
    MAX_BYTES,
    MAX_TEXT,
    WebPage,
    WebReadError,
    _resolves_publicly,
    normalize_public_url,
    read_public_page,
)

_CHALLENGE = re.compile(
    r"just a moment\.\.\.|verify you are human|enable javascript and cookies|"
    r"checking your browser|attention required|cf-chl-|challenge-platform|"
    r"please complete the security check",
    re.IGNORECASE,
)
_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_CACHE_LIMIT = 64

_cache: OrderedDict[str, tuple[float, WebPage]] = OrderedDict()


def looks_blocked(page: WebPage) -> bool:
    """A bot-challenge or near-empty interstitial rather than the real page."""
    head = f"{page.title}\n{page.text[:2_000]}"
    return bool(_CHALLENGE.search(head)) or len(page.text.strip()) < 40


def _cached(url: str, ttl: float) -> WebPage | None:
    entry = _cache.get(url)
    if entry is None:
        return None
    stored_at, page = entry
    if time.monotonic() - stored_at > ttl:
        _cache.pop(url, None)
        return None
    _cache.move_to_end(url)
    return page


def _remember(url: str, page: WebPage) -> None:
    _cache[url] = (time.monotonic(), page)
    _cache.move_to_end(url)
    while len(_cache) > _CACHE_LIMIT:
        _cache.popitem(last=False)


def clear_page_cache() -> None:
    _cache.clear()


def parse_reader_output(url: str, body: str) -> WebPage:
    """Split the reader's `Title:` / `Markdown Content:` envelope."""
    title = ""
    text = body
    match = re.search(r"^Title:\s*(.+)$", body, re.MULTILINE)
    if match:
        title = " ".join(match.group(1).split())[:200]
    marker = body.find("Markdown Content:")
    if marker != -1:
        text = body[marker + len("Markdown Content:") :]
    text = _IMAGE.sub("", text)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s*\n\s*", "\n\n", text).strip()
    if len(text) > MAX_TEXT:
        text = text[:MAX_TEXT].rstrip() + "\n…"
    return WebPage(url=url, title=title or (urlparse(url).hostname or url), text=text)


async def _read_via_reader(
    settings: AiSettings, url: str, timeout_seconds: float
) -> WebPage:
    base = settings.web_reader_proxy_url.strip()
    if not base.lower().startswith("https://"):
        raise WebReadError("No page reader is configured.")
    headers = {"accept": "text/plain", "x-return-format": "markdown"}
    if settings.web_reader_proxy_api_key:
        headers["authorization"] = f"Bearer {settings.web_reader_proxy_api_key}"
    try:
        async with (
            httpx.AsyncClient(
                timeout=timeout_seconds, follow_redirects=False, headers=headers
            ) as client,
            client.stream("GET", f"{base.rstrip('/')}/{url}") as response,
        ):
            if response.status_code >= 400:
                raise WebReadError(
                    f"The page reader answered with HTTP {response.status_code}."
                )
            body = bytearray()
            async for chunk in response.aiter_bytes():
                body.extend(chunk)
                if len(body) > MAX_BYTES:
                    break
    except httpx.HTTPError as error:
        raise WebReadError("The page reader could not be reached.") from error
    page = parse_reader_output(url, bytes(body).decode("utf-8", errors="replace"))
    if looks_blocked(page):
        raise WebReadError("The site blocked automated reading of this page.")
    return page


async def retrieve_public_page(
    url: str,
    settings: AiSettings | None = None,
    *,
    timeout_seconds: float | None = None,
    keep_links: bool = False,
) -> WebPage:
    """Read a public page directly, falling back to the reader service.

    `keep_links` keeps anchors as Markdown links, for pages read to find a
    link (the reader service always returns them).
    """
    settings = settings or get_ai_settings()
    target = normalize_public_url(url)
    if target is None:
        raise WebReadError("Only public https links can be opened.")
    ttl = settings.web_reader_cache_seconds
    cache_key = f"links:{target}" if keep_links else target
    if ttl > 0 and (hit := _cached(cache_key, ttl)) is not None:
        return hit
    timeout = timeout_seconds or settings.web_reader_timeout_seconds
    failure: WebReadError
    try:
        page = await read_public_page(
            target, timeout_seconds=timeout, keep_links=keep_links
        )
        if not looks_blocked(page):
            if ttl > 0:
                _remember(cache_key, page)
            return page
        failure = WebReadError("The site blocked automated reading of this page.")
    except WebReadError as error:
        failure = error
    if not settings.web_reader_proxy_url.strip():
        raise failure
    parsed = urlparse(target)
    if not await _resolves_publicly(parsed.hostname or "", parsed.port or 443):
        raise WebReadError("That link does not point to a public website.")
    try:
        page = await _read_via_reader(settings, target, max(timeout, 20))
    except WebReadError:
        raise failure from None
    if ttl > 0:
        _remember(cache_key, page)
    return page
