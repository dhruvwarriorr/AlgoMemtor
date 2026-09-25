from typing import Any
from uuid import uuid4

import pytest
from app.main import app
from app.mentor_models import (
    ApproachOutput,
    CodeRepairOutput,
    CommunitySource,
    ContestNarrativeOutput,
    MissingApproachOutput,
    ProblemHelpRequest,
    SolutionChatRequest,
    SolutionModelOutput,
    SolutionRequest,
)
from app.mentor_prompts import phase_instructions
from app.mentor_service import (
    UNREADABLE_PROBLEM_ANSWER,
    MentorGenerationError,
    MentorProblemUnavailableError,
    MentorService,
    clean_points,
    coerce_to_schema,
    disclosure_violation,
    editorial_excerpt,
    editorial_link,
    get_mentor_service,
    is_stub_code,
    keep_teaching_links,
    split_category,
)
from app.settings import AiSettings, get_ai_settings
from app.web_grounding import PublicCitation, PublicResearch
from app.web_reader import WebReadError
from fastapi.testclient import TestClient
from pydantic import BaseModel


def settings(**updates: Any) -> AiSettings:
    values = {
        "internal_service_token": "internal-test-token",
        "llm_api_key": "test-key",
        **updates,
    }
    return AiSettings(_env_file=None, **values)


class ScriptedModel:
    """Returns queued replies and records every prompt it received."""

    def __init__(self, *replies: object) -> None:
        self.replies = list(replies)
        self.calls: list[dict[str, Any]] = []

    async def generate_text(self, system: str, human: str, max_tokens: int) -> str:
        self.calls.append({"system": system, "human": human, "max_tokens": max_tokens})
        reply = self.replies.pop(0)
        if isinstance(reply, BaseException):
            raise reply
        assert isinstance(reply, str)
        return reply

    async def generate_structured(
        self, schema: type[BaseModel], system: str, human: str, max_tokens: int
    ) -> BaseModel:
        self.calls.append({"system": system, "human": human, "schema": schema})
        reply = self.replies.pop(0)
        if isinstance(reply, BaseException):
            raise reply
        assert isinstance(reply, schema)
        return reply


def help_request(**updates: Any) -> ProblemHelpRequest:
    values: dict[str, Any] = {
        "requestId": "req-1",
        "learnerId": str(uuid4()),
        "sessionId": str(uuid4()),
        "phase": "first_turn",
        "hintLevel": 1,
        "doubtType": "find_approach",
        "language": "C++17",
        "attemptSummary": "I tried sorting but it is too slow.",
        "problem": {
            "platform": "codeforces",
            "title": "Towers",
            "url": "https://codeforces.com/problemset/problem/2266/G",
            "statement": "Given n towers, find the minimum cost.",
            "tags": ["greedy"],
        },
        "learner": {"experience": "intermediate", "memories": ["Prefers short hints"]},
    }
    values.update(updates)
    return ProblemHelpRequest.model_validate(values)


def test_phase_instructions_follow_the_doubt_and_level() -> None:
    first = phase_instructions("first_turn", "understand_problem", 1)
    assert "Sample Walkthrough" in first
    assert "Do not discuss any approach" in first
    wrong = phase_instructions("first_turn", "wrong_answer", 1)
    assert "Category:" in wrong
    assert "What Your Code Is Doing" in wrong
    hint = phase_instructions("next_hint", "find_approach", 3)
    assert "Hint 3 · Structure" in hint
    full = phase_instructions("full_solution", "find_approach", 5)
    assert "Complete Code" in full


@pytest.mark.asyncio
async def test_first_turn_sends_locked_phase_and_personal_context() -> None:
    model = ScriptedModel("## Problem Understanding\nThink about ordering.")
    service = MentorService(settings(), model)
    response = await service.problem_help(help_request())
    assert response.answer.startswith("## Problem Understanding")
    call = model.calls[0]
    assert "phase` and `hintLevel` are set by AlgoMemtor" in call["system"]
    assert "Brute Force Thought Process" in call["system"]
    assert "Prefers short hints" in call["human"]
    assert "requestId" not in call["human"]
    assert call["max_tokens"] == 6_144


