import {
  ProblemHelpBugCategorySchema,
  SolutionApproachSchema,
  SolutionProblemExplanationSchema,
  SolutionStatementSourceSchema,
  CommunitySolutionKindSchema,
} from '@algomemtor/shared-contracts'
import { z } from 'zod'

// Internal client for the AI service's mentor tools. Express builds every
// request from owner-scoped data; statements, learner code and compiler
// output are transient request fields that are never stored or logged.

const shortText = z.string().trim().min(1)

export type LearnerSnapshot = {
  experience?: string
  goal?: string
  learningPreferences: string[]
  ratings: { provider: string; rating: number }[]
  topicExposure: { name: string; assessment: string; solved: number }[]
  memories: string[]
}

export type MentorProblemContext = {
  platform: 'codeforces' | 'codechef' | 'leetcode' | 'cses' | 'other'
  title: string
  url?: string
  statement?: string
  tags: string[]
  rating?: number
  readUrl?: string
  statementOrigin?: 'provider' | 'pasted'
}

export type AiProblemHelpRequest = {
  requestId: string
  learnerId: string
  sessionId: string
  phase:
    | 'first_turn'
    | 'next_hint'
    | 'attempt_feedback'
    | 'question'
    | 'full_solution'
  hintLevel: number
  doubtType: string
  language: string
  attemptSummary: string
  problem: MentorProblemContext
  learner: LearnerSnapshot
  priorTurns: {
    role: 'learner' | 'mentor'
    kind: string
    hintLevel?: number
    content: string
  }[]
  learnerMessage?: string
  transientCode?: string
  transientError?: string
}

export const AiProblemHelpResponseSchema = z
  .object({
    answer: shortText.max(32_000),
    bugCategory: ProblemHelpBugCategorySchema.optional(),
    guardRepaired: z.boolean().default(false),
    problemUnavailable: z.boolean().default(false),
  })
  .strict()
export type AiProblemHelpResponse = z.infer<typeof AiProblemHelpResponseSchema>

export type AiCommunitySource = {
  id: string
  title: string
  url: string
  publisher: string
  kind: z.infer<typeof CommunitySolutionKindSchema>
  official: boolean
  language?: string
  note?: string
}

export type AiSolutionRequest = {
  requestId: string
  learnerId: string
  language: string
  problem: MentorProblemContext
  learner: LearnerSnapshot
  officialSources: AiCommunitySource[]
  // Top solutions in the learner's language from the platform's own API.
  platformSolutions?: AiCommunitySource[]
  // For contest problems whose editorial is linked from the contest page.
  editorialLookup?: { contestUrl: string; problemIndex: string }
  searchCommunity: boolean
}

export type AiSolutionChatRequest = {
  requestId: string
  learnerId: string
  language: string
  problem: MentorProblemContext
  learner: LearnerSnapshot
  exploration: Record<string, unknown>
  history: { role: 'learner' | 'mentor'; content: string }[]
  question: string
}

export const AiSolutionChatResponseSchema = z
  .object({ answer: shortText.max(16_000) })
  .strict()
export type AiSolutionChatResponse = z.infer<
  typeof AiSolutionChatResponseSchema
>

export const AiSolutionResponseSchema = z
  .object({
    summary: shortText.max(1_200),
    problemExplanation: SolutionProblemExplanationSchema.optional(),
    statementSource: SolutionStatementSourceSchema.optional(),
    approaches: z
      .array(
        SolutionApproachSchema.extend({
          limitations: shortText.max(1_000).optional(),
          code: shortText.max(12_000).optional(),
          codeExplanation: shortText.max(1_500).optional(),
        }),
      )
      .min(1)
      .max(5),
    comparison: shortText.max(2_400),
    thinkingLessons: z.array(shortText.max(400)).max(5),
    community: z
      .array(
        z
          .object({
            title: shortText.max(200),
            url: z.string().url(),
            publisher: shortText.max(100),
            kind: CommunitySolutionKindSchema,
            official: z.boolean(),
            language: shortText.max(64).optional(),
            highlight: shortText.max(600).optional(),
          })
          .strict(),
      )
      .max(8),
  })
  .strict()
export type AiSolutionResponse = z.infer<typeof AiSolutionResponseSchema>

export type AiUpsolveCandidate = {
  id: string
  title: string
  provider: string
  contestName: string
  daysAgo: number
  position?: string
  rating?: number
  tags: string[]
  attempted: boolean
  wrongAttempts: number
  frontierRank: number
  score: number
}

export const AiUpsolvePickSchema = z
  .object({
    picks: z
      .array(
        z
          .object({ id: shortText.max(200), reason: shortText.max(240) })
          .strict(),
      )
      .max(5),
  })
  .strict()
