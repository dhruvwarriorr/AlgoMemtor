"""Request and response models for the mentor tools.

The Doubt Helper, Solution Explorer, Contest Analysis and Progress Report run
outside the Coach chat. Express assembles every request from trusted,
owner-scoped data; problem statements, learner code and compiler output are
transient fields that are never stored or logged by this service.
"""

from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

DoubtType = Literal[
    "understand_problem",
    "find_approach",
    "approach_review",
    "compilation_error",
    "no_output",
    "wrong_answer",
    "performance_tle_mle",
    "general",
]
ProblemHelpPhase = Literal[
    "first_turn", "next_hint", "attempt_feedback", "question", "full_solution"
]
BugCategory = Literal[
    "logic_error",
    "edge_case",
    "off_by_one",
    "overflow",
    "wrong_algorithm",
    "time_complexity",
    "memory_usage",
    "compilation",
    "input_output",
    "undefined_behavior",
    "none_found",
]
Platform = Literal["codeforces", "codechef", "leetcode", "cses", "other"]

ShortText = Annotated[str, Field(min_length=1, max_length=400)]
Tag = Annotated[str, Field(min_length=1, max_length=64)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class TopicExposure(StrictModel):
    name: str = Field(min_length=1, max_length=128)
    assessment: str = Field(min_length=1, max_length=40)
    solved: int = Field(ge=0)


class ProviderRating(StrictModel):
    provider: str = Field(min_length=1, max_length=32)
    rating: int = Field(ge=0, le=5_000)


class LearnerSnapshot(StrictModel):
    experience: str | None = Field(default=None, max_length=40)
    goal: str | None = Field(default=None, max_length=60)
    learningPreferences: list[str] = Field(default_factory=list, max_length=8)
    ratings: list[ProviderRating] = Field(default_factory=list, max_length=4)
    topicExposure: list[TopicExposure] = Field(default_factory=list, max_length=12)
    memories: list[Annotated[str, Field(min_length=1, max_length=400)]] = Field(
        default_factory=list, max_length=10
    )


class ProblemExample(StrictModel):
    input: str = Field(max_length=2_000)
    output: str = Field(max_length=2_000)
    explanation: str | None = Field(default=None, max_length=2_000)


class ProblemContext(StrictModel):
    platform: Platform
    title: str = Field(min_length=1, max_length=200)
    url: str | None = Field(default=None, max_length=2_048)
    statement: str | None = Field(default=None, max_length=20_000)
    constraints: list[Annotated[str, Field(max_length=600)]] = Field(
        default_factory=list, max_length=30
    )
    examples: list[ProblemExample] = Field(default_factory=list, max_length=3)
    tags: list[Tag] = Field(default_factory=list, max_length=12)
    rating: int | None = Field(default=None, ge=0, le=5_000)
    # A public page on a site without a provider adapter. The service reads it
    # for this request only, through the SSRF-guarded page reader.
    readUrl: str | None = Field(default=None, max_length=2_048)
    # Where `statement` came from when Express supplies it.
    statementOrigin: Literal["provider", "pasted"] | None = None


class PriorTurn(StrictModel):
    role: Literal["learner", "mentor"]
    kind: str = Field(min_length=1, max_length=16)
    hintLevel: int | None = Field(default=None, ge=1, le=5)
    content: str = Field(min_length=1, max_length=6_000)


class ProblemHelpRequest(StrictModel):
    requestId: str = Field(min_length=1, max_length=160)
    learnerId: UUID
    sessionId: UUID
    phase: ProblemHelpPhase
    hintLevel: int = Field(ge=1, le=5)
    doubtType: DoubtType
    language: str = Field(min_length=1, max_length=64)
    attemptSummary: str = Field(min_length=1, max_length=1_000)
    problem: ProblemContext
    learner: LearnerSnapshot
    priorTurns: list[PriorTurn] = Field(default_factory=list, max_length=12)
    learnerMessage: str | None = Field(default=None, max_length=2_000)
    transientCode: str | None = Field(default=None, max_length=12_000)
    transientError: str | None = Field(default=None, max_length=4_000)


class ProblemHelpResponse(StrictModel):
    answer: str = Field(min_length=1, max_length=32_000)
    bugCategory: BugCategory | None = None
    guardRepaired: bool = False
    problemUnavailable: bool = False


# --- Solution Explorer -----------------------------------------------------

ApproachKind = Literal[
    "brute_force", "better", "optimized", "alternative", "mathematical"
]
CommunityKind = Literal[
    "editorial", "community", "discussion", "submissions", "article", "video"
]
StatementSource = Literal["provider", "page", "pasted", "search"]


class CommunitySource(StrictModel):
    id: str = Field(min_length=1, max_length=32)
    title: str = Field(min_length=1, max_length=200)
    url: str = Field(min_length=1, max_length=2_048)
    publisher: str = Field(min_length=1, max_length=100)
    kind: CommunityKind
    official: bool
    language: str | None = Field(default=None, max_length=64)
    note: str | None = Field(default=None, max_length=600)


class EditorialLookup(StrictModel):
    """Where to find the official editorial link for a contest problem."""

    contestUrl: str = Field(min_length=1, max_length=2_048)
    problemIndex: str = Field(min_length=1, max_length=8)


class SolutionRequest(StrictModel):
    requestId: str = Field(min_length=1, max_length=160)
    learnerId: UUID
    language: str = Field(min_length=1, max_length=64)
    problem: ProblemContext
    learner: LearnerSnapshot
    officialSources: list[CommunitySource] = Field(default_factory=list, max_length=4)
    # Top solutions in the learner's language from the platform's own API.
    platformSolutions: list[CommunitySource] = Field(default_factory=list, max_length=3)
    editorialLookup: EditorialLookup | None = None
    searchCommunity: bool = True


class ProblemExplanationOutput(StrictModel):
    restatement: str = Field(min_length=1, max_length=1_600)
    inputOutput: str = Field(min_length=1, max_length=1_200)
    keyObservations: list[Annotated[str, Field(min_length=1, max_length=400)]] = Field(
        default_factory=list, max_length=5
    )
    exampleWalkthrough: str | None = Field(default=None, max_length=2_000)
    edgeCases: list[Annotated[str, Field(min_length=1, max_length=300)]] = Field(
        default_factory=list, max_length=5
    )


class ApproachOutput(StrictModel):
    kind: ApproachKind
    name: str = Field(min_length=1, max_length=120)
    idea: str = Field(min_length=1, max_length=2_400)
    keyInsight: str = Field(min_length=1, max_length=800)
    steps: list[Annotated[str, Field(min_length=1, max_length=400)]] = Field(
        default_factory=list, max_length=8
    )
    whyItWorks: str = Field(min_length=1, max_length=2_000)
    limitations: str | None = Field(default=None, max_length=1_000)
    timeComplexity: str = Field(min_length=1, max_length=80)
    spaceComplexity: str = Field(min_length=1, max_length=80)
    code: str | None = Field(default=None, max_length=12_000)
    codeExplanation: str | None = Field(default=None, max_length=1_500)


class CommunityHighlight(StrictModel):
    sourceId: str = Field(min_length=1, max_length=32)
    highlight: str = Field(min_length=1, max_length=600)


class SolutionModelOutput(StrictModel):
    """Structured output requested from the model."""

    summary: str = Field(min_length=1, max_length=1_200)
    problemExplanation: ProblemExplanationOutput
    approaches: list[ApproachOutput] = Field(min_length=1, max_length=4)
    comparison: str = Field(min_length=1, max_length=2_400)
    thinkingLessons: list[Annotated[str, Field(min_length=1, max_length=400)]] = Field(
        default_factory=list, max_length=5
    )
    communityHighlights: list[CommunityHighlight] = Field(
        default_factory=list, max_length=8
    )


class ProgramOutput(StrictModel):
    index: int = Field(ge=0, le=3)
    code: str = Field(min_length=1, max_length=12_000)


class CodeRepairOutput(StrictModel):
    """Complete programs for approaches whose first draft had no real code."""

    programs: list[ProgramOutput] = Field(min_length=1, max_length=4)


class MissingApproachOutput(StrictModel):
    """One more approach when the first answer had fewer than three."""

    approach: ApproachOutput


class CommunityOutput(StrictModel):
    title: str = Field(min_length=1, max_length=200)
    url: str = Field(min_length=1, max_length=2_048)
    publisher: str = Field(min_length=1, max_length=100)
    kind: CommunityKind
    official: bool
    language: str | None = Field(default=None, max_length=64)
    highlight: str | None = Field(default=None, max_length=600)


class SolutionResponse(StrictModel):
    summary: str = Field(min_length=1, max_length=1_200)
    problemExplanation: ProblemExplanationOutput | None = None
    statementSource: StatementSource | None = None
    approaches: list[ApproachOutput] = Field(min_length=1, max_length=5)
    comparison: str = Field(min_length=1, max_length=2_400)
    thinkingLessons: list[Annotated[str, Field(min_length=1, max_length=400)]] = Field(
        default_factory=list, max_length=5
    )
    community: list[CommunityOutput] = Field(default_factory=list, max_length=8)


class ChatTurn(StrictModel):
    role: Literal["learner", "mentor"]
    content: str = Field(min_length=1, max_length=6_000)


class SolutionChatRequest(StrictModel):
    """A follow-up question asked on a Solution Explorer page.

    `exploration` is the page the learner is looking at, supplied by Express
    from its cache, so the learner never has to restate the context.
    """

    requestId: str = Field(min_length=1, max_length=160)
    learnerId: UUID
    language: str = Field(min_length=1, max_length=64)
    problem: ProblemContext
    learner: LearnerSnapshot
    exploration: dict[str, object]
    history: list[ChatTurn] = Field(default_factory=list, max_length=12)
    question: str = Field(min_length=1, max_length=2_000)


class SolutionChatResponse(StrictModel):
    answer: str = Field(min_length=1, max_length=16_000)


# --- Upsolve queue ---------------------------------------------------------


class UpsolveCandidate(StrictModel):
    id: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=512)
    provider: str = Field(min_length=1, max_length=32)
    contestName: str = Field(min_length=1, max_length=512)
    daysAgo: int = Field(ge=0)
    position: str | None = Field(default=None, max_length=16)
    rating: int | None = Field(default=None, ge=0, le=5_000)
    tags: list[Tag] = Field(default_factory=list, max_length=12)
    attempted: bool
    wrongAttempts: int = Field(ge=0)
    # 0 and 1 are the first two unsolved problems of their contest.
    frontierRank: int = Field(ge=0, le=10)
    score: int = Field(ge=0, le=100)


