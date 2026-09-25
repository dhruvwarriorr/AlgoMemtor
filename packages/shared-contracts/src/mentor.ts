import { z } from 'zod'

import { isSafeCoachPublicUrl, MentorFeatureSchema } from './coach.js'
import { ProviderKeySchema } from './problem-catalog.js'

// Mentor tools that live outside the Coach chat: the Doubt Helper, Solution
// Explorer, Upsolve Tracker, Contest Analysis, Progress Report and revision
// schedule. Learner source code, compiler output and pasted statements cross
// these request boundaries as transient fields and never appear in responses
// or storage.

const identifierSchema = z.uuid()
const nonEmptyStringSchema = z.string().trim().min(1)
const dateSchema = z.iso.datetime()
const publicHttpsUrlSchema = z
  .string()
  .url()
  .refine(isSafeCoachPublicUrl, { message: 'Only public HTTPS URLs are allowed.' })
const topicListSchema = z.array(nonEmptyStringSchema.max(64)).max(12)
const versionSchema = z.number().int().positive()

export const TRANSIENT_CODE_LIMIT = 12_000
export const TRANSIENT_ERROR_LIMIT = 4_000
export const TRANSIENT_STATEMENT_LIMIT = 20_000
export const MENTOR_TEXT_LIMIT = 32_000

const transientCodeSchema = nonEmptyStringSchema.max(TRANSIENT_CODE_LIMIT)
const transientErrorSchema = nonEmptyStringSchema.max(TRANSIENT_ERROR_LIMIT)
const transientStatementSchema = nonEmptyStringSchema.max(
  TRANSIENT_STATEMENT_LIMIT,
)

// ---------------------------------------------------------------------------
// Doubt Helper
// ---------------------------------------------------------------------------

export const ProblemHelpDoubtTypeSchema = z.enum([
  'understand_problem',
  'find_approach',
  'approach_review',
  'compilation_error',
  'no_output',
  'wrong_answer',
  'performance_tle_mle',
  'general',
])
export type ProblemHelpDoubtType = z.infer<typeof ProblemHelpDoubtTypeSchema>

// Doubt types that start with a diagnosis of the learner's code or approach
// rather than a directional nudge.
export const debuggingDoubtTypes: readonly ProblemHelpDoubtType[] = [
  'approach_review',
  'compilation_error',
  'no_output',
  'wrong_answer',
  'performance_tle_mle',
]

// Doubt types whose intake requires the learner's code.
export const codeRequiredDoubtTypes: readonly ProblemHelpDoubtType[] = [
  'compilation_error',
  'no_output',
  'wrong_answer',
  'performance_tle_mle',
]

export const ProblemHelpStageSchema = z.enum([
  'hinting',
  'solution_confirmation',
  'solution_revealed',
  'completed',
  'abandoned',
])
export type ProblemHelpStage = z.infer<typeof ProblemHelpStageSchema>

export const activeProblemHelpStages: readonly ProblemHelpStage[] = [
  'hinting',
  'solution_confirmation',
  'solution_revealed',
]

export const ProblemHelpPlatformSchema = z.enum([
  'codeforces',
  'codechef',
  'leetcode',
  'cses',
  'other',
])
export type ProblemHelpPlatform = z.infer<typeof ProblemHelpPlatformSchema>

export const ProblemHelpBugCategorySchema = z.enum([
  'logic_error',
  'edge_case',
  'off_by_one',
  'overflow',
  'wrong_algorithm',
  'time_complexity',
  'memory_usage',
  'compilation',
  'input_output',
  'undefined_behavior',
  'none_found',
])
export type ProblemHelpBugCategory = z.infer<
  typeof ProblemHelpBugCategorySchema
>

export const ProblemHelpSourceSchema = z.enum(['manual', 'upsolve', 'coach'])
export type ProblemHelpSource = z.infer<typeof ProblemHelpSourceSchema>

// Level 1 nudge, 2 concept, 3 structure, 4 partial code, 5 full walkthrough.
// Level 5 is only reachable through the explicit solution confirmation.
export const PROBLEM_HELP_MAX_HINT_LEVEL = 5
export const PROBLEM_HELP_MAX_GUIDED_LEVEL = 4