export type AiUpsolvePick = z.infer<typeof AiUpsolvePickSchema>

export type AiContestMetricsInput = {
  provider: string
  name: string
  durationMinutes: number
  rank?: number
  ratingChange?: number
  oldRating?: number
  newRating?: number
  problems: {
    label: string
    title?: string
    rating?: number
    tags: string[]
    attempts: number
    wrongAttempts: number
    solved: boolean
    firstSubmitMinute?: number
    solvedMinute?: number
    minutesSpent?: number
  }[]
  timeline: {
    minute: number
    label: string
    verdict: string
    accepted: boolean
  }[]
  solvedCount: number
  attemptedCount: number
  submissionCount: number
  wrongSubmissions: number
  problemSwitches: number
  longestGapMinutes: number
  idleTailMinutes?: number
  firstAcceptedMinute?: number
  rapidWrongResubmits: number
  coverageNotes: string[]
}

export const AiContestNarrativeSchema = z
  .object({
    headline: shortText.max(240),
    panicSignals: z.array(shortText.max(400)).max(5),
    timeManagement: shortText.max(1_500),
    weakTopics: z.array(shortText.max(200)).max(6),
    ratingChangeCauses: z.array(shortText.max(400)).max(5),
    strategy: z.array(shortText.max(400)).min(1).max(6),
  })
  .strict()
export type AiContestNarrative = z.infer<typeof AiContestNarrativeSchema>

export const AiContestPatternsSchema = z
  .object({
    headline: shortText.max(240),
    tendencies: z.array(shortText.max(400)).min(1).max(6),
    strengths: z.array(shortText.max(400)).max(4),
    recommendations: z.array(shortText.max(400)).min(1).max(6),
  })
  .strict()
export type AiContestPatterns = z.infer<typeof AiContestPatternsSchema>

export const AiProgressNarrativeSchema = z
  .object({
    headline: shortText.max(240),
    summary: shortText.max(1_600),
    wins: z.array(shortText.max(400)).max(4),
    concerns: z.array(shortText.max(400)).max(4),
    nextSteps: z.array(shortText.max(400)).min(1).max(5),
  })
  .strict()
export type AiProgressNarrative = z.infer<typeof AiProgressNarrativeSchema>

export type AiMentorErrorCode =
  | 'AI_MENTOR_NOT_CONFIGURED'
  | 'AI_MENTOR_UNAVAILABLE'
  | 'AI_MENTOR_RATE_LIMITED'
  | 'AI_MENTOR_TIMEOUT'
  | 'AI_MENTOR_INVALID_RESPONSE'
  | 'AI_MENTOR_CANCELLED'
  | 'AI_MENTOR_PROBLEM_UNREADABLE'

export class AiMentorClientError extends Error {
  constructor(readonly code: AiMentorErrorCode) {
    super('The AI mentor service could not complete this request.')
    this.name = 'AiMentorClientError'
  }
}

export interface AiMentorClient {
  problemHelp(
    input: AiProblemHelpRequest,
    signal?: AbortSignal,
  ): Promise<AiProblemHelpResponse>
  solutions(
    input: AiSolutionRequest,
    signal?: AbortSignal,
  ): Promise<AiSolutionResponse>
  solutionChat(
    input: AiSolutionChatRequest,
    signal?: AbortSignal,
  ): Promise<AiSolutionChatResponse>
  upsolvePick?(
    input: {
      requestId: string
      learnerId: string
      learner: LearnerSnapshot
      count: number
      candidates: AiUpsolveCandidate[]
      alreadyQueued: string[]
    },
    signal?: AbortSignal,
  ): Promise<AiUpsolvePick>
  contestAnalysis(
    input: {
      requestId: string
      learnerId: string
      metrics: AiContestMetricsInput
      learner: LearnerSnapshot
      recentContests: AiContestMetricsInput[]
    },
    signal?: AbortSignal,
  ): Promise<AiContestNarrative>
  contestPatterns(
    input: {
      requestId: string
      learnerId: string
      learner: LearnerSnapshot
      aggregate: Record<string, unknown>
      contests: AiContestMetricsInput[]
    },
    signal?: AbortSignal,
  ): Promise<AiContestPatterns>
  progressNarrative(
    input: {
      requestId: string
      learnerId: string
      learner: LearnerSnapshot
      report: Record<string, unknown>
    },
    signal?: AbortSignal,
  ): Promise<AiProgressNarrative>
}

export class UnavailableAiMentorClient implements AiMentorClient {
  private fail(): never {
    throw new AiMentorClientError('AI_MENTOR_NOT_CONFIGURED')
  }

