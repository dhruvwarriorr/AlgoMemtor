"""Mentor tools: Doubt Helper turns, solution exploration and analysis reports.

Each public action makes one model call once its context is available (the
Solution Explorer may add one grounded search for community write-ups, and a
Doubt Helper reply that breaks its disclosure limit is repaired once). Problem
statements, learner code, compiler output and page text are used for the
current request only and never stored or logged here.
"""

from __future__ import annotations

import asyncio
import json
import re
from functools import lru_cache
from typing import Any, Protocol, TypeVar
from urllib.parse import urlparse

from langchain_core.language_models.chat_models import BaseChatModel
from pydantic import BaseModel

from .coach_output import plain_math, redact_text
from .coach_service import is_rate_limit_error
from .llm import chat_model
from .mentor_models import (
    ApproachOutput,
    CodeRepairOutput,
    CommunityOutput,
    CommunitySource,
    ContestAnalysisRequest,
    ContestNarrativeOutput,
    ContestPatternsOutput,
    ContestPatternsRequest,
    EditorialLookup,
    MissingApproachOutput,
    ProblemContext,
    ProblemExplanationOutput,
    ProblemHelpRequest,
    ProblemHelpResponse,
    ProgressNarrativeOutput,
    ProgressNarrativeRequest,
    SolutionChatRequest,
    SolutionChatResponse,
    SolutionModelOutput,
    SolutionRequest,
    SolutionResponse,
)
from .mentor_prompts import (
    BUG_CATEGORIES,
    CODE_REPAIR_SYSTEM,
    COMMUNITY_SEARCH_INSTRUCTION,
    CONTEST_ANALYSIS_SYSTEM,
    CONTEST_PATTERNS_SYSTEM,
    DOUBT_HELPER_SYSTEM,
    MISSING_APPROACH_SYSTEM,
    PROGRESS_NARRATIVE_SYSTEM,
    REPAIR_INSTRUCTION,
    SOLUTION_CHAT_SYSTEM,
    SOLUTION_EXPLORER_SYSTEM,
    STATEMENT_SEARCH_INSTRUCTION,
    phase_instructions,
)
from .page_retrieval import retrieve_public_page
from .settings import AiSettings, LlmProvider, get_ai_settings
from .web_grounding import PublicCitation, ground_public_question
from .web_reader import WebPage, WebReadError
from .web_search import search_public_web

StructuredT = TypeVar("StructuredT", bound=BaseModel)

ANSWER_LIMIT = 32_000
PHASE_TOKEN_BUDGETS = {
    "first_turn": 6_144,
    "next_hint": 4_096,
    "attempt_feedback": 4_096,
    "question": 4_096,
    "full_solution": 16_384,
}
SOLUTION_TOKEN_BUDGET = 16_384
CHAT_TOKEN_BUDGET = 6_144
CHAT_ANSWER_LIMIT = 16_000
COMMUNITY_SOLUTION_LIMIT = 3
_APPROACH_ORDER = {
    "brute_force": 0,
    "better": 1,
    "alternative": 1,
    "mathematical": 1,
    "optimized": 2,
}
REPORT_TOKEN_BUDGET = 4_096

# Links a hint may keep clickable: teaching references and the problem sites.
TEACHING_HOSTS = frozenset(
    {
        "cp-algorithms.com",
        "usaco.guide",
        "codeforces.com",
        "leetcode.com",
        "codechef.com",
        "cses.fi",
    }
)

_FENCE = re.compile(r"```[^\n]*\n([\s\S]*?)```")
_ENTRY_POINT = re.compile(
    r"\bint\s+main\s*\(|\bdef\s+main\s*\(|public\s+static\s+void\s+main|"
    r"if\s+__name__\s*==|\bfn\s+main\s*\(|\bfunc\s+main\s*\(",
)
_CATEGORY_LINE = re.compile(
    r"^\s*\**category\**\s*:\s*`?([a-z_]+)`?\s*$", re.IGNORECASE
)
_BUG_CATEGORIES = frozenset(item.strip() for item in BUG_CATEGORIES.split(","))
_MARKDOWN_LINK = re.compile(r"(?<!!)\[([^\]\n]{1,200})\]\(([^)\s]{1,2048})\)")
_BARE_URL = re.compile(r"(?<![(\[<])\bhttps?://[^\s)\]>\"'`]+", re.IGNORECASE)

UNREADABLE_PROBLEM_ANSWER = (
    "## I could not read this problem\n\n"
    "I was not able to load the problem statement from that link, and I do not want "
    "to guess what it asks. Paste the full statement (including constraints and "
    "samples) into the **Problem statement** box and try again.\n\n"
    "## Your turn\n\nPaste the statement, then ask for help again."
)


class MentorNotConfiguredError(RuntimeError):
    pass