class UpsolvePickRequest(StrictModel):
    requestId: str = Field(min_length=1, max_length=160)
    learnerId: UUID
    learner: LearnerSnapshot
    count: int = Field(ge=1, le=5)
    candidates: list[UpsolveCandidate] = Field(min_length=1, max_length=24)
    alreadyQueued: list[Annotated[str, Field(max_length=512)]] = Field(
        default_factory=list, max_length=5
    )


class UpsolvePick(StrictModel):
    id: str = Field(min_length=1, max_length=200)
    reason: str = Field(min_length=1, max_length=240)


class UpsolvePickOutput(StrictModel):
    picks: list[UpsolvePick] = Field(default_factory=list, max_length=5)


# --- Contest analysis -------------------------------------------------------


class ContestProblemInput(StrictModel):
    label: str = Field(min_length=1, max_length=16)
    title: str | None = Field(default=None, max_length=512)
    rating: int | None = Field(default=None, ge=0, le=5_000)
    tags: list[Tag] = Field(default_factory=list, max_length=12)
    attempts: int = Field(ge=0)
    wrongAttempts: int = Field(ge=0)
    solved: bool
    firstSubmitMinute: float | None = Field(default=None, ge=0)
    solvedMinute: float | None = Field(default=None, ge=0)
    minutesSpent: float | None = Field(default=None, ge=0)