export const ProblemHelpProblemSchema = z
  .object({
    platform: ProblemHelpPlatformSchema,
    provider: ProviderKeySchema.optional(),
    externalId: nonEmptyStringSchema.max(128).optional(),
    title: nonEmptyStringSchema.max(200),
    canonicalUrl: publicHttpsUrlSchema.optional(),
    topics: topicListSchema,
    rating: z.number().int().positive().max(5_000).optional(),
  })
  .strict()
export type ProblemHelpProblem = z.infer<typeof ProblemHelpProblemSchema>

export const ProblemHelpTurnKindSchema = z.enum([
  'intake',
  'hint',
  'diagnosis',
  'attempt',
  'feedback',
  'question',
  'answer',
  'solution',
])
export type ProblemHelpTurnKind = z.infer<typeof ProblemHelpTurnKindSchema>

export const ProblemHelpTurnSchema = z
  .object({
    id: identifierSchema,
    role: z.enum(['learner', 'mentor']),
    kind: ProblemHelpTurnKindSchema,
    hintLevel: z
      .number()
      .int()
      .min(1)
      .max(PROBLEM_HELP_MAX_HINT_LEVEL)
      .optional(),
    content: nonEmptyStringSchema.max(MENTOR_TEXT_LIMIT),
    createdAt: dateSchema,
  })
  .strict()
export type ProblemHelpTurn = z.infer<typeof ProblemHelpTurnSchema>

export const ProblemHelpSessionSchema = z
  .object({
    id: identifierSchema,
    problem: ProblemHelpProblemSchema,
    language: nonEmptyStringSchema.max(64),
    doubtType: ProblemHelpDoubtTypeSchema,
    attemptSummary: nonEmptyStringSchema.max(1_000),
    source: ProblemHelpSourceSchema,
    stage: ProblemHelpStageSchema,
    hintLevel: z.number().int().min(0).max(PROBLEM_HELP_MAX_HINT_LEVEL),
    bugCategory: ProblemHelpBugCategorySchema.optional(),
    version: versionSchema,
    createdAt: dateSchema,
    updatedAt: dateSchema,
    solutionRevealedAt: dateSchema.optional(),
    completedAt: dateSchema.optional(),
  })
  .strict()
export type ProblemHelpSession = z.infer<typeof ProblemHelpSessionSchema>

export const ProblemHelpSessionsResponseSchema = z
  .object({ data: z.array(ProblemHelpSessionSchema).max(100) })
  .strict()
export type ProblemHelpSessionsResponse = z.infer<
  typeof ProblemHelpSessionsResponseSchema
>

export const ProblemHelpSessionResponseSchema = z
  .object({
    data: ProblemHelpSessionSchema,
    turns: z.array(ProblemHelpTurnSchema).max(200),
  })
  .strict()
export type ProblemHelpSessionResponse = z.infer<
  typeof ProblemHelpSessionResponseSchema
>