@pytest.mark.asyncio
async def test_debugging_turn_extracts_the_bug_category() -> None:
    model = ScriptedModel("Category: off_by_one\n## Expected Logic\nLoop bound.")
    service = MentorService(settings(), model)
    response = await service.problem_help(
        help_request(doubtType="wrong_answer", transientCode="int x;")
    )
    assert response.bugCategory == "off_by_one"
    assert not response.answer.startswith("Category")


@pytest.mark.asyncio
async def test_hint_that_reveals_a_program_is_repaired_once() -> None:
    program = "```cpp\nint main() {\n  return 0;\n}\n```"
    model = ScriptedModel(f"## Hint 2\n{program}", "## Hint 2 · Concept\nUse a heap.")
    service = MentorService(settings(), model)
    response = await service.problem_help(help_request(phase="next_hint", hintLevel=2))
    assert response.guardRepaired is True
    assert response.answer == "## Hint 2 · Concept\nUse a heap."
    assert len(model.calls) == 2
    assert "complete program entry point" in model.calls[1]["human"]


@pytest.mark.asyncio
async def test_code_is_withheld_when_the_repair_still_overshares() -> None:
    long_block = "```cpp\n" + "\n".join(f"x{i}++;" for i in range(12)) + "\n```"
    model = ScriptedModel(long_block, f"Still: {long_block}")
    service = MentorService(settings(), model)
    response = await service.problem_help(help_request(phase="next_hint", hintLevel=2))
    assert "Code withheld" in response.answer
    assert "x11++" not in response.answer


@pytest.mark.asyncio
async def test_full_solution_allows_complete_code() -> None:
    program = "```cpp\nint main() {\n  return 0;\n}\n```"
    model = ScriptedModel(f"## Complete Code\n{program}")
    service = MentorService(settings(), model)
    response = await service.problem_help(
        help_request(phase="full_solution", hintLevel=5)
    )
    assert "int main()" in response.answer
    assert response.guardRepaired is False
    assert model.calls[0]["max_tokens"] == 16_384


@pytest.mark.asyncio
async def test_missing_statement_asks_for_a_paste_without_a_model_call() -> None:
    async def no_search(*_args: Any, **_kwargs: Any) -> None:
        return None

    model = ScriptedModel()
    service = MentorService(settings(), model, ground=no_search)
    request = help_request(
        problem={"platform": "codeforces", "title": "Towers", "tags": []}
    )
    response = await service.problem_help(request)
    assert response.problemUnavailable is True
    assert response.answer == UNREADABLE_PROBLEM_ANSWER
    assert model.calls == []


@pytest.mark.asyncio
async def test_other_site_pages_are_read_for_the_turn() -> None:
    class Page:
        text = "Statement read from the page."

    async def read_page(url: str) -> Page:
        assert url == "https://example.org/task"
        return Page()

    model = ScriptedModel("## Problem Restatement\nOk.")
    service = MentorService(settings(), model, read_page=read_page)
    await service.problem_help(
        help_request(
            problem={
                "platform": "other",
                "title": "Task",
                "readUrl": "https://example.org/task",
            }
        )
    )
    assert "Statement read from the page." in model.calls[0]["human"]
    assert "readUrl" not in model.calls[0]["human"]


def test_disclosure_violation_limits() -> None:
    small = "```cpp\nif (x) y++;\n```"
    assert disclosure_violation(small, "next_hint", 1) is None
    mid = "```cpp\n" + "\n".join("a;" for _ in range(12)) + "\n```"
    assert disclosure_violation(mid, "next_hint", 3) is not None
    assert disclosure_violation(mid, "next_hint", 4) is None
    assert disclosure_violation("def main():", "question", 2) is not None
    # After the reveal, follow-up answers may include complete programs.
    assert disclosure_violation("int main() {}", "question", 5) is None


