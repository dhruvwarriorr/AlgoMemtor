from typing import Any

import pytest
from app import page_retrieval
from app.page_retrieval import (
    clear_page_cache,
    looks_blocked,
    parse_reader_output,
    retrieve_public_page,
)
from app.settings import AiSettings
from app.web_reader import WebPage, WebReadError

URL = "https://codeforces.com/problemset/problem/2266/D"


def settings(**updates: Any) -> AiSettings:
    return AiSettings(_env_file=None, **updates)


@pytest.fixture(autouse=True)
def fresh_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    clear_page_cache()

    async def public(_host: str, _port: int) -> bool:
        return True

    monkeypatch.setattr(page_retrieval, "_resolves_publicly", public)


def test_challenge_pages_are_recognized() -> None:
    assert looks_blocked(WebPage(url=URL, title="Just a moment...", text="x" * 80))
    assert looks_blocked(WebPage(url=URL, title="Problem", text="short"))
    assert not looks_blocked(
        WebPage(url=URL, title="Problem", text="Vihaan is repairing a road " * 4)
    )


def test_reader_envelope_is_parsed_and_images_dropped() -> None:
    body = (
        "Title: Problem - 2266D - Codeforces\n\nURL Source: x\n\n"
        "Markdown Content:\n![logo](https://img)\nVihaan is repairing a road."
    )
    page = parse_reader_output(URL, body)
    assert page.title == "Problem - 2266D - Codeforces"
    assert page.text == "Vihaan is repairing a road."


@pytest.mark.asyncio
async def test_direct_reads_are_used_and_cached(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []

    async def direct(url: str, **_kwargs: Any) -> WebPage:
        calls.append(url)
        return WebPage(url=url, title="Two Sum", text="Given an array " * 10)

    monkeypatch.setattr(page_retrieval, "read_public_page", direct)
    first = await retrieve_public_page(URL, settings())
    second = await retrieve_public_page(URL, settings())
    assert first == second
    assert calls == [URL]


@pytest.mark.asyncio
async def test_blocked_pages_fall_back_to_the_reader(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def challenge(url: str, **_kwargs: Any) -> WebPage:
        raise WebReadError("The site answered with HTTP 403.")

    async def reader(_settings: AiSettings, url: str, _timeout: float) -> WebPage:
        return WebPage(url=url, title="Problem", text="Vihaan is repairing a road.")

    monkeypatch.setattr(page_retrieval, "read_public_page", challenge)
    monkeypatch.setattr(page_retrieval, "_read_via_reader", reader)
    page = await retrieve_public_page(URL, settings())
    assert page.text == "Vihaan is repairing a road."


@pytest.mark.asyncio
async def test_without_a_reader_the_direct_error_is_raised(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def challenge(url: str, **_kwargs: Any) -> WebPage:
        return WebPage(url=url, title="Just a moment...", text="x" * 100)

    monkeypatch.setattr(page_retrieval, "read_public_page", challenge)
    with pytest.raises(WebReadError, match="blocked"):
        await retrieve_public_page(URL, settings(web_reader_proxy_url=""))


@pytest.mark.asyncio
async def test_private_targets_are_never_sent_to_the_reader() -> None:
    with pytest.raises(WebReadError):
        await retrieve_public_page("https://localhost/admin", settings())