export const StartProblemHelpRequestSchema = z
  .object({
    problemUrl: publicHttpsUrlSchema.optional(),
    problemTitle: nonEmptyStringSchema.max(200).optional(),
    transientStatement: transientStatementSchema.optional(),
    language: nonEmptyStringSchema.max(64),
    doubtType: ProblemHelpDoubtTypeSchema,
    attemptSummary: nonEmptyStringSchema.max(1_000),
    transientCode: transientCodeSchema.optional(),
    transientError: transientErrorSchema.optional(),
    source: ProblemHelpSourceSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.problemUrl !== undefined ||
      (value.problemTitle !== undefined &&
        value.transientStatement !== undefined),
    {
      message:
        'Provide a problem link, or a problem name with the pasted statement.',
      path: ['problemUrl'],
    },
  )
  .refine(
    (value) =>
      !codeRequiredDoubtTypes.includes(value.doubtType) ||
      value.transientCode !== undefined,
    {
      message: 'Paste the code you are debugging for this type of doubt.',
      path: ['transientCode'],
    },
  )
export type StartProblemHelpRequest = z.infer<
  typeof StartProblemHelpRequestSchema
>

const turnBase = { expectedVersion: versionSchema }
const transientTurnContext = {
  transientStatement: transientStatementSchema.optional(),
}

export const ProblemHelpTurnRequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('submit_attempt'),
      ...turnBase,
      ...transientTurnContext,
      content: nonEmptyStringSchema.max(2_000),
      transientCode: transientCodeSchema.optional(),
      transientError: transientErrorSchema.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('ask'),
      ...turnBase,
      ...transientTurnContext,
      content: nonEmptyStringSchema.max(2_000),
      transientCode: transientCodeSchema.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('next_hint'),
      ...turnBase,
      ...transientTurnContext,
    })
    .strict(),
  z.object({ action: z.literal('request_solution'), ...turnBase }).strict(),
  z.object({ action: z.literal('cancel_solution'), ...turnBase }).strict(),
  z
    .object({
      action: z.literal('confirm_solution'),
      ...turnBase,
      ...transientTurnContext,
    })
    .strict(),
  z.object({ action: z.literal('complete'), ...turnBase }).strict(),
  z.object({ action: z.literal('abandon'), ...turnBase }).strict(),
])
export type ProblemHelpTurnRequest = z.infer<
  typeof ProblemHelpTurnRequestSchema
>

// ---------------------------------------------------------------------------
// Solution Explorer
// ---------------------------------------------------------------------------

export const SolutionApproachKindSchema = z.enum([
  'brute_force',
  'better',
  'optimized',
  'alternative',
  'mathematical',
])
export type SolutionApproachKind = z.infer<typeof SolutionApproachKindSchema>

export const SolutionApproachSchema = z
  .object({
    kind: SolutionApproachKindSchema,
    name: nonEmptyStringSchema.max(120),
    idea: nonEmptyStringSchema.max(2_400),
    keyInsight: nonEmptyStringSchema.max(800),
    steps: z.array(nonEmptyStringSchema.max(400)).max(8).optional(),
    whyItWorks: nonEmptyStringSchema.max(2_000),
    limitations: nonEmptyStringSchema.max(1_000).optional(),
    timeComplexity: nonEmptyStringSchema.max(80),
    spaceComplexity: nonEmptyStringSchema.max(80),
    code: nonEmptyStringSchema.max(TRANSIENT_CODE_LIMIT).optional(),
    codeExplanation: nonEmptyStringSchema.max(1_500).optional(),
  })
  .strict()
export type SolutionApproach = z.infer<typeof SolutionApproachSchema>

export const CommunitySolutionKindSchema = z.enum([
  'editorial',
  'community',
  'discussion',
  'submissions',
  'article',
  'video',
])
export type CommunitySolutionKind = z.infer<typeof CommunitySolutionKindSchema>

export const CommunitySolutionSchema = z
  .object({
    title: nonEmptyStringSchema.max(200),
    url: publicHttpsUrlSchema,
    publisher: nonEmptyStringSchema.max(100),
    kind: CommunitySolutionKindSchema,
    official: z.boolean(),
    // The programming language of a community solution found for the
    // learner's selected language.
    language: nonEmptyStringSchema.max(64).optional(),
    highlight: nonEmptyStringSchema.max(600).optional(),
  })
  .strict()
export type CommunitySolution = z.infer<typeof CommunitySolutionSchema>

export const SolutionUnlockReasonSchema = z.enum([
  'solved',
  'attempted',
  'helped',
  'self_reported_attempt',
])
export type SolutionUnlockReason = z.infer<typeof SolutionUnlockReasonSchema>

export const SolutionProblemExplanationSchema = z
  .object({
    restatement: nonEmptyStringSchema.max(1_600),
    inputOutput: nonEmptyStringSchema.max(1_200),
    keyObservations: z.array(nonEmptyStringSchema.max(400)).max(5),
    exampleWalkthrough: nonEmptyStringSchema.max(2_000).optional(),
    edgeCases: z.array(nonEmptyStringSchema.max(300)).max(5),
  })
  .strict()
