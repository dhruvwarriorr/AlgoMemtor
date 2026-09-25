from __future__ import annotations

from typing import Any
from uuid import UUID

import pytest
from app import web_reader
from app.coach_models import CoachModelOutput, CoachRequest
from app.coach_output import coerce_coach_output, plain_math, restrict_links
from app.coach_service import CoachService
from app.coach_tools import WorkspaceTools
from app.settings import AiSettings
from app.web_reader import (
    WebReadError,
    extract_urls,
    html_to_text,
    normalize_public_url,
    read_public_page,
)

LEARNER_ID = UUID("00000000-0000-4000-8000-000000000001")
CONVERSATION_ID = UUID("00000000-0000-4000-8000-000000000002")


def settings(**updates: Any) -> AiSettings:
    values: dict[str, Any] = {
        "_env_file": None,
        "internal_service_token": "internal-test-token",
        "llm_api_key": "test-key",
        "coach_web_grounding_enabled": False,
        "coach_knowledge_rag_enabled": False,
    }
    values.update(updates)
    return AiSettings(**values)


@pytest.mark.parametrize(
    "url",
    [
        "https://localhost/admin",
        "https://127.0.0.1/",
        "https://10.0.0.5/",
        "https://169.254.169.254/latest/meta-data",
        "https://[::1]/",
        "https://user:pass@example.com/",
        "https://printer.local/",
        "https://2130706433/",
        "ftp://example.com/file",
        "javascript:alert(1)",
    ],
)
def test_private_or_unsafe_links_are_never_fetched(url: str) -> None:
    assert normalize_public_url(url) is None


def test_public_links_are_normalized_to_https_without_fragments() -> None:
    assert (
        normalize_public_url("http://codeforces.com/blog/entry/1#comment")
        == "https://codeforces.com/blog/entry/1"
    )


def test_urls_are_extracted_from_a_message() -> None:
    assert extract_urls(
        "help me with https://codeforces.com/problemset/problem/2266/G, and "
        "http://example.com/post. Also https://localhost/x"
    ) == [
        "https://codeforces.com/problemset/problem/2266/G",
        "https://example.com/post",
    ]


def test_html_is_reduced_to_readable_text() -> None:
    title, text = html_to_text(
        "<html><head><title> Two Sum </title><style>p{}</style></head>"
        "<body><nav>menu</nav><h1>Problem</h1><p>Given an array.</p>"
        "<script>track()</script><p>Return indices &amp; stop.</p></body></html>"
    )
    assert title == "Two Sum"
    assert "Given an array." in text
    assert "Return indices & stop." in text
    assert "menu" not in text
    assert "track()" not in text