class MentorGenerationError(RuntimeError):
    pass


class MentorRateLimitedError(MentorGenerationError):
    pass


class MentorProblemUnavailableError(RuntimeError):
    """The problem statement could not be read, pasted or found."""


class MentorModel(Protocol):
    async def generate_text(self, system: str, human: str, max_tokens: int) -> str: ...

    async def generate_structured(
        self,
        schema: type[StructuredT],
        system: str,
        human: str,
        max_tokens: int,
    ) -> StructuredT: ...


def _message_text(message: object) -> str:
    content = getattr(message, "content", "")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        return "".join(
            block.get("text", "")
            for block in content
            if isinstance(block, dict) and block.get("type") == "text"
        ).strip()
    return ""


class LangchainMentorModel:
    def __init__(
        self,
        settings: AiSettings,
        *,
        model_name: str = "",
        thinking_level: str | None = None,
    ) -> None:
        self.settings = settings
        self.model_name = model_name.strip()
        self.thinking_level = thinking_level or settings.mentor_thinking_level
        self._models: dict[tuple[str, str, int], BaseChatModel] = {}

    @property
    def provider(self) -> LlmProvider:
        configured = self.settings.mentor_llm_provider
        if configured is not None:
            return configured
        return "gemini" if self.settings.llm_api_key else "groq"

    def _model(self, max_tokens: int) -> BaseChatModel:
        provider = self.provider
        model_name = (
            self.model_name
            or self.settings.mentor_model.strip()
            or (
                self.settings.coach_groq_model
                if provider == "groq"
                else self.settings.llm_model
            )
        )
        tokens = min(max_tokens, self.settings.mentor_max_output_tokens)
        key = (provider, model_name, tokens)
        if key not in self._models:
            self._models[key] = chat_model(
                self.settings,
                provider=provider,
                model=model_name,
                temperature=0.3,
                thinking_level=self.thinking_level,  # type: ignore[arg-type]
                max_tokens=tokens,
                timeout=self.settings.mentor_timeout_seconds,
                max_retries=2,
            )
        return self._models[key]

    async def generate_text(self, system: str, human: str, max_tokens: int) -> str:
        result = await self._model(max_tokens).ainvoke(
            [("system", system), ("human", human)]
        )
        return _message_text(result)

    async def generate_structured(
        self,
        schema: type[StructuredT],
        system: str,
        human: str,
        max_tokens: int,
    ) -> StructuredT:
        structured = self._model(max_tokens).with_structured_output(
            schema, method="function_calling", include_raw=True
        )
        result = await structured.ainvoke([("system", system), ("human", human)])
        parsed = result.get("parsed") if isinstance(result, dict) else None
        if isinstance(parsed, schema):
            return parsed
        # Models often overshoot a length limit by a little; clip the raw
        # arguments to the schema's bounds instead of discarding the answer.
        raw = result.get("raw") if isinstance(result, dict) else None
        for call in getattr(raw, "tool_calls", None) or []:
            args = call.get("args") if isinstance(call, dict) else None
            if not isinstance(args, dict):
                continue
            recovered = coerce_to_schema(schema, args)
            if recovered is not None:
                return recovered
        raise MentorGenerationError("The model returned no validated output.")


def _clip_value(value: Any, node: dict[str, Any], defs: dict[str, Any]) -> Any:
    if "$ref" in node:
        node = defs.get(node["$ref"].rsplit("/", 1)[-1], {})
    if "anyOf" in node:
        options = [item for item in node["anyOf"] if item.get("type") != "null"]
        if value is None or not options:
            return value
        node = options[0]
        if "$ref" in node:
            node = defs.get(node["$ref"].rsplit("/", 1)[-1], {})
    if isinstance(value, str):
        limit = node.get("maxLength")
        return value[:limit].rstrip() if isinstance(limit, int) else value
    if isinstance(value, list):
        limit = node.get("maxItems")
        items = value[:limit] if isinstance(limit, int) else value
        item_node = node.get("items", {})
        return [_clip_value(item, item_node, defs) for item in items]
    if isinstance(value, dict):
        properties = node.get("properties", {})
        return {
            key: _clip_value(item, properties[key], defs)
            for key, item in value.items()
            if key in properties
        }
    return value


def coerce_to_schema[ModelT: BaseModel](
    schema: type[ModelT], args: dict[str, Any]
) -> ModelT | None:
    """Validate model arguments after clipping strings and lists to their bounds."""
    json_schema = schema.model_json_schema()
    clipped = _clip_value(args, json_schema, json_schema.get("$defs", {}))
    try:
        return schema.model_validate(clipped)
    except ValueError:
        return None