  async problemHelp(): Promise<AiProblemHelpResponse> {
    return this.fail()
  }

  async solutions(): Promise<AiSolutionResponse> {
    return this.fail()
  }

  async solutionChat(): Promise<AiSolutionChatResponse> {
    return this.fail()
  }

  async contestAnalysis(): Promise<AiContestNarrative> {
    return this.fail()
  }

  async contestPatterns(): Promise<AiContestPatterns> {
    return this.fail()
  }

  async progressNarrative(): Promise<AiProgressNarrative> {
    return this.fail()
  }
}

export class HttpAiMentorClient implements AiMentorClient {
  constructor(
    private readonly options: {
      baseUrl: string
      internalServiceToken: string
      timeoutMs?: number
      fetchImplementation?: typeof fetch
    },
  ) {}

  private async post<T>(
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
    timeoutMs = this.options.timeoutMs ?? 150_000,
  ): Promise<T> {
    const controller = new AbortController()
    const abortFromCaller = () => controller.abort(signal?.reason)
    if (signal?.aborted) {
      controller.abort(signal.reason)
    } else {
      signal?.addEventListener('abort', abortFromCaller, { once: true })
    }
    const timeout = setTimeout(
      () => controller.abort(new Error('The AI mentor request timed out.')),
      timeoutMs,
    )
    try {
      const response = await (this.options.fetchImplementation ?? fetch)(
        new URL(path, this.options.baseUrl),
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-internal-service-token': this.options.internalServiceToken,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      )
      if (response.status === 429) {
        throw new AiMentorClientError('AI_MENTOR_RATE_LIMITED')
      }
      if (response.status === 424) {
        throw new AiMentorClientError('AI_MENTOR_PROBLEM_UNREADABLE')
      }
      if (!response.ok) {
        throw new AiMentorClientError('AI_MENTOR_UNAVAILABLE')
      }
      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        throw new AiMentorClientError('AI_MENTOR_INVALID_RESPONSE')
      }
      const parsed = schema.safeParse(payload)
      if (!parsed.success) {
        throw new AiMentorClientError('AI_MENTOR_INVALID_RESPONSE')
      }
      return parsed.data
    } catch (error) {
      if (error instanceof AiMentorClientError) throw error
      if (controller.signal.aborted) {
        throw new AiMentorClientError(
          signal?.aborted ? 'AI_MENTOR_CANCELLED' : 'AI_MENTOR_TIMEOUT',
        )
      }
      throw new AiMentorClientError('AI_MENTOR_UNAVAILABLE')
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abortFromCaller)
    }
  }

  problemHelp(input: AiProblemHelpRequest, signal?: AbortSignal) {
    return this.post(
      '/internal/mentor/problem-help',
      input,
      AiProblemHelpResponseSchema,
      signal,
    )
  }

  solutions(input: AiSolutionRequest, signal?: AbortSignal) {
    // Reading the statement and editorial, searching community solutions,
    // three complete programs and an occasional code repair take a while.
    return this.post(
      '/internal/mentor/solutions',
      input,
      AiSolutionResponseSchema,
      signal,
      Math.max(this.options.timeoutMs ?? 0, 280_000),
    )
  }

  solutionChat(input: AiSolutionChatRequest, signal?: AbortSignal) {
    return this.post(
      '/internal/mentor/solution-chat',
      input,
      AiSolutionChatResponseSchema,
      signal,
    )
  }

  upsolvePick(
    input: Parameters<NonNullable<AiMentorClient['upsolvePick']>>[0],
    signal?: AbortSignal,
  ) {
    // The page waits for this; a slow pick falls back to the score order.
    return this.post(
      '/internal/mentor/upsolve-pick',
      input,
      AiUpsolvePickSchema,
      signal,
      25_000,
    )
  }

  contestAnalysis(
    input: Parameters<AiMentorClient['contestAnalysis']>[0],
    signal?: AbortSignal,
  ) {
    return this.post(
      '/internal/mentor/contest-analysis',
      input,
      AiContestNarrativeSchema,
      signal,
    )
  }

  contestPatterns(
    input: Parameters<AiMentorClient['contestPatterns']>[0],
    signal?: AbortSignal,
  ) {
    return this.post(
      '/internal/mentor/contest-patterns',
      input,
      AiContestPatternsSchema,
      signal,
    )
  }

  progressNarrative(
    input: Parameters<AiMentorClient['progressNarrative']>[0],
    signal?: AbortSignal,
  ) {
    return this.post(
      '/internal/mentor/progress-narrative',
      input,
      AiProgressNarrativeSchema,
      signal,
    )
  }
}