def test_links_are_limited_to_teaching_references() -> None:
    text = (
        "[Dijkstra](https://cp-algorithms.com/graph/dijkstra.html) "
        "[spam](https://example.com/x) https://usaco.guide/gold/dp"
    )
    cleaned = keep_teaching_links(text)
    assert "https://cp-algorithms.com/graph/dijkstra.html" in cleaned
    assert "example.com/x" not in cleaned
    assert "https://usaco.guide/gold/dp" in cleaned


def test_split_category_ignores_unknown_values() -> None:
    assert split_category("Category: nonsense\nBody")[0] is None
    assert split_category("No category\nBody") == (None, "No category\nBody")


def test_structured_output_is_clipped_to_schema_bounds() -> None:
    recovered = coerce_to_schema(
        ContestNarrativeOutput,
        {
            "headline": "h" * 400,
            "timeManagement": "ok",
            "strategy": ["s"] * 10,
            "unexpected": True,
        },
    )
    assert recovered is not None
    assert len(recovered.headline) == 240
    assert len(recovered.strategy) == 6


REAL_PROGRAM = """#include <bits/stdc++.h>
using namespace std;
int main() {
    int t;
    cin >> t;
    while (t--) {
        int n;
        cin >> n;
        vector<long long> a(n);
        for (auto &x : a) cin >> x;
        sort(a.begin(), a.end());
        long long best = 0;
        for (int i = 0; i < n; i++) best = max(best, a[i] - i);
        cout << best << "\\n";
    }
}"""


def approach(kind: str, name: str, code: str | None) -> dict[str, Any]:
    return {
        "kind": kind,
        "name": name,
        "idea": f"{name} idea.",
        "keyInsight": "Insight.",
        "steps": ["Read input", "Compute", "Print"],
        "whyItWorks": "Because.",
        "timeComplexity": "O(n log n)",
        "spaceComplexity": "O(n)",
        **({} if code is None else {"code": code}),
    }


def solution_output(codes: list[str | None]) -> SolutionModelOutput:
    return SolutionModelOutput.model_validate(
        {
            "summary": "Sort, then track the best drop.",
            "problemExplanation": {
                "restatement": "Move sections backwards; maximize the result.",
                "inputOutput": "t test cases; n up to 2*10^5.",
                "keyObservations": ["Order after sorting is fixed."],
                "exampleWalkthrough": "Sample 1 gives 3.",
                "edgeCases": ["n = 1"],
            },
            "approaches": [
                approach("brute_force", "Simulate", codes[0]),
                approach("better", "Prefix", codes[1]),
                approach("optimized", "Sort", codes[2]),
            ],
            "comparison": "Sorting wins.",
            "thinkingLessons": ["Sort first."],
            "communityHighlights": [
                {"sourceId": "c1", "highlight": "Clean C++ code."},
                {"sourceId": "zz", "highlight": "Unknown source is ignored."},
            ],
        }
    )


def solution_request(**problem: Any) -> SolutionRequest:
    return SolutionRequest.model_validate(
        {
            "requestId": "req",
            "learnerId": str(uuid4()),
            "language": "C++17",
            "problem": {
                "platform": "codeforces",
                "title": "Falling Concrete",
                "url": "https://codeforces.com/problemset/problem/2266/D",
                "readUrl": "https://codeforces.com/problemset/problem/2266/D",
                "tags": [],
                **problem,
            },
            "learner": {},
            "editorialLookup": {
                "contestUrl": "https://codeforces.com/contest/2266",
                "problemIndex": "D",
            },
        }
    )


class FakePage:
    def __init__(self, url: str, text: str) -> None:
        self.url = url
        self.title = "Page"
        self.text = text


PAGES = {
    "https://codeforces.com/problemset/problem/2266/D": "Vihaan repairs a road of n "
    "sections. Input: t test cases.",
    "https://codeforces.com/contest/2266": "Contest materials "
    "[Announcement](https://codeforces.com/blog/entry/156834) "
    '[Tutorial (en)](https://codeforces.com/blog/entry/156984 "Round 1122")',
    "https://codeforces.com/blog/entry/156984": "2266A Easy. Hint. "
    "2266D Falling Concrete: sort the heights and track a[i] - i.",
}