def split_category(answer: str) -> tuple[str | None, str]:
    """Remove the leading `Category:` line a diagnosis starts with."""
    lines = answer.splitlines()
    for index, line in enumerate(lines[:3]):
        match = _CATEGORY_LINE.match(line)
        if match is None:
            continue
        value = match.group(1).lower()
        rest = "\n".join(lines[:index] + lines[index + 1 :]).strip()
        return (value if value in _BUG_CATEGORIES else None), rest
    return None, answer.strip()


def disclosure_violation(answer: str, phase: str, hint_level: int) -> str | None:
    """Why a pre-solution reply reveals too much, or None when it is within limits."""
    if phase == "full_solution" or hint_level >= 5:
        return None
    limit = 25 if hint_level >= 4 else 8
    for block in _FENCE.findall(answer):
        lines = [line for line in block.splitlines() if line.strip()]
        if _ENTRY_POINT.search(block):
            return "it contains a complete program entry point"
        if len(lines) > limit:
            return f"a code block has {len(lines)} lines; the limit is {limit}"
    prose = _FENCE.sub("", answer)
    if _ENTRY_POINT.search(prose):
        return "it contains a complete program entry point"
    return None


def withhold_excess_code(answer: str, hint_level: int) -> str:
    """Last-resort guard: replace code blocks above the disclosure limit."""
    limit = 25 if hint_level >= 4 else 8

    def replace(match: re.Match[str]) -> str:
        block = match.group(1)
        lines = [line for line in block.splitlines() if line.strip()]
        if _ENTRY_POINT.search(block) or len(lines) > limit:
            return (
                "_Code withheld at this hint level. Ask for the next hint, or reveal "
                "the full walkthrough when you are ready._"
            )
        return match.group(0)

    return _FENCE.sub(replace, answer)


