"""Read a public web page the learner linked, safely and transiently.

The coach reads pages a learner pastes (a blog post, an editorial, a problem on
a site AlgoMemtor has no adapter for) the way a browser would show them, as
plain text for the current turn only. Nothing is stored.

Server-side fetching of user-supplied URLs is an SSRF risk, so every hop is
checked: https only (http is upgraded), no credentials in the URL, the host must
resolve only to public addresses, redirects are followed manually and
re-validated, and the response is bounded in time, size and content type.
"""

from __future__ import annotations

import asyncio
import contextlib
import re
import socket
from dataclasses import dataclass
from html.parser import HTMLParser
from ipaddress import ip_address
from urllib.parse import urljoin, urlparse, urlunparse

import httpx

MAX_BYTES = 1_500_000
MAX_TEXT = 14_000
MAX_REDIRECTS = 4
_TEXT_TYPES = ("text/html", "text/plain", "text/markdown", "application/json")
_USER_AGENT = (
    "Mozilla/5.0 (compatible; AlgoMemtorCoach/1.0; reads a page a learner shared)"
)


@dataclass(frozen=True)
class WebPage:
    url: str
    title: str
    text: str


class WebReadError(Exception):
    """A page could not be read; the message is safe to show the model."""


def normalize_public_url(value: str) -> str | None:
    """Return an https URL without credentials or fragment, or None."""
    candidate = value.strip()
    if candidate.lower().startswith("http://"):
        candidate = "https://" + candidate[7:]
    if not candidate.lower().startswith("https://"):
        return None
    try:
        parsed = urlparse(candidate)
        _ = parsed.port
    except ValueError:
        return None
    host = (parsed.hostname or "").lower().rstrip(".")
    if (
        not host
        or parsed.username is not None
        or parsed.password is not None
        or host == "localhost"
        or host.endswith((".local", ".internal", ".localhost"))
        or re.fullmatch(r"(?:0x[0-9a-f]+|[0-9]+)", host)
    ):
        return None
    try:
        literal = ip_address(host.strip("[]"))
    except ValueError:
        literal = None
    if literal is not None and not literal.is_global:
        return None
    return urlunparse(parsed._replace(fragment=""))


async def _resolves_publicly(host: str, port: int) -> bool:
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(
            host, port, type=socket.SOCK_STREAM
        )
    except OSError:
        return False
    addresses = {info[4][0] for info in infos}
    return bool(addresses) and all(
        ip_address(address.split("%", 1)[0]).is_global for address in addresses
    )


class _TextExtractor(HTMLParser):
    _SKIP = frozenset(
        {"script", "style", "noscript", "svg", "nav", "footer", "iframe", "form"}
    )
    _BLOCK = frozenset(
        {
            "p",
            "div",
            "li",
            "br",
            "tr",
            "pre",
            "section",
            "article",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
        }
    )

    def __init__(self, link_base: str | None = None) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.title = ""
        self._skip_depth = 0
        self._in_title = False
        # When set, anchors become Markdown links resolved against this URL.
        self._link_base = link_base
        self._links: list[str | None] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self._SKIP:
            self._skip_depth += 1
        elif tag == "title":
            self._in_title = True
        elif tag == "a" and self._link_base is not None and self._skip_depth == 0:
            href = dict(attrs).get("href") or ""
            target = normalize_public_url(urljoin(self._link_base, href))
            self._links.append(target)
            if target is not None:
                self.parts.append("[")
        elif tag in self._BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self._SKIP and self._skip_depth > 0:
            self._skip_depth -= 1
        elif tag == "title":
            self._in_title = False
        elif tag == "a" and self._link_base is not None and self._links:
            target = self._links.pop()
            if target is not None:
                self.parts.append(f"]({target})")
        elif tag in self._BLOCK:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data
        elif self._skip_depth == 0:
            self.parts.append(data)


def html_to_text(html: str, link_base: str | None = None) -> tuple[str, str]:
    extractor = _TextExtractor(link_base)
    # A malformed page still yields whatever text parsed before the error.
    with contextlib.suppress(Exception):
        extractor.feed(html)
        extractor.close()
    text = "".join(extractor.parts)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s*\n\s*", "\n\n", text).strip()
    return " ".join(extractor.title.split())[:200], text


async def read_public_page(
    url: str, *, timeout_seconds: float = 10, keep_links: bool = False
) -> WebPage:
    current = normalize_public_url(url)
    if current is None:
        raise WebReadError("Only public https links can be opened.")
    async with httpx.AsyncClient(
        timeout=timeout_seconds,
        follow_redirects=False,
        headers={"user-agent": _USER_AGENT, "accept": "text/html,text/plain;q=0.9"},
    ) as client:
        for _ in range(MAX_REDIRECTS + 1):
            parsed = urlparse(current)
            if not await _resolves_publicly(parsed.hostname or "", parsed.port or 443):
                raise WebReadError("That link does not point to a public website.")
            try:
                async with client.stream("GET", current) as response:
                    if response.status_code in {301, 302, 303, 307, 308}:
                        location = response.headers.get("location", "")
                        next_url = normalize_public_url(urljoin(current, location))
                        if next_url is None:
                            raise WebReadError("The page redirected somewhere unsafe.")
                        current = next_url
                        continue
                    if response.status_code >= 400:
                        raise WebReadError(
                            f"The site answered with HTTP {response.status_code}; "
                            "it may block automated reading."
                        )
                    content_type = response.headers.get("content-type", "").lower()
                    if not content_type.startswith(_TEXT_TYPES):
                        raise WebReadError("That link is not a readable text page.")
                    body = bytearray()
                    async for chunk in response.aiter_bytes():
                        body.extend(chunk)
                        if len(body) > MAX_BYTES:
                            break
                    encoding = response.encoding or "utf-8"
            except httpx.HTTPError as error:
                raise WebReadError("The page could not be reached.") from error
            raw = bytes(body).decode(encoding, errors="replace")
            if content_type.startswith("text/html"):
                title, text = html_to_text(raw, current if keep_links else None)
            else:
                title, text = "", raw.strip()
            if not text:
                raise WebReadError("The page had no readable text.")
            if len(text) > MAX_TEXT:
                text = text[:MAX_TEXT].rstrip() + "\n…"
            return WebPage(
                url=current, title=title or parsed.hostname or current, text=text
            )
    raise WebReadError("The page redirected too many times.")


_URL_IN_TEXT = re.compile(r"\bhttps?://[^\s<>\"'`)\]]+", re.IGNORECASE)


def extract_urls(text: str, limit: int = 3) -> list[str]:
    urls: list[str] = []
    for match in _URL_IN_TEXT.finditer(text):
        url = normalize_public_url(match.group(0).rstrip(".,;:!?"))
        if url is not None and url not in urls:
            urls.append(url)
        if len(urls) == limit:
            break
    return urls