class ContestTimelineInput(StrictModel):
    minute: float = Field(ge=0)
    label: str = Field(min_length=1, max_length=16)
    verdict: str = Field(min_length=1, max_length=64)
    accepted: bool


class ContestMetricsInput(StrictModel):
    provider: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=512)
    durationMinutes: int = Field(gt=0)
    rank: int | None = Field(default=None, gt=0)
    ratingChange: float | None = None
    oldRating: float | None = None
    newRating: float | None = None
    problems: list[ContestProblemInput] = Field(default_factory=list, max_length=26)
    timeline: list[ContestTimelineInput] = Field(default_factory=list, max_length=200)
    solvedCount: int = Field(ge=0)
    attemptedCount: int = Field(ge=0)
    submissionCount: int = Field(ge=0)
    wrongSubmissions: int = Field(ge=0)
    problemSwitches: int = Field(ge=0)
    longestGapMinutes: float = Field(ge=0)
    idleTailMinutes: float | None = Field(default=None, ge=0)
    firstAcceptedMinute: float | None = Field(default=None, ge=0)
    rapidWrongResubmits: int = Field(ge=0)
    coverageNotes: list[ShortText] = Field(default_factory=list, max_length=4)


class ContestAnalysisRequest(StrictModel):
    requestId: str = Field(min_length=1, max_length=160)
    learnerId: UUID
    metrics: ContestMetricsInput
    learner: LearnerSnapshot
    recentContests: list[ContestMetricsInput] = Field(
        default_factory=list, max_length=6
    )


