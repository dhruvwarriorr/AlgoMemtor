from typing import Any
from uuid import uuid4

import pytest
from app.main import app
from app.mentor_models import (
    ContestNarrativeOutput,
    ProblemHelpRequest,
    SolutionModelOutput,
    SolutionRequest,
)
from app.mentor_prompts import phase_instructions
from app.mentor_service import (
    UNREADABLE_PROBLEM_ANSWER,
    MentorGenerationError,
    MentorService,
    coerce_to_schema,
    disclosure_violation,
    get_mentor_service,
    keep_teaching_links,
    split_category,
)
from app.settings import AiSettings, get_ai_settings
from app.web_grounding import PublicCitation, PublicResearch
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
    model = ScriptedModel()
    service = MentorService(settings(), model)
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


@pytest.mark.asyncio
async def test_solutions_merge_official_and_grounded_sources() -> None:
    async def ground(*args: Any, **kwargs: Any) -> PublicResearch:
        assert "editorial" in kwargs["instruction"]
        return PublicResearch(
            summary="found",
            citations=[
                PublicCitation(
                    id="web-1",
                    title="Codeforces Round Editorial",
                    url="https://codeforces.com/blog/entry/1",
                    publisher="codeforces.com",
                )
            ],
            searched=True,
        )

    output = SolutionModelOutput.model_validate(
        {
            "summary": "Minimize cost.",
            "approaches": [
                {
                    "kind": "brute_force",
                    "name": "Try all",
                    "idea": "Enumerate.",
                    "keyInsight": "Correct but slow.",
                    "whyItWorks": "Checks everything.",
                    "timeComplexity": "O(2^n)",
                    "spaceComplexity": "O(n)",
                },
                {
                    "kind": "optimized",
                    "name": "Greedy",
                    "idea": "Sort then pick.",
                    "keyInsight": "Exchange argument.",
                    "whyItWorks": "Swapping never helps.",
                    "timeComplexity": "O(n log n)",
                    "spaceComplexity": "O(n)",
                    "code": "```cpp\nint main(){}\n```",
                },
            ],
            "comparison": "Greedy wins.",
            "thinkingLessons": ["Look for exchange arguments."],
            "communityHighlights": [
                {"sourceId": "s2", "highlight": "Explains the exchange argument."},
                {"sourceId": "s9", "highlight": "Unknown source is ignored."},
            ],
        }
    )
    model = ScriptedModel(output)
    service = MentorService(settings(), model, ground=ground)
    request = SolutionRequest.model_validate(
        {
            "requestId": "req",
            "learnerId": str(uuid4()),
            "language": "C++17",
            "problem": {"platform": "codeforces", "title": "Towers", "tags": []},
            "learner": {},
            "officialSources": [
                {
                    "id": "s1",
                    "title": "Contest materials",
                    "url": "https://codeforces.com/contest/2266",
                    "publisher": "Codeforces",
                    "kind": "editorial",
                    "official": True,
                }
            ],
        }
    )
    response = await service.solutions(request)
    assert [item.url for item in response.community] == [
        "https://codeforces.com/contest/2266",
        "https://codeforces.com/blog/entry/1",
    ]
    assert response.community[1].highlight == "Explains the exchange argument."
    assert response.community[1].kind == "editorial"
    assert response.approaches[1].code == "int main(){}"


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