@pytest.mark.asyncio
async def test_a_host_resolving_to_a_private_address_is_refused(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def private(_host: str, _port: int) -> bool:
        return False

    monkeypatch.setattr(web_reader, "_resolves_publicly", private)
    with pytest.raises(WebReadError, match="public website"):
        await read_public_page("https://rebind.example/")


def test_latex_math_becomes_plain_text() -> None:
    assert plain_math(
        "Map bounds (e.g., $O(N \\log N)$ vs $O(N^2)$), a_i with $a_{i} \\le 10^{9}$."
    ) == ("Map bounds (e.g., O(N log N) vs O(N²)), a_i with a_i ≤ 10⁹.")
    assert plain_math("It costs $5 and $10.") == "It costs $5 and $10."
    assert plain_math("`$x$` stays") == "`$x$` stays"
    output = coerce_coach_output({"answer": "Runs in $O(n \\cdot m)$ time."})
    assert output is not None
    assert output.answer == "Runs in O(n · m) time."


def test_safe_public_links_stay_clickable() -> None:
    text = (
        "Read [the editorial](https://codeforces.com/blog/entry/1), then "
        "https://cp-algorithms.com/graph/dfs.html. Not "
        "[this](javascript:alert(1)) or https://127.0.0.1/admin."
    )
    kept = restrict_links(text)
    assert "[the editorial](https://codeforces.com/blog/entry/1)" in kept
    assert "https://cp-algorithms.com/graph/dfs.html" in kept
    assert "javascript:" not in kept
    assert "https://127.0.0.1" not in kept
    # An explicit allowlist still narrows the set when a caller needs it.
    narrowed = restrict_links(text, {"https://codeforces.com/blog/entry/1"})
    assert "https://cp-algorithms.com" not in narrowed


class AuditRepository:
    async def save(self, _audit: Any) -> UUID:
        return CONVERSATION_ID


class CapturingModel:
    def __init__(self) -> None:
        self.request: CoachRequest | None = None

    async def respond(self, request: CoachRequest) -> CoachModelOutput:
        self.request = request
        return CoachModelOutput(
            answer=(
                "Your post at https://example.com/post explains it; see also "
                "https://invented.example/page."
            )
        )


@pytest.mark.asyncio
async def test_pasted_pages_are_read_for_the_turn_and_links_stay_clickable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_read(url: str, *_args: Any, **_kwargs: Any) -> web_reader.WebPage:
        return web_reader.WebPage(url=url, title="A post", text="Page body text.")

    monkeypatch.setattr("app.coach_service.retrieve_public_page", fake_read)
    model = CapturingModel()
    service = CoachService(settings(), model=model, audit_repository=AuditRepository())
    output = await service.respond(
        CoachRequest(
            requestId="links_1",
            learnerId=LEARNER_ID,
            conversationId=CONVERSATION_ID,
            question="Explain this post https://example.com/post",
            context={"recentTurns": []},
        )
    )
    assert model.request is not None
    retrieval = model.request.context["retrieval"]
    assert isinstance(retrieval, dict)
    assert retrieval["linkedPages"] == [
        {
            "url": "https://example.com/post",
            "title": "A post",
            "text": "Page body text.",
        }
    ]
    assert "https://example.com/post" in output.answer
    assert "https://invented.example/page" in output.answer


@pytest.mark.asyncio
async def test_platform_links_opened_by_core_are_not_fetched_again(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fail(_url: str, *_args: Any, **_kwargs: Any) -> web_reader.WebPage:
        raise AssertionError("already opened by the core API")

    monkeypatch.setattr("app.coach_service.retrieve_public_page", fail)
    model = CapturingModel()
    service = CoachService(settings(), model=model, audit_repository=AuditRepository())
    url = "https://codeforces.com/problemset/problem/2266/G"
    await service.respond(
        CoachRequest(
            requestId="links_2",
            learnerId=LEARNER_ID,
            conversationId=CONVERSATION_ID,
            question=f"help me with this question - {url}",
            context={
                "recentTurns": [],
                "pastedUrls": [url],
                "linkedProblems": [
                    {
                        "provider": "codeforces",
                        "externalId": "2266G",
                        "title": "G",
                        "url": url,
                        "statement": "Given n...",
                    }
                ],
            },
        )
    )
    assert model.request is not None
    retrieval = model.request.context["retrieval"]
    assert isinstance(retrieval, dict)
    assert "linkedPages" not in retrieval


@pytest.mark.asyncio
async def test_agent_tools_open_pages_and_problems() -> None:
    calls: list[object] = []

    async def page(url: str) -> dict[str, Any]:
        calls.append(url)
        return {"url": url, "title": "t", "text": "x"}

    async def problem(reference: dict[str, str]) -> dict[str, Any]:
        calls.append(reference)
        return {"title": "P", "statement": "s", "url": "https://cses.fi/x"}

    tools = WorkspaceTools({}, page_reader=page, problem_reader=problem)
    await tools.execute("read_web_page", {"url": "https://example.com/a"})
    await tools.execute(
        "open_problem", {"provider": "codeforces", "externalId": "2266G"}
    )
    missing = await tools.execute("open_problem", {})
    assert calls == [
        "https://example.com/a",
        {"provider": "codeforces", "externalId": "2266G"},
    ]
    assert "error" in missing