class ContestNarrativeOutput(StrictModel):
    headline: str = Field(min_length=1, max_length=240)
    panicSignals: list[ShortText] = Field(default_factory=list, max_length=5)
    timeManagement: str = Field(min_length=1, max_length=1_500)
    weakTopics: list[Annotated[str, Field(min_length=1, max_length=200)]] = Field(
        default_factory=list, max_length=6
    )
    ratingChangeCauses: list[ShortText] = Field(default_factory=list, max_length=5)
    strategy: list[ShortText] = Field(min_length=1, max_length=6)


class ContestPatternsRequest(StrictModel):
    requestId: str = Field(min_length=1, max_length=160)
    learnerId: UUID
    learner: LearnerSnapshot
    aggregate: dict[str, object]
    contests: list[ContestMetricsInput] = Field(min_length=1, max_length=12)


class ContestPatternsOutput(StrictModel):
    headline: str = Field(min_length=1, max_length=240)
    tendencies: list[ShortText] = Field(min_length=1, max_length=6)
    strengths: list[ShortText] = Field(default_factory=list, max_length=4)
    recommendations: list[ShortText] = Field(min_length=1, max_length=6)


# --- Progress report --------------------------------------------------------


class ProgressNarrativeRequest(StrictModel):
    requestId: str = Field(min_length=1, max_length=160)
    learnerId: UUID
    learner: LearnerSnapshot
    report: dict[str, object]


class ProgressNarrativeOutput(StrictModel):
    headline: str = Field(min_length=1, max_length=240)
    summary: str = Field(min_length=1, max_length=1_600)
    wins: list[ShortText] = Field(default_factory=list, max_length=4)
    concerns: list[ShortText] = Field(default_factory=list, max_length=4)
    nextSteps: list[ShortText] = Field(min_length=1, max_length=5)


# --- Test Case Visualizer AI Debugger --------------------------------------
#
# Mirrors `packages/shared-contracts/src/visualizer.ts`. The learner's program
# ran in their browser; Express forwards the code, the input and a digest of
# the recorded execution. They are used for this request only.

VISUALIZER_CODE_LIMIT = 12_000
VISUALIZER_INPUT_LIMIT = 20_000
VISUALIZER_OUTPUT_LIMIT = 4_000
VISUALIZER_MOMENT_LIMIT = 60
VISUALIZER_HISTORY_LIMIT = 10
VISUALIZER_FINDING_LIMIT = 6
VISUALIZER_TEST_LIMIT = 3
VISUALIZER_FOLLOW_UP_LIMIT = 4

VisualizerLanguage = Literal["cpp", "python", "java"]
VisualizerMode = Literal["diagnose", "ask"]
VisualizerVerdict = Literal[
    "bug_found", "error_explained", "looks_correct", "needs_expected_output", "unsure"
]
VisualizerCategory = Literal[
    "logic",
    "off_by_one",
    "overflow",
    "boundary",
    "initialization",
    "wrong_condition",
    "input_output",
    "runtime_error",
    "complexity",
    "other",
]
VisualizerSeverity = Literal["bug", "risk", "note"]
TraceLine = Annotated[int, Field(ge=1, le=100_000)]
TraceStep = Annotated[int, Field(ge=1, le=1_000_000)]


class VerbatimModel(BaseModel):
    """Keeps whitespace: code, input and output are compared and numbered as-is."""

    model_config = ConfigDict(extra="forbid")


class VisualizerTraceMoment(StrictModel):
    step: TraceStep
    line: TraceLine
    event: Literal["line", "call", "return", "error"]
    summary: str = Field(min_length=1, max_length=300)
    variables: str | None = Field(default=None, max_length=600)


class VisualizerTraceError(StrictModel):
    kind: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=120)
    message: str = Field(max_length=600)
    line: TraceLine | None = None
    step: TraceStep | None = None
    details: list[Annotated[str, Field(max_length=300)]] | None = Field(
        default=None, max_length=6
    )


class VisualizerOutputMismatch(VerbatimModel):
    token: int = Field(ge=1)
    expected: str | None = Field(max_length=200)
    actual: str | None = Field(max_length=200)
    step: TraceStep | None = None


class VisualizerTraceWarning(StrictModel):
    step: TraceStep
    line: TraceLine
    message: str = Field(min_length=1, max_length=300)


class VisualizerFocus(StrictModel):
    step: TraceStep
    line: TraceLine
    description: str = Field(min_length=1, max_length=1_500)