export type SolutionProblemExplanation = z.infer<
  typeof SolutionProblemExplanationSchema
>

// Where the problem statement behind an exploration came from.
export const SolutionStatementSourceSchema = z.enum([
  'provider',
  'page',
  'pasted',
  'search',
])
export type SolutionStatementSource = z.infer<
  typeof SolutionStatementSourceSchema
>

export const SolutionExplorationSchema = z
  .object({
    problem: ProblemHelpProblemSchema,
    language: nonEmptyStringSchema.max(64),
    unlockedBy: SolutionUnlockReasonSchema,
    summary: nonEmptyStringSchema.max(1_200),
    problemExplanation: SolutionProblemExplanationSchema.optional(),
    statementSource: SolutionStatementSourceSchema.optional(),
    approaches: z.array(SolutionApproachSchema).min(1).max(5),
    comparison: nonEmptyStringSchema.max(2_400),
    thinkingLessons: z.array(nonEmptyStringSchema.max(400)).max(5),
    community: z.array(CommunitySolutionSchema).max(8),
    generatedAt: dateSchema,
  })
  .strict()
export type SolutionExploration = z.infer<typeof SolutionExplorationSchema>

export const ExploreSolutionsRequestSchema = z
  .object({
    problemUrl: publicHttpsUrlSchema.optional(),
    // No link: a problem name with the pasted statement.
    problemTitle: nonEmptyStringSchema.max(200).optional(),
    language: nonEmptyStringSchema.max(64),
    attemptConfirmed: z.boolean().optional(),
    refresh: z.boolean().optional(),
    // Pasted statement, for pages that cannot be read or problems without a
    // link. Transient.
    transientStatement: transientStatementSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.problemUrl !== undefined ||
      (value.problemTitle !== undefined &&
        value.transientStatement !== undefined),
    {
      message:
        'Provide a problem link, or a problem name with the pasted statement.',
      path: ['problemUrl'],
    },
  )
export type ExploreSolutionsRequest = z.infer<
  typeof ExploreSolutionsRequestSchema
>

export const SolutionAccessSchema = z
  .object({
    problem: ProblemHelpProblemSchema,
    learnerStatus: z.enum(['solved', 'attempted', 'unsolved']),
    unlockedBy: SolutionUnlockReasonSchema.optional(),
    cached: z.boolean(),
  })
  .strict()
export type SolutionAccess = z.infer<typeof SolutionAccessSchema>

export const SolutionAccessResponseSchema = z
  .object({ data: SolutionAccessSchema })
  .strict()

export const SolutionExplorationResponseSchema = z
  .object({ data: SolutionExplorationSchema, cached: z.boolean() })
  .strict()
export type SolutionExplorationResponse = z.infer<
  typeof SolutionExplorationResponseSchema
>

export const SolutionExplorationSummarySchema = z
  .object({
    problem: ProblemHelpProblemSchema,
    approachCount: z.number().int().min(1).max(5),
    generatedAt: dateSchema,
  })
  .strict()
export type SolutionExplorationSummary = z.infer<
  typeof SolutionExplorationSummarySchema
>

export const SolutionExplorationsResponseSchema = z
  .object({ data: z.array(SolutionExplorationSummarySchema).max(50) })
  .strict()

// Follow-up questions on a Solution Explorer page. The server supplies the
// explored page as context; the conversation lives in the browser only.
export const SOLUTION_CHAT_HISTORY_LIMIT = 12

export const SolutionChatTurnSchema = z
  .object({
    role: z.enum(['learner', 'mentor']),
    content: nonEmptyStringSchema.max(6_000),
  })
  .strict()
export type SolutionChatTurn = z.infer<typeof SolutionChatTurnSchema>

export const SolutionChatRequestSchema = z
  .object({
    problemUrl: publicHttpsUrlSchema.optional(),
    problemTitle: nonEmptyStringSchema.max(200).optional(),
    language: nonEmptyStringSchema.max(64),
    question: nonEmptyStringSchema.max(2_000),
    history: z
      .array(SolutionChatTurnSchema)
      .max(SOLUTION_CHAT_HISTORY_LIMIT)
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.problemUrl !== undefined || value.problemTitle !== undefined,
    { message: 'Provide the problem link or name.', path: ['problemUrl'] },
  )
export type SolutionChatRequest = z.infer<typeof SolutionChatRequestSchema>

export const SolutionChatResponseSchema = z
  .object({ data: z.object({ answer: nonEmptyStringSchema.max(16_000) }) })
  .strict()
export type SolutionChatResponse = z.infer<typeof SolutionChatResponseSchema>

// ---------------------------------------------------------------------------
// Upsolve Tracker and revision schedule
// ---------------------------------------------------------------------------

export const UpsolveItemSchema = z
  .object({
    id: nonEmptyStringSchema.max(200),
    provider: ProviderKeySchema,
    externalId: nonEmptyStringSchema.max(128),
    title: nonEmptyStringSchema.max(512),
    canonicalUrl: publicHttpsUrlSchema,
    position: nonEmptyStringSchema.max(16).optional(),
    rating: z.number().int().positive().max(5_000).optional(),
    tags: topicListSchema,
    contestOutcome: z.enum(['attempted', 'unattempted']),
    contestWrongAttempts: z.number().int().nonnegative(),
    status: z.enum(['pending', 'upsolved', 'skipped']),
    statusSource: z.enum(['provider', 'manual']).optional(),
    upsolvedAt: dateSchema.optional(),
    priority: z.number().min(0).max(100),
    priorityReason: nonEmptyStringSchema.max(240),
    editorialUrl: publicHttpsUrlSchema.optional(),
    contest: z
      .object({
        provider: ProviderKeySchema,
        contestId: nonEmptyStringSchema.max(128),
        name: nonEmptyStringSchema.max(512),
      })
      .strict(),
  })
  .strict()
export type UpsolveItem = z.infer<typeof UpsolveItemSchema>

export const UpsolveContestSchema = z
  .object({
    provider: ProviderKeySchema,
    contestId: nonEmptyStringSchema.max(128),
    name: nonEmptyStringSchema.max(512),
    canonicalUrl: publicHttpsUrlSchema,
    startsAt: dateSchema.optional(),
    rank: z.number().int().positive().optional(),
    ratingChange: z.number().finite().optional(),
    solvedInContest: z.number().int().nonnegative(),
    coverage: z.enum(['complete', 'partial']),
    coverageNote: nonEmptyStringSchema.max(300).optional(),
    items: z.array(UpsolveItemSchema).max(26),
  })
  .strict()
export type UpsolveContest = z.infer<typeof UpsolveContestSchema>

export const UpsolveSummarySchema = z
  .object({
    flagged: z.number().int().nonnegative(),
    upsolved: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    completionRate: z.number().min(0).max(1).nullable(),
    trend: z
      .array(
        z
          .object({
            month: z.string().regex(/^\d{4}-\d{2}$/),
            flagged: z.number().int().nonnegative(),
            upsolved: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(12),
  })
  .strict()
export type UpsolveSummary = z.infer<typeof UpsolveSummarySchema>

export const UpsolveResponseSchema = z
  .object({
    data: z
      .object({
        queue: z.array(UpsolveItemSchema).max(30),
        contests: z.array(UpsolveContestSchema).max(12),
        summary: UpsolveSummarySchema,
        revisionsDue: z.number().int().nonnegative(),
        linkedProviders: z.array(ProviderKeySchema).max(4),
        generatedAt: dateSchema,
      })
      .strict(),
  })
  .strict()
export type UpsolveResponse = z.infer<typeof UpsolveResponseSchema>

export const UpdateUpsolveItemRequestSchema = z
  .object({ state: z.enum(['skipped', 'pending']) })
  .strict()
export type UpdateUpsolveItemRequest = z.infer<
  typeof UpdateUpsolveItemRequestSchema
>

export const REVISION_INTERVAL_DAYS = [3, 7, 21, 45] as const

export const RevisionItemSchema = z
  .object({
    id: identifierSchema,
    provider: ProviderKeySchema,
    externalId: nonEmptyStringSchema.max(128),
    title: nonEmptyStringSchema.max(512),
    canonicalUrl: publicHttpsUrlSchema,
    topics: topicListSchema,
    source: z.enum(['upsolve', 'doubt_helper']),
    stage: z.number().int().min(0).max(REVISION_INTERVAL_DAYS.length),
    dueAt: dateSchema,
    due: z.boolean(),
    lastReviewedAt: dateSchema.optional(),
    completedAt: dateSchema.optional(),
  })
  .strict()
export type RevisionItem = z.infer<typeof RevisionItemSchema>

export const RevisionsResponseSchema = z
  .object({
    data: z.array(RevisionItemSchema).max(100),
    meta: z
      .object({
        due: z.number().int().nonnegative(),
        upcoming: z.number().int().nonnegative(),
        completed: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()
export type RevisionsResponse = z.infer<typeof RevisionsResponseSchema>

export const ReviewRevisionRequestSchema = z
  .object({ outcome: z.enum(['remembered', 'struggled']) })
  .strict()
export type ReviewRevisionRequest = z.infer<typeof ReviewRevisionRequestSchema>

export const RevisionResponseSchema = z
  .object({ data: RevisionItemSchema })
  .strict()

// ---------------------------------------------------------------------------
// Contest Analysis
// ---------------------------------------------------------------------------

export const ContestProblemBreakdownSchema = z
  .object({
    label: nonEmptyStringSchema.max(16),
    externalId: nonEmptyStringSchema.max(128),
    title: nonEmptyStringSchema.max(512).optional(),
    rating: z.number().int().positive().max(5_000).optional(),
    tags: topicListSchema,
    attempts: z.number().int().nonnegative(),
    wrongAttempts: z.number().int().nonnegative(),
    solved: z.boolean(),
    firstSubmitMinute: z.number().nonnegative().optional(),
    solvedMinute: z.number().nonnegative().optional(),
    minutesSpent: z.number().nonnegative().optional(),
  })
  .strict()
export type ContestProblemBreakdown = z.infer<
  typeof ContestProblemBreakdownSchema
>

export const ContestTimelineEventSchema = z
  .object({
    minute: z.number().nonnegative(),
    label: nonEmptyStringSchema.max(16),
    verdict: nonEmptyStringSchema.max(64),
    accepted: z.boolean(),
  })
  .strict()
export type ContestTimelineEvent = z.infer<typeof ContestTimelineEventSchema>

export const ContestMetricsSchema = z
  .object({
    provider: ProviderKeySchema,
    contestId: nonEmptyStringSchema.max(128),
    name: nonEmptyStringSchema.max(512),
    canonicalUrl: publicHttpsUrlSchema,
    startsAt: dateSchema,
    durationMinutes: z.number().int().positive(),
    rank: z.number().int().positive().optional(),
    ratingChange: z.number().finite().optional(),
    oldRating: z.number().finite().optional(),
    newRating: z.number().finite().optional(),
    problems: z.array(ContestProblemBreakdownSchema).max(26),
    timeline: z.array(ContestTimelineEventSchema).max(200),
    solvedCount: z.number().int().nonnegative(),
    attemptedCount: z.number().int().nonnegative(),
    submissionCount: z.number().int().nonnegative(),
    wrongSubmissions: z.number().int().nonnegative(),
    problemSwitches: z.number().int().nonnegative(),
    longestGapMinutes: z.number().nonnegative(),
    idleTailMinutes: z.number().nonnegative().optional(),
    firstAcceptedMinute: z.number().nonnegative().optional(),
    rapidWrongResubmits: z.number().int().nonnegative(),
    coverage: z.enum(['complete', 'partial']),
    coverageNotes: z.array(nonEmptyStringSchema.max(300)).max(4),
  })
  .strict()
export type ContestMetrics = z.infer<typeof ContestMetricsSchema>

export const ContestNarrativeSchema = z
  .object({
    headline: nonEmptyStringSchema.max(240),
    panicSignals: z.array(nonEmptyStringSchema.max(400)).max(5),
    timeManagement: nonEmptyStringSchema.max(1_500),
    weakTopics: z.array(nonEmptyStringSchema.max(200)).max(6),
    ratingChangeCauses: z.array(nonEmptyStringSchema.max(400)).max(5),
    strategy: z.array(nonEmptyStringSchema.max(400)).min(1).max(6),
    generatedAt: dateSchema,
  })
  .strict()
export type ContestNarrative = z.infer<typeof ContestNarrativeSchema>

export const ContestSummarySchema = z
  .object({
    provider: ProviderKeySchema,
    contestId: nonEmptyStringSchema.max(128),
    name: nonEmptyStringSchema.max(512),
    startsAt: dateSchema.optional(),
    rank: z.number().int().positive().optional(),
    ratingChange: z.number().finite().optional(),
    solvedCount: z.number().int().nonnegative(),
    attemptedCount: z.number().int().nonnegative(),
    analyzable: z.boolean(),
    narrativeAvailable: z.boolean(),
  })
  .strict()
export type ContestSummary = z.infer<typeof ContestSummarySchema>

export const ContestPatternMetricsSchema = z
  .object({
    contestsAnalyzed: z.number().int().nonnegative(),
    averageSolved: z.number().nonnegative().nullable(),
    averageFirstAcceptedMinute: z.number().nonnegative().nullable(),
    averageWrongPerContest: z.number().nonnegative().nullable(),
    ratingDeltaTotal: z.number().finite(),
    ratingDrops: z.number().int().nonnegative(),
    slowStarts: z.number().int().nonnegative(),
    earlyStops: z.number().int().nonnegative(),
    rapidResubmitContests: z.number().int().nonnegative(),
    recurringUnsolvedTopics: z
      .array(
        z
          .object({
            topic: nonEmptyStringSchema.max(64),
            count: z.number().int().positive(),
          })
          .strict(),
      )
      .max(8),
    stuckPositions: z
      .array(
        z
          .object({
            label: nonEmptyStringSchema.max(16),
            count: z.number().int().positive(),
          })
          .strict(),
      )
      .max(8),
  })
  .strict()
export type ContestPatternMetrics = z.infer<typeof ContestPatternMetricsSchema>

export const ContestPatternsReportSchema = z
  .object({
    headline: nonEmptyStringSchema.max(240),
    tendencies: z.array(nonEmptyStringSchema.max(400)).min(1).max(6),
    strengths: z.array(nonEmptyStringSchema.max(400)).max(4),
    recommendations: z.array(nonEmptyStringSchema.max(400)).min(1).max(6),
    generatedAt: dateSchema,
  })
  .strict()
export type ContestPatternsReport = z.infer<typeof ContestPatternsReportSchema>

export const ContestAnalysisOverviewResponseSchema = z
  .object({
    data: z
      .object({
        contests: z.array(ContestSummarySchema).max(30),
        patterns: ContestPatternMetricsSchema,
        patternsReport: ContestPatternsReportSchema.optional(),
      })
      .strict(),
  })
  .strict()
export type ContestAnalysisOverviewResponse = z.infer<
  typeof ContestAnalysisOverviewResponseSchema
>

export const ContestAnalysisResponseSchema = z
  .object({
    data: z
      .object({
        metrics: ContestMetricsSchema,
        narrative: ContestNarrativeSchema.optional(),
      })
      .strict(),
  })
  .strict()
export type ContestAnalysisResponse = z.infer<
  typeof ContestAnalysisResponseSchema
>

export const ContestPatternsReportResponseSchema = z
  .object({ data: ContestPatternsReportSchema })
  .strict()

// ---------------------------------------------------------------------------
// Progress Report
// ---------------------------------------------------------------------------

export const InsightLinkTargetSchema = z.union([
  MentorFeatureSchema,
  z.literal('recommendations'),
])
export type InsightLinkTarget = z.infer<typeof InsightLinkTargetSchema>

export const ProgressInsightSchema = z
  .object({
    id: nonEmptyStringSchema.max(64),
    tone: z.enum(['positive', 'warning', 'neutral']),
    text: nonEmptyStringSchema.max(320),
    link: z
      .object({
        target: InsightLinkTargetSchema,
        label: nonEmptyStringSchema.max(60),
      })
      .strict()
      .optional(),
  })
  .strict()
export type ProgressInsight = z.infer<typeof ProgressInsightSchema>

const weekStartSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const rateSchema = z.number().min(0).max(1).nullable()

export const ProgressReportSchema = z
  .object({
    generatedAt: dateSchema,
    topicProgress: z
      .array(
        z
          .object({
            topic: nonEmptyStringSchema.max(64),
            name: nonEmptyStringSchema.max(128),
            score: z.number().min(0).max(1),
            assessment: nonEmptyStringSchema.max(40),
            solved: z.number().int().nonnegative(),
            recentDays: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(16),
    ratingTrend: z
      .array(
        z
          .object({
            provider: ProviderKeySchema,
            points: z
              .array(
                z
                  .object({
                    date: dateSchema,
                    rating: z.number().finite(),
                  })
                  .strict(),
              )
              .max(60),
            current: z.number().finite().nullable(),
            changePerContest: z.number().finite().nullable(),
            projection90d: z.number().finite().nullable(),
          })
          .strict(),
      )
      .max(4),
    accuracy: z
      .array(
        z
          .object({
            weekStart: weekStartSchema,
            attempted: z.number().int().nonnegative(),
            firstTryAccepted: z.number().int().nonnegative(),
            rate: rateSchema,
          })
          .strict(),
      )
      .max(12),
    consistency: z
      .object({
        activeDaysLast30: z.number().int().min(0).max(30),
        currentStreak: z.number().int().nonnegative(),
        longestStreak: z.number().int().nonnegative(),
        weekly: z
          .array(
            z
              .object({
                weekStart: weekStartSchema,
                activeDays: z.number().int().min(0).max(7),
                solved: z.number().int().nonnegative(),
              })
              .strict(),
          )
          .max(12),
      })
      .strict(),
    solvingSpeed: z
      .array(
        z
          .object({
            band: nonEmptyStringSchema.max(32),
            samples: z.number().int().nonnegative(),
            earlierMedianMinutes: z.number().nonnegative().nullable(),
            recentMedianMinutes: z.number().nonnegative().nullable(),
          })
          .strict(),
      )
      .max(6),
    hintDependency: z
      .object({
        sessions: z.number().int().nonnegative(),
        averageHintLevel: z.number().min(0).max(5).nullable(),
        solutionRevealRate: rateSchema,
        trend: z.enum(['rising', 'falling', 'steady', 'insufficient_data']),
        weekly: z
          .array(
            z
              .object({
                weekStart: weekStartSchema,
                sessions: z.number().int().nonnegative(),
                averageHintLevel: z.number().min(0).max(5).nullable(),
              })
              .strict(),
          )
          .max(12),
      })
      .strict(),
    insights: z.array(ProgressInsightSchema).max(8),
  })
  .strict()
export type ProgressReport = z.infer<typeof ProgressReportSchema>

export const ProgressNarrativeSchema = z
  .object({
    headline: nonEmptyStringSchema.max(240),
    summary: nonEmptyStringSchema.max(1_600),
    wins: z.array(nonEmptyStringSchema.max(400)).max(4),
    concerns: z.array(nonEmptyStringSchema.max(400)).max(4),
    nextSteps: z.array(nonEmptyStringSchema.max(400)).min(1).max(5),
    generatedAt: dateSchema,
  })
  .strict()
export type ProgressNarrative = z.infer<typeof ProgressNarrativeSchema>

export const ProgressReportResponseSchema = z
  .object({
    data: ProgressReportSchema,
    narrative: ProgressNarrativeSchema.optional(),
  })
  .strict()
export type ProgressReportResponse = z.infer<
  typeof ProgressReportResponseSchema
>

export const ProgressNarrativeResponseSchema = z
  .object({ data: ProgressNarrativeSchema })
  .strict()