async def fake_pages(url: str) -> FakePage:
    return FakePage(url, PAGES[url])


@pytest.mark.asyncio
async def test_solutions_resolve_the_editorial_and_top_community_solutions() -> None:
    searches: list[str] = []

    async def ground(*args: Any, **kwargs: Any) -> PublicResearch:
        searches.append(kwargs["instruction"])
        return PublicResearch(
            summary="Blog uses sorting.",
            citations=[
                PublicCitation(id=f"web-{index}", title=title, url=url, publisher="web")
                for index, (title, url) in enumerate(
                    [
                        (
                            "Problem - 2266D",
                            "https://codeforces.com/problemset/problem/2266/D",
                        ),
                        (
                            "Codeforces Round 1122 Editorial",
                            "https://codeforces.com/blog/entry/156984?locale=en",
                        ),
                        (
                            "D. Falling Concrete | Codeforces Round 1122",
                            "https://www.youtube.com/watch?v=abc",
                        ),
                        ("Two Sum in Java", "https://example.com/two-sum"),
                        (
                            "cf solutions",
                            "https://github.com/x/cf/blob/main/2266D.cpp",
                        ),
                        (
                            "Falling Concrete solution in C++",
                            "https://example.com/falling-concrete",
                        ),
                    ],
                    start=1,
                )
            ],
            searched=True,
        )

    stub = "#include <iostream>\nusing namespace std;\nint main() { return 0; }"
    model = ScriptedModel(
        solution_output([stub, REAL_PROGRAM, REAL_PROGRAM]),
        CodeRepairOutput(programs=[{"index": 0, "code": REAL_PROGRAM}]),
    )
    service = MentorService(settings(), model, ground=ground, read_page=fake_pages)
    response = await service.solutions(solution_request())

    assert len(searches) == 1 and "C++17" in searches[0]
    human = model.calls[0]["human"]
    assert "Vihaan repairs a road" in human
    assert "track a[i] - i" in human  # editorial excerpt grounds the answer
    assert "readUrl" not in human
    assert response.statementSource == "page"
    assert response.problemExplanation is not None
    # The problem page, the editorial again and unrelated hits are dropped;
    # the most specific solutions come first.
    assert [item.url for item in response.community] == [
        "https://codeforces.com/blog/entry/156984",
        "https://github.com/x/cf/blob/main/2266D.cpp",
        "https://www.youtube.com/watch?v=abc",
        "https://example.com/falling-concrete",
    ]
    assert response.community[2].kind == "video"
    assert response.community[0].official is True
    assert response.community[1].language == "C++17"
    assert response.community[1].highlight == "Clean C++ code."
    # The skeleton program was replaced by one targeted repair call.
    assert model.calls[1]["schema"] is CodeRepairOutput
    assert all(item.code == REAL_PROGRAM for item in response.approaches)


@pytest.mark.asyncio
async def test_solutions_refuse_to_guess_without_a_statement() -> None:
    async def unreadable(url: str) -> FakePage:
        raise WebReadError("blocked")

    async def no_search(*_args: Any, **_kwargs: Any) -> None:
        return None

    model = ScriptedModel()
    service = MentorService(settings(), model, ground=no_search, read_page=unreadable)
    with pytest.raises(MentorProblemUnavailableError):
        await service.solutions(solution_request())
    assert model.calls == []


@pytest.mark.asyncio
async def test_platform_solutions_fill_the_community_list_without_search() -> None:
    async def no_search(*_args: Any, **_kwargs: Any) -> None:
        raise AssertionError("three platform solutions need no web search")

    model = ScriptedModel(solution_output([REAL_PROGRAM] * 3))
    service = MentorService(settings(), model, ground=no_search, read_page=fake_pages)
    request = solution_request().model_copy(
        update={
            "platformSolutions": [
                CommunitySource(
                    id=f"p{index}",
                    title=f"Accepted C++17 solution {index}",
                    url=f"https://codeforces.com/contest/2266/submission/{index}",
                    publisher="Codeforces",
                    kind="community",
                    official=False,
                    language="C++17 (GCC 7-32)",
                    note="Fast.",
                )
                for index in range(1, 4)
            ]
        }
    )
    response = await service.solutions(request)
    community = [item for item in response.community if not item.official]
    assert len(community) == 3
    assert community[0].language == "C++17 (GCC 7-32)"
    assert community[0].highlight == "Fast."
    assert "platformSolutions" not in model.calls[0]["human"]