class VisualizerTraceDigest(VerbatimModel):
    status: Literal["finished", "error"]
    recordedSteps: int = Field(ge=0)
    totalSteps: int = Field(ge=0)
    truncated: bool
    error: VisualizerTraceError | None = None
    stdout: str = Field(max_length=VISUALIZER_OUTPUT_LIMIT)
    expected: str | None = Field(default=None, max_length=VISUALIZER_OUTPUT_LIMIT)
    mismatch: VisualizerOutputMismatch | None = None
    warnings: list[VisualizerTraceWarning] = Field(max_length=12)
    moments: list[VisualizerTraceMoment] = Field(max_length=VISUALIZER_MOMENT_LIMIT)
    focus: VisualizerFocus | None = None


class VisualizerDebugTurn(StrictModel):
    role: Literal["learner", "mentor"]
    content: str = Field(min_length=1, max_length=6_000)


class VisualizerProblem(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    url: str | None = Field(default=None, max_length=2_048)


class VisualizerDebugRequest(VerbatimModel):
    requestId: str = Field(min_length=1, max_length=160)
    learnerId: UUID
    learner: LearnerSnapshot
    mode: VisualizerMode
    language: VisualizerLanguage
    code: str = Field(min_length=1, max_length=VISUALIZER_CODE_LIMIT)
    input: str = Field(max_length=VISUALIZER_INPUT_LIMIT)
    question: str | None = Field(default=None, min_length=1, max_length=2_000)
    history: list[VisualizerDebugTurn] = Field(
        default_factory=list, max_length=VISUALIZER_HISTORY_LIMIT
    )
    problem: VisualizerProblem | None = None
    digest: VisualizerTraceDigest

    @model_validator(mode="after")
    def _check_text(self) -> VisualizerDebugRequest:
        if not self.code.strip():
            raise ValueError("code must not be blank")
        if self.question is not None:
            self.question = self.question.strip()
            if not self.question:
                raise ValueError("question must not be blank")
        if self.mode == "ask" and self.question is None:
            raise ValueError("ask mode needs a question")
        return self


class VisualizerFix(VerbatimModel):
    code: str = Field(min_length=1, max_length=2_000)
    explanation: str = Field(min_length=1, max_length=600)


class VisualizerFinding(StrictModel):
    title: str = Field(min_length=1, max_length=160)
    line: TraceLine
    endLine: TraceLine | None = None
    step: TraceStep | None = None
    category: VisualizerCategory
    severity: VisualizerSeverity
    explanation: str = Field(min_length=1, max_length=1_200)
    hint: str = Field(min_length=1, max_length=600)
    fix: VisualizerFix | None = None


class VisualizerSuggestedTest(StrictModel):
    input: str = Field(max_length=2_000)
    reason: str = Field(min_length=1, max_length=300)


class VisualizerDebugResponse(StrictModel):
    verdict: VisualizerVerdict
    headline: str = Field(min_length=1, max_length=200)
    summary: str = Field(min_length=1, max_length=2_000)
    findings: list[VisualizerFinding] = Field(
        default_factory=list, max_length=VISUALIZER_FINDING_LIMIT
    )
    answer: str | None = Field(default=None, min_length=1, max_length=6_000)
    suggestedTests: list[VisualizerSuggestedTest] = Field(
        default_factory=list, max_length=VISUALIZER_TEST_LIMIT
    )
    followUps: list[Annotated[str, Field(min_length=1, max_length=160)]] = Field(
        default_factory=list, max_length=VISUALIZER_FOLLOW_UP_LIMIT
    )


class VisualizerModelFinding(StrictModel):
    """A finding as the model writes it; lines and steps are checked afterwards."""

    title: str = Field(min_length=1, max_length=160)
    line: int
    endLine: int | None = None
    step: int | None = None
    category: VisualizerCategory
    severity: VisualizerSeverity
    explanation: str = Field(min_length=1, max_length=1_200)
    hint: str = Field(min_length=1, max_length=600)
    fix: VisualizerFix | None = None


class VisualizerModelOutput(StrictModel):
    verdict: VisualizerVerdict
    headline: str = Field(min_length=1, max_length=200)
    summary: str = Field(min_length=1, max_length=2_000)
    findings: list[VisualizerModelFinding] = Field(
        default_factory=list, max_length=VISUALIZER_FINDING_LIMIT
    )
    answer: str | None = Field(default=None, max_length=6_000)
    suggestedTests: list[VisualizerSuggestedTest] = Field(
        default_factory=list, max_length=VISUALIZER_TEST_LIMIT
    )
    followUps: list[Annotated[str, Field(max_length=160)]] = Field(
        default_factory=list, max_length=VISUALIZER_FOLLOW_UP_LIMIT
    )