def _host(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower().removeprefix("www.")
    except ValueError:
        return ""


def _link_allowed(url: str, extra: set[str]) -> bool:
    clean = url.rstrip(".,;:!?")
    if not clean.lower().startswith("https://"):
        return False
    return _host(clean) in TEACHING_HOSTS or clean.rstrip("/") in extra


def _clean_links_in_prose(part: str, extra: set[str]) -> str:
    placeholders: list[str] = []

    def hold(match: re.Match[str]) -> str:
        kept = (
            match.group(0) if _link_allowed(match.group(2), extra) else match.group(1)
        )
        placeholders.append(kept)
        return f"\u0000{len(placeholders) - 1}\u0000"

    def bare(match: re.Match[str]) -> str:
        url = match.group(0)
        return url if _link_allowed(url, extra) else (_host(url) or "[link removed]")

    text = _MARKDOWN_LINK.sub(hold, part)
    text = _BARE_URL.sub(bare, text)
    return re.sub("\u0000(\\d+)\u0000", lambda m: placeholders[int(m.group(1))], text)


def keep_teaching_links(answer: str, problem_url: str | None = None) -> str:
    """Keep links to teaching references and the problem; reduce others to text."""
    extra = {problem_url.rstrip("/")} if problem_url else set()
    parts = re.split(r"(```[\s\S]*?```)", answer)
    return "".join(
        part if part.startswith("```") else _clean_links_in_prose(part, extra)
        for part in parts
    )


def _clean_text(value: str, limit: int) -> str:
    text = plain_math(redact_text(value, keep_urls=True))
    return text[:limit].rstrip()


def _clean_item(value: str, limit: int) -> str:
    return " ".join(plain_math(redact_text(value)).split())[:limit].rstrip()


def _clean_list(values: list[str], limit: int) -> list[str]:
    return [item for item in (_clean_item(value, limit) for value in values) if item]


_LIST_MARKER = re.compile(r"^\s*(?:\d{1,2}[.)]|[-*•])\s+")
_INLINE_NUMBERING = re.compile(r"\s+(?=\d{1,2}\.\s+[A-Z])")
_FIELD_DUMP = re.compile(
    r"^\s*(?:restatement|summary|inputOutput|keyObservations|exampleWalkthrough|"
    r"edgeCases|approaches|comparison|thinkingLessons)\s*:",
    re.IGNORECASE,
)


def clean_points(values: list[str], limit: int, max_items: int) -> list[str]:
    """One fact per item: split numbered runs, drop markers and leaked fields."""
    points: list[str] = []
    for value in values:
        for line in value.splitlines():
            if _FIELD_DUMP.match(line):
                break
            for part in _INLINE_NUMBERING.split(line):
                text = _LIST_MARKER.sub("", part).strip()
                if text:
                    points.append(text)
    return _clean_list(points, limit)[:max_items]


def _compact_json(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _community_kind(url: str, title: str) -> str:
    host = _host(url)
    path = urlparse(url).path.lower()
    lowered = f"{title} {path}".lower()
    if "youtube.com" in host or "youtu.be" in host:
        return "video"
    if "editorial" in lowered or "tutorial" in lowered:
        return "editorial"
    if host == "leetcode.com" and "/solutions" in path:
        return "community"
    if host.startswith("discuss.") or "/blog/" in path or "forum" in host:
        return "discussion"
    return "article"


_TUTORIAL_LINK = re.compile(
    r"\[([^\]\n]{0,160}?(?:tutorial|editorial|разбор)[^\]\n]{0,160}?)\]"
    r"\((https://(?:www\.)?codeforces\.com/blog/entry/\d+)[^)]*\)",
    re.IGNORECASE,
)
_STUB_MARKERS = re.compile(
    r"(?://|#)\s*\.\.\.|your code here|\btodo\b|approach structure|"
    r"logic (?:goes )?here|implement(?:ation)? (?:goes )?here|placeholder|"
    r"for demonstration|to make a complete|let'?s (?:keep it simple|implement)|"
    r"(?://|#)\s*actually\b|(?://|#)\s*check if .{0,60}can be",
    re.IGNORECASE,
)
# A loop or branch whose body holds only comments does nothing.
_EMPTY_BODY = re.compile(
    r"\b(?:for|while|if)\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*\{\s*"
    r"(?:(?://[^\n]*|/\*[\s\S]*?\*/)\s*)*\}"
)
_COMMENT_OR_BOILERPLATE = (
    "//",
    "/*",
    "*",
    "#include",
    "import ",
    "from ",
    "using ",
    "package ",
)


def is_stub_code(code: str | None) -> bool:
    """True when a program is missing or is a skeleton instead of real logic."""
    if not code or not code.strip():
        return True
    lines = [line.strip() for line in code.splitlines() if line.strip()]
    logic = [
        line
        for line in lines
        if not line.startswith(_COMMENT_OR_BOILERPLATE)
        and not (line.startswith("#") and not line.startswith("#define"))
        and line not in {"{", "}", "};"}
    ]
    return (
        len(logic) < 6
        or bool(_STUB_MARKERS.search(code))
        or bool(_EMPTY_BODY.search(code))
    )


def _strip_fence(code: str) -> str:
    code = code.strip()
    if code.startswith("```"):
        code = re.sub(r"^```[^\n]*\n|\n?```\s*$", "", code).strip()
    return code


def editorial_link(contest_page: str) -> str | None:
    """The contest page's editorial (tutorial) blog link, English first."""
    links = [(label, url) for label, url in _TUTORIAL_LINK.findall(contest_page) if url]
    if not links:
        return None
    for label, url in links:
        if "(en)" in label.lower() or "english" in label.lower():
            return url
    return links[0][1]


def editorial_excerpt(
    text: str, *, index: str, title: str, contest_id: str, size: int = 7_000
) -> str | None:
    """The part of a multi-problem editorial that covers this problem."""
    lowered = text.lower()
    candidates = [
        f"{contest_id}{index}".lower() if contest_id else "",
        title.lower() if len(title) >= 4 else "",
        f"problem {index}".lower(),
    ]
    positions = [
        position
        for needle in candidates
        if needle and (position := lowered.find(needle)) != -1
    ]
    if not positions:
        return None
    start = min(positions)
    return text[start : start + size].strip() or None


def problem_code(problem: ProblemContext) -> str:
    """A short platform identifier such as 2266D, taken from the problem URL."""
    url = problem.url or problem.readUrl or ""
    match = re.search(r"/(?:problem|contest)/(\d+)/(?:problem/)?([A-Za-z]\d?)\b", url)
    return f"{match.group(1)}{match.group(2).upper()}" if match else ""


def _url_key(url: str) -> str:
    parsed = urlparse(url)
    return f"{(parsed.hostname or '').removeprefix('www.').removeprefix('m.')}{parsed.path.rstrip('/')}"


def rank_community_results(
    citations: list[PublicCitation],
    problem: ProblemContext,
    language: str,
    exclude: set[str],
) -> list[PublicCitation]:
    """Order search hits by how specific they are to this problem and language."""
    excluded = {_url_key(url) for url in exclude}
    code = problem_code(problem).lower()
    title_words = [
        word
        for word in re.findall(r"[a-z0-9]+", problem.title.lower())
        if len(word) > 2
    ]
    lang = language.lower().replace("++", "pp").split()[0] if language else ""
    scored: list[tuple[int, int, PublicCitation]] = []
    for index, citation in enumerate(citations):
        key = _url_key(citation.url)
        if (
            key in excluded
            or "/problemset/problem/" in key
            or key.endswith("/problems")
        ):
            continue
        haystack = f"{citation.title} {citation.url}".lower()
        score = 0
        if code and code in haystack.replace(" ", ""):
            score += 3
        if title_words and sum(word in haystack for word in title_words) >= max(
            1, len(title_words) // 2
        ):
            score += 2
        if lang and lang in haystack.replace("++", "pp"):
            score += 1
        host = _host(citation.url)
        if (
            host
            in {"youtube.com", "m.youtube.com", "youtu.be", "github.com", "medium.com"}
            or "blog" in key
        ):
            score += 1
        if score > 0:
            scored.append((-score, index, citation))
    return [citation for _, _, citation in sorted(scored)]


def _publisher_for(url: str) -> str:
    host = _host(url)
    if host.endswith("codeforces.com"):
        return "Codeforces"
    if host.endswith("leetcode.com"):
        return "LeetCode"
    if host.endswith("codechef.com"):
        return "CodeChef"
    return host or "Web"


class MentorService:
    def __init__(
        self,
        settings: AiSettings,
        model: MentorModel | None = None,
        *,
        ground: Any = ground_public_question,
        read_page: Any = None,
    ) -> None:
        self.settings = settings
        self.model = model
        self.solution_model: MentorModel | None = None
        self.ground = ground
        self.read_page = read_page or self._retrieve
        self.read_links = read_page or self._retrieve_with_links

    async def _retrieve(self, url: str) -> WebPage:
        return await retrieve_public_page(url, self.settings)

    async def _retrieve_with_links(self, url: str) -> WebPage:
        return await retrieve_public_page(url, self.settings, keep_links=True)

    def get_model(self) -> MentorModel:
        if self.model is not None:
            return self.model
        if not (self.settings.llm_api_key or self.settings.groq_api_key):
            raise MentorNotConfiguredError
        self.model = LangchainMentorModel(self.settings)
        return self.model

    async def _call(self, operation: Any) -> Any:
        try:
            return await operation
        except MentorGenerationError, MentorNotConfiguredError:
            raise
        except Exception as error:
            if is_rate_limit_error(error):
                raise MentorRateLimitedError("The model is rate limited.") from error
            raise MentorGenerationError(type(error).__name__) from error

    # --- Doubt Helper -------------------------------------------------------

    async def _statement(self, request: ProblemHelpRequest) -> str | None:
        statement, _ = await self._solution_statement(request.problem)
        return statement

    async def problem_help(self, request: ProblemHelpRequest) -> ProblemHelpResponse:
        model = self.get_model()
        statement = await self._statement(request)
        if statement is None:
            return ProblemHelpResponse(
                answer=UNREADABLE_PROBLEM_ANSWER, problemUnavailable=True
            )
        payload = request.model_dump(
            mode="json",
            exclude={"requestId", "learnerId", "sessionId"},
            exclude_none=True,
        )
        payload["problem"]["statement"] = statement
        payload["problem"].pop("readUrl", None)
        system = (
            f"{DOUBT_HELPER_SYSTEM}\n\nThis turn\n"
            f"{phase_instructions(request.phase, request.doubtType, request.hintLevel)}"
        )
        human = _compact_json(payload)
        budget = PHASE_TOKEN_BUDGETS[request.phase]
        answer = await self._call(model.generate_text(system, human, budget))
        category, answer = split_category(answer)
        repaired = False
        violation = disclosure_violation(answer, request.phase, request.hintLevel)
        if violation is not None:
            repaired = True
            retry = await self._call(
                model.generate_text(
                    system,
                    f"{human}\n\nPrevious reply:\n{answer}\n\n"
                    + REPAIR_INSTRUCTION.format(reason=violation),
                    budget,
                )
            )
            retry_category, retry = split_category(retry)
            category = category or retry_category
            if retry.strip():
                answer = retry
            if disclosure_violation(answer, request.phase, request.hintLevel):
                answer = withhold_excess_code(answer, request.hintLevel)
        answer = keep_teaching_links(
            plain_math(redact_text(answer, keep_urls=True)), request.problem.url
        ).strip()
        if not answer:
            raise MentorGenerationError("The model returned an empty reply.")
        if len(answer) > ANSWER_LIMIT:
            answer = answer[: ANSWER_LIMIT - 1].rstrip() + "…"
        return ProblemHelpResponse(
            answer=answer,
            bugCategory=category,  # type: ignore[arg-type]
            guardRepaired=repaired,
        )

    # --- Solution Explorer --------------------------------------------------

    def get_solution_model(self) -> MentorModel:
        if self.model is not None:
            return self.model
        if self.solution_model is None:
            if not (self.settings.llm_api_key or self.settings.groq_api_key):
                raise MentorNotConfiguredError
            self.solution_model = LangchainMentorModel(
                self.settings,
                model_name=self.settings.solution_model,
                thinking_level=self.settings.solution_thinking_level,
            )
        return self.solution_model

    async def _solution_statement(
        self, problem: ProblemContext, *, allow_search: bool = True
    ) -> tuple[str | None, str | None]:
        """The statement and where it came from: pasted, provider, page or search."""
        if problem.statement:
            return problem.statement, problem.statementOrigin or "provider"
        if problem.readUrl:
            try:
                return (await self.read_page(problem.readUrl)).text, "page"
            except WebReadError:
                pass
        if not allow_search:
            return None, None
        try:
            research = await self.ground(
                self.settings,
                f"{problem.platform} problem {problem.title} statement",
                tuple(problem.tags[:2]),
                instruction=STATEMENT_SEARCH_INSTRUCTION,
            )
        except Exception:  # noqa: BLE001 - search is a last resort
            research = None
        if research is not None and len(research.summary) >= 200:
            return research.summary, "search"
        return None, None

    async def _official_editorial(
        self, lookup: EditorialLookup | None, title: str
    ) -> tuple[CommunitySource | None, str | None]:
        """Follow the contest page to its editorial and pull this problem's part."""
        if lookup is None:
            return None, None
        try:
            contest = await self.read_links(lookup.contestUrl)
        except WebReadError:
            return None, None
        url = editorial_link(contest.text)
        if url is None:
            return None, None
        source = CommunitySource(
            id="editorial",
            title="Official editorial",
            url=url,
            publisher=_publisher_for(url),
            kind="editorial",
            official=True,
        )
        try:
            editorial = await self.read_page(url)
        except WebReadError:
            return source, None
        contest_id = re.search(r"/(\d+)(?:/|$)", lookup.contestUrl)
        excerpt = editorial_excerpt(
            editorial.text,
            index=lookup.problemIndex,
            title=title,
            contest_id=contest_id.group(1) if contest_id else "",
        )
        return source, excerpt

    async def _community_solutions(
        self, request: SolutionRequest, exclude: set[str]
    ) -> tuple[list[CommunitySource], str | None]:
        """Top individual community solutions in the learner's language."""
        if not request.searchCommunity or (
            len(request.platformSolutions) >= COMMUNITY_SOLUTION_LIMIT
        ):
            return [], None
        problem = request.problem
        research = await search_public_web(
            self.settings,
            f"{problem.platform} {problem_code(problem)} {problem.title} "
            f"solution in {request.language}",
            tuple(problem.tags[:2]),
            instruction=COMMUNITY_SEARCH_INSTRUCTION.format(language=request.language),
            ground=self.ground,
        )
        if research is None:
            return [], None
        ranked = rank_community_results(
            research.citations, problem, request.language, exclude
        )
        sources = [
            CommunitySource(
                id=f"c{index + 1}",
                title=citation.title[:200],
                url=citation.url,
                publisher=(citation.publisher or _host(citation.url) or "Web")[:100],
                kind=_community_kind(citation.url, citation.title),  # type: ignore[arg-type]
                official=False,
            )
            for index, citation in enumerate(ranked[:COMMUNITY_SOLUTION_LIMIT])
        ]
        return sources, research.summary or None

    async def _missing_approach(
        self,
        model: MentorModel,
        request: SolutionRequest,
        statement: str | None,
        approaches: list[ApproachOutput],
    ) -> ApproachOutput | None:
        payload = {
            "language": request.language,
            "problem": {
                "title": request.problem.title,
                "platform": request.problem.platform,
                **({"statement": statement} if statement else {}),
            },
            "existingApproaches": [
                {
                    "kind": item.kind,
                    "name": item.name,
                    "idea": item.idea,
                    "timeComplexity": item.timeComplexity,
                }
                for item in approaches
            ],
        }
        try:
            output = await self._call(
                model.generate_structured(
                    MissingApproachOutput,
                    MISSING_APPROACH_SYSTEM,
                    _compact_json(payload),
                    SOLUTION_TOKEN_BUDGET,
                )
            )
        except MentorGenerationError:
            return None
        existing = {item.kind for item in approaches}
        approach = output.approach
        if approach.kind in existing and approach.kind != "alternative":
            approach = approach.model_copy(update={"kind": "alternative"})
        return approach

    async def _repair_code(
        self,
        model: MentorModel,
        request: SolutionRequest,
        statement: str | None,
        approaches: list[ApproachOutput],
        missing: list[int],
    ) -> dict[int, str]:
        payload = {
            "language": request.language,
            "problem": {
                "title": request.problem.title,
                "platform": request.problem.platform,
                **({"statement": statement} if statement else {}),
            },
            "approaches": [
                {
                    "index": index,
                    "name": approaches[index].name,
                    "idea": approaches[index].idea,
                    "steps": approaches[index].steps,
                    "timeComplexity": approaches[index].timeComplexity,
                }
                for index in missing
            ],
        }
        try:
            output = await self._call(
                model.generate_structured(
                    CodeRepairOutput,
                    CODE_REPAIR_SYSTEM,
                    _compact_json(payload),
                    SOLUTION_TOKEN_BUDGET,
                )
            )
        except MentorGenerationError:
            return {}
        return {
            program.index: _strip_fence(program.code)
            for program in output.programs
            if program.index in missing and not is_stub_code(program.code)
        }

    async def solutions(self, request: SolutionRequest) -> SolutionResponse:
        model = self.get_solution_model()
        problem = request.problem
        official = [
            source
            for source in request.officialSources
            if request.editorialLookup is None or source.kind != "editorial"
        ]
        exclude = {
            source.url
            for source in [*request.officialSources, *request.platformSolutions]
        }
        if problem.url:
            exclude.add(problem.url)
        (
            (statement, origin),
            (editorial, excerpt),
            (community, notes),
        ) = await asyncio.gather(
            self._solution_statement(problem),
            self._official_editorial(request.editorialLookup, problem.title),
            self._community_solutions(request, exclude),
        )
        if statement is None:
            raise MentorProblemUnavailableError(
                "The problem statement could not be read from the link or found."
            )
        if editorial is not None:
            official.insert(0, editorial)
        elif request.editorialLookup is not None:
            # The editorial link could not be resolved; the contest page lists
            # it under Contest materials.
            official.insert(
                0,
                CommunitySource(
                    id="editorial",
                    title="Contest materials (editorial link not published yet)",
                    url=request.editorialLookup.contestUrl,
                    publisher=_publisher_for(request.editorialLookup.contestUrl),
                    kind="editorial",
                    official=True,
                ),
            )
        community = [
            *request.platformSolutions,
            *(
                source
                for source in community
                if editorial is None or _url_key(source.url) != _url_key(editorial.url)
            ),
        ][:COMMUNITY_SOLUTION_LIMIT]
        sources = [*official, *community][:8]
        payload = request.model_dump(
            mode="json",
            exclude={
                "requestId",
                "learnerId",
                "officialSources",
                "searchCommunity",
                "editorialLookup",
            },
            exclude_none=True,
        )
        payload["problem"]["statement"] = statement
        payload["problem"].pop("readUrl", None)
        payload["problem"].pop("statementOrigin", None)
        if excerpt:
            payload["editorialExcerpt"] = excerpt
        payload.pop("platformSolutions", None)
        payload["communitySources"] = [
            {"id": source.id, "title": source.title, "publisher": source.publisher}
            for source in sources
        ]
        if notes:
            payload["communityNotes"] = notes[:2_000]
        output = await self._call(
            model.generate_structured(
                SolutionModelOutput,
                SOLUTION_EXPLORER_SYSTEM,
                _compact_json(payload),
                SOLUTION_TOKEN_BUDGET,
            )
        )
        drafts = list(output.approaches[:3])
        if len(drafts) < 3:
            extra = await self._missing_approach(model, request, statement, drafts)
            if extra is not None:
                drafts.append(extra)
        # Brute force first and the optimal solution last, whatever order
        # the model used.
        drafts.sort(key=lambda item: _APPROACH_ORDER[item.kind])
        missing = [
            index for index, item in enumerate(drafts) if is_stub_code(item.code)
        ]
        repaired = (
            await self._repair_code(model, request, statement, drafts, missing)
            if missing
            else {}
        )
        highlights = {
            item.sourceId: _clean_item(item.highlight, 600)
            for item in output.communityHighlights
        }
        approaches = []
        for index, approach in enumerate(drafts):
            code = repaired.get(index) or _strip_fence(approach.code or "")
            approaches.append(
                approach.model_copy(
                    update={
                        "name": _clean_item(approach.name, 120),
                        "idea": _clean_text(approach.idea, 2_400),
                        "keyInsight": _clean_text(approach.keyInsight, 800),
                        "steps": clean_points(approach.steps, 400, 8),
                        "whyItWorks": _clean_text(approach.whyItWorks, 2_000),
                        "limitations": (
                            _clean_text(approach.limitations, 1_000)
                            if approach.limitations
                            else None
                        ),
                        "timeComplexity": _clean_item(approach.timeComplexity, 80),
                        "spaceComplexity": _clean_item(approach.spaceComplexity, 80),
                        "code": None if is_stub_code(code) else code,
                        "codeExplanation": (
                            _clean_text(approach.codeExplanation, 1_500)
                            if approach.codeExplanation
                            else None
                        ),
                    }
                )
            )
        explanation = output.problemExplanation
        community_output = [
            CommunityOutput(
                title=source.title,
                url=source.url,
                publisher=source.publisher,
                kind=source.kind,
                official=source.official,
                language=(
                    None if source.official else (source.language or request.language)
                ),
                highlight=highlights.get(source.id) or source.note or None,
            )
            for source in sources
        ]
        return SolutionResponse(
            summary=_clean_text(output.summary, 1_200),
            problemExplanation=ProblemExplanationOutput(
                restatement=_clean_text(explanation.restatement, 1_600),
                inputOutput=_clean_text(explanation.inputOutput, 1_200),
                keyObservations=clean_points(explanation.keyObservations, 400, 5),
                exampleWalkthrough=(
                    _clean_text(explanation.exampleWalkthrough, 2_000)
                    if explanation.exampleWalkthrough
                    else None
                ),
                edgeCases=clean_points(explanation.edgeCases, 300, 5),
            ),
            statementSource=origin,  # type: ignore[arg-type]
            approaches=approaches,
            comparison=_clean_text(output.comparison, 2_400),
            thinkingLessons=clean_points(output.thinkingLessons, 400, 5),
            community=community_output,
        )

    async def solution_chat(self, request: SolutionChatRequest) -> SolutionChatResponse:
        model = self.get_model()
        statement, _ = await self._solution_statement(
            request.problem, allow_search=False
        )
        payload = request.model_dump(
            mode="json", exclude={"requestId", "learnerId"}, exclude_none=True
        )
        payload["problem"].pop("readUrl", None)
        payload["problem"].pop("statementOrigin", None)
        if statement:
            payload["problem"]["statement"] = statement
        answer = await self._call(
            model.generate_text(
                SOLUTION_CHAT_SYSTEM, _compact_json(payload), CHAT_TOKEN_BUDGET
            )
        )
        answer = keep_teaching_links(
            plain_math(redact_text(answer, keep_urls=True)), request.problem.url
        ).strip()
        if not answer:
            raise MentorGenerationError("The model returned an empty reply.")
        if len(answer) > CHAT_ANSWER_LIMIT:
            answer = answer[: CHAT_ANSWER_LIMIT - 1].rstrip() + "…"
        return SolutionChatResponse(answer=answer)

    # --- Contest analysis and progress reports ------------------------------

    async def contest_analysis(
        self, request: ContestAnalysisRequest
    ) -> ContestNarrativeOutput:
        model = self.get_model()
        payload = request.model_dump(
            mode="json", exclude={"requestId", "learnerId"}, exclude_none=True
        )
        output = await self._call(
            model.generate_structured(
                ContestNarrativeOutput,
                CONTEST_ANALYSIS_SYSTEM,
                _compact_json(payload),
                REPORT_TOKEN_BUDGET,
            )
        )
        return ContestNarrativeOutput(
            headline=_clean_item(output.headline, 240),
            panicSignals=_clean_list(output.panicSignals, 400),
            timeManagement=_clean_item(output.timeManagement, 1_500),
            weakTopics=_clean_list(output.weakTopics, 200),
            ratingChangeCauses=_clean_list(output.ratingChangeCauses, 400),
            strategy=_clean_list(output.strategy, 400) or ["Review this contest."],
        )

    async def contest_patterns(
        self, request: ContestPatternsRequest
    ) -> ContestPatternsOutput:
        model = self.get_model()
        payload = request.model_dump(
            mode="json", exclude={"requestId", "learnerId"}, exclude_none=True
        )
        output = await self._call(
            model.generate_structured(
                ContestPatternsOutput,
                CONTEST_PATTERNS_SYSTEM,
                _compact_json(payload),
                REPORT_TOKEN_BUDGET,
            )
        )
        return ContestPatternsOutput(
            headline=_clean_item(output.headline, 240),
            tendencies=_clean_list(output.tendencies, 400) or ["Not enough evidence."],
            strengths=_clean_list(output.strengths, 400),
            recommendations=_clean_list(output.recommendations, 400)
            or ["Keep taking part in contests to build evidence."],
        )

    async def progress_narrative(
        self, request: ProgressNarrativeRequest
    ) -> ProgressNarrativeOutput:
        model = self.get_model()
        payload = request.model_dump(
            mode="json", exclude={"requestId", "learnerId"}, exclude_none=True
        )
        output = await self._call(
            model.generate_structured(
                ProgressNarrativeOutput,
                PROGRESS_NARRATIVE_SYSTEM,
                _compact_json(payload),
                REPORT_TOKEN_BUDGET,
            )
        )
        return ProgressNarrativeOutput(
            headline=_clean_item(output.headline, 240),
            summary=_clean_item(output.summary, 1_600),
            wins=_clean_list(output.wins, 400),
            concerns=_clean_list(output.concerns, 400),
            nextSteps=_clean_list(output.nextSteps, 400) or ["Keep practicing."],
        )


def get_mentor_service() -> MentorService:
    return _mentor_service()


@lru_cache
def _mentor_service() -> MentorService:
    return MentorService(get_ai_settings())