@pytest.mark.asyncio
async def test_a_missing_middle_approach_is_written_separately() -> None:
    two = solution_output([REAL_PROGRAM] * 3)
    two = two.model_copy(update={"approaches": [two.approaches[0], two.approaches[2]]})
    middle = ApproachOutput.model_validate(approach("better", "Prefix", REAL_PROGRAM))

    async def no_search(*_args: Any, **_kwargs: Any) -> None:
        return None

    model = ScriptedModel(two, MissingApproachOutput(approach=middle))
    service = MentorService(settings(), model, ground=no_search, read_page=fake_pages)
    response = await service.solutions(solution_request())
    assert [item.kind for item in response.approaches] == [
        "brute_force",
        "better",
        "optimized",
    ]
    assert model.calls[1]["schema"] is MissingApproachOutput


def test_list_items_are_split_and_leaked_fields_dropped() -> None:
    assert clean_points(
        [
            (
                "1. Heights shift by one. 2. Sections keep a[i] - i.\n"
                "restatement: leaked text"
            ),
            "- n = 1",
        ],
        400,
        5,
    ) == ["Heights shift by one.", "Sections keep a[i] - i.", "n = 1"]


def test_stub_detection_and_editorial_parsing() -> None:
    assert is_stub_code(None)
    assert is_stub_code("int main() {\n  // Optimized approach structure\n}")
    assert not is_stub_code(REAL_PROGRAM)
    contest = PAGES["https://codeforces.com/contest/2266"]
    assert editorial_link(contest) == "https://codeforces.com/blog/entry/156984"
    assert editorial_link("no links here") is None
    excerpt = editorial_excerpt(
        PAGES["https://codeforces.com/blog/entry/156984"],
        index="D",
        title="Falling Concrete",
        contest_id="2266",
    )
    assert excerpt is not None and excerpt.startswith("2266D")


@pytest.mark.asyncio
async def test_solution_chat_answers_with_the_page_context() -> None:
    model = ScriptedModel("Because sorting fixes the order.")
    service = MentorService(settings(), model, read_page=fake_pages)
    response = await service.solution_chat(
        SolutionChatRequest.model_validate(
            {
                "requestId": "chat",
                "learnerId": str(uuid4()),
                "language": "C++17",
                "problem": {
                    "platform": "codeforces",
                    "title": "Falling Concrete",
                    "readUrl": "https://codeforces.com/problemset/problem/2266/D",
                },
                "learner": {},
                "exploration": {"summary": "Sort, then track the best drop."},
                "history": [{"role": "learner", "content": "Why sort?"}],
                "question": "Why does sorting work?",
            }
        )
    )
    assert response.answer == "Because sorting fixes the order."
    human = model.calls[0]["human"]
    assert "Sort, then track the best drop." in human
    assert "Vihaan repairs a road" in human


def test_mentor_endpoint_requires_the_internal_token_and_maps_errors() -> None:
    class FailingService:
        async def problem_help(self, request: ProblemHelpRequest) -> None:
            raise MentorGenerationError("boom")

    app.dependency_overrides[get_ai_settings] = lambda: settings()
    app.dependency_overrides[get_mentor_service] = lambda: FailingService()
    try:
        client = TestClient(app)
        body = help_request().model_dump(mode="json")
        denied = client.post("/internal/mentor/problem-help", json=body)
        assert denied.status_code == 401
        failed = client.post(
            "/internal/mentor/problem-help",
            json=body,
            headers={"x-internal-service-token": "internal-test-token"},
        )
        assert failed.status_code == 503
    finally:
        app.dependency_overrides.clear()
