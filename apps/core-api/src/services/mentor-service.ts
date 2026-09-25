import { createHash, randomUUID } from 'node:crypto'

import { z } from 'zod'

import {
  ContestNarrativeSchema,
  ContestPatternsReportSchema,
  PROBLEM_HELP_MAX_GUIDED_LEVEL,
  ProgressNarrativeSchema,
  REVISION_INTERVAL_DAYS,
  SOLUTION_CHAT_HISTORY_LIMIT,
  UPSOLVE_QUEUE_SIZE,
  SolutionExplorationSchema,
  activeProblemHelpStages,
  debuggingDoubtTypes,
  isSafeCoachPublicUrl,
  type ContestAnalysisOverviewResponse,
  type ContestAnalysisResponse,
  type ContestNarrative,
  type ContestPatternsReport,
  type ExploreSolutionsRequest,
  type ImprovementRoadmap,
  type LearnerProfile,
  type ProblemContent,
  type ProblemHelpDoubtType,
  type ProblemHelpProblem,
  type ProblemHelpSession,
  type ProblemHelpSessionResponse,
  type ProblemHelpTurnRequest,
  type ProgressNarrative,
  type ProgressReportResponse,
  type ProviderKey,
  type RevisionItem,
  type RevisionsResponse,
  type SolutionAccess,
  type SolutionChatRequest,
  type SolutionExploration,
  type SolutionUnlockReason,
  type StartProblemHelpRequest,
  type UpsolveItem,
  type UpsolveResponse,
} from '@algomemtor/shared-contracts'

import type {
  AiCommunitySource,
  AiMentorClient,
  AiProblemHelpRequest,
  LearnerSnapshot,
  MentorProblemContext,
} from '../integrations/ai/ai-mentor-client.js'
import { AiMentorClientError } from '../integrations/ai/ai-mentor-client.js'
import type { AiMemoryClient } from '../integrations/ai/ai-memory-client.js'
import type { CommunitySolutionLink } from '../integrations/providers/community-solutions.js'
import {
  codeChefContestCode,
  leetcodeContestSlug,
  type ContestProblemLink,
  type ContestProblemsHint,
} from '../integrations/providers/contest-problems.js'
import {
  problemKeyFor,
  problemRef,
  type CatalogContest,
  type HelpSessionDetail,
  type LearnerActivity,
  type MentorRepository,
  type NewHelpTurn,
  type ProblemMeta,
} from '../repositories/mentor-repository.js'
import type { StructuredLogger } from '../utils/structured-logger.js'
import {
  linkedProblemFromContent,
  providerProblemFromUrl,
} from './coach-links.js'
import {
  buildContestMetrics,
  contestPatterns,
  contestSubmissions,
  matchContest,
  metricsForAi,
  type AnalyzedContest,
} from './contest-analysis.js'
import { buildProgressReport, dayKey } from './progress-report.js'
import {
  buildUpsolve,
  editorialUrl,
  fillQueue,
  initialQueue,
  keptQueue,
  replacementPool,
  type UpsolveCandidate,
} from './upsolve-queue.js'

const DAY_MS = 86_400_000
const ANALYZED_CONTEST_LIMIT = 12
const STATEMENT_LIMIT = 18_000
const PLATFORM_SOLUTIONS_BUDGET_MS = 20_000
const UNREADABLE_TTL_MS = 15 * 60_000
const CONTEST_PROBLEMS_BUDGET_MS = 20_000
const UPSOLVE_POOL_LIMIT = 24

const ratingHint = (rating: number | undefined) =>
  rating === undefined ? {} : { rating }

const UPSOLVE_QUEUE_VERSION = 3

const StoredUpsolveQueueSchema = z
  .object({
    version: z.literal(UPSOLVE_QUEUE_VERSION),
    ids: z.array(z.string().max(200)).max(UPSOLVE_QUEUE_SIZE),
    reasons: z.record(z.string(), z.string().max(240)),
  })
  .strict()

export type MentorErrorCode =
  | 'PROBLEM_HELP_SESSION_NOT_FOUND'
  | 'PROBLEM_HELP_INVALID_STATE'
  | 'PROBLEM_HELP_STALE_VERSION'
  | 'PROBLEM_HELP_SOLUTION_LOCKED'
  | 'PROBLEM_CONTEXT_UNAVAILABLE'
  | 'PROBLEM_UNRESOLVED'
  | 'SOLUTION_LOCKED'
  | 'CONTEST_NOT_FOUND'
  | 'NOT_ENOUGH_CONTEST_DATA'
  | 'REVISION_NOT_FOUND'
  | 'MENTOR_AI_UNAVAILABLE'
  | 'MENTOR_AI_RATE_LIMITED'

const statusByCode: Record<MentorErrorCode, number> = {
  PROBLEM_HELP_SESSION_NOT_FOUND: 404,
  PROBLEM_HELP_INVALID_STATE: 409,
  PROBLEM_HELP_STALE_VERSION: 409,
  PROBLEM_HELP_SOLUTION_LOCKED: 409,
  PROBLEM_CONTEXT_UNAVAILABLE: 422,
  PROBLEM_UNRESOLVED: 422,
  SOLUTION_LOCKED: 409,
  CONTEST_NOT_FOUND: 404,
  NOT_ENOUGH_CONTEST_DATA: 422,
  REVISION_NOT_FOUND: 404,
  MENTOR_AI_UNAVAILABLE: 503,
  MENTOR_AI_RATE_LIMITED: 429,
}

export class MentorError extends Error {
  readonly status: number

  constructor(
    readonly code: MentorErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'MentorError'
    this.status = statusByCode[code]
  }
}

export type MentorServiceOptions = {
  repository: MentorRepository
  aiMentorClient: AiMentorClient
  aiMemoryClient: AiMemoryClient
  learnerProfile: (authUserId: string) => Promise<LearnerProfile | null>
  roadmap: (authUserId: string) => Promise<ImprovementRoadmap | null>
  problemContent: (
    provider: ProviderKey,
    externalId: string,
  ) => Promise<ProblemContent | null>
  communitySolutions?: (
    provider: ProviderKey,
    externalId: string,
    language: string,
  ) => Promise<CommunitySolutionLink[]>
  // Full contest problem lists for platforms without a local catalog of them.
  contestProblems?: (
    provider: ProviderKey,
    contestCode: string,
    hint: ContestProblemsHint,
  ) => Promise<ContestProblemLink[]>
  logger: StructuredLogger
  now?: () => Date
}

type ResolvedProblem = {
  problem: ProblemHelpProblem
  context: MentorProblemContext
  problemKey?: string
}

const doubtLabels: Record<ProblemHelpDoubtType, string> = {
  understand_problem: 'I cannot understand the problem',
  find_approach: 'I do not know how to approach it',
  approach_review: 'Check my approach before I submit',
  compilation_error: 'Compilation error',
  no_output: 'My code produces no output',
  wrong_answer: 'Wrong answer',
  performance_tle_mle: 'Time or memory limit exceeded',
  general: 'General help with this problem',
}

const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

const isoWeekKey = (date: Date) => {
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
  const day = (target.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - day + 3)
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const week =
    1 +
    Math.round(
      ((target.getTime() - firstThursday.getTime()) / DAY_MS -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    )
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

const titleFromUrl = (url: string) => {
  try {
    const parsed = new URL(url)
    const segment = parsed.pathname
      .split('/')
      .filter(Boolean)
      .slice(-2)
      .join(' ')
      .replace(/[-_]+/g, ' ')
      .trim()
    const host = parsed.hostname.replace(/^www\./, '')
    return (segment === '' ? host : `${segment} · ${host}`).slice(0, 200)
  } catch {
    return 'Linked problem'
  }
}

const pastedProblem = (title: string): ResolvedProblem => ({
  problem: { platform: 'other', title: title.slice(0, 200), topics: [] },
  context: { platform: 'other', title: title.slice(0, 200), tags: [] },
})

export class MentorService {
  private readonly unreadableUntil = new Map<string, number>()

  constructor(private readonly options: MentorServiceOptions) {}

  private now() {
    return new Date(this.options.now?.() ?? new Date())
  }

  private aiError(error: unknown): never {
    if (error instanceof AiMentorClientError) {
      this.options.logger.warn('mentor_ai_unavailable', {
        errorCode: error.code,
      })
      if (error.code === 'AI_MENTOR_RATE_LIMITED') {
        throw new MentorError(
          'MENTOR_AI_RATE_LIMITED',
          'The AI mentor is busy right now. Wait a minute and try again.',
        )
      }
      if (error.code === 'AI_MENTOR_PROBLEM_UNREADABLE') {
        throw new MentorError(
          'PROBLEM_CONTEXT_UNAVAILABLE',
          'The problem page could not be read from that link. Paste the statement and try again.',
        )
      }
      throw new MentorError(
        'MENTOR_AI_UNAVAILABLE',
        error.code === 'AI_MENTOR_NOT_CONFIGURED'
          ? 'The AI mentor is not configured for this environment.'
          : 'The AI mentor is temporarily unavailable. Try again shortly.',
      )
    }
    throw error
  }

  // ---------------------------------------------------------------------
  // Shared learner context: what the mentor knows about this learner.
  // ---------------------------------------------------------------------

  private async learnerSnapshot(
    authUserId: string,
    activity?: LearnerActivity,
    focusTopics: readonly string[] = [],
    // What this request is about; memories are then retrieved by vector and
    // keyword similarity to it instead of taking the most confident ones.
    memoryQuery?: string,
  ): Promise<LearnerSnapshot> {
    const memoryClient = this.options.aiMemoryClient
    const [profile, roadmap, memories, loaded] = await Promise.all([
      this.options.learnerProfile(authUserId).catch(() => null),
      this.options.roadmap(authUserId).catch(() => null),
      (memoryQuery !== undefined && memoryClient.retrieveMemories !== undefined
        ? memoryClient
            .retrieveMemories(authUserId, memoryQuery.slice(0, 500), 8)
            .catch(() => memoryClient.listMemories(authUserId))
        : memoryClient.listMemories(authUserId)
      ).catch(() => []),
      activity === undefined
        ? this.options.repository.loadActivity(authUserId)
        : Promise.resolve(activity),
    ])
    const ratings = new Map<string, number>()
    for (const change of loaded.ratingChanges) {
      ratings.set(change.provider, Math.round(change.newRating))
    }
    const focus = new Set(focusTopics)
    const topics = (roadmap?.topics ?? [])
      .filter((topic) => topic.lane !== 'skipped')
      .sort(
        (left, right) =>
          Number(focus.has(right.topic)) - Number(focus.has(left.topic)) ||
          right.evidence.solvedProblems - left.evidence.solvedProblems,
      )
      .slice(0, 12)
    return {
      ...(profile?.experience === undefined
        ? {}
        : { experience: profile.experience }),
      ...(profile?.goal === undefined ? {} : { goal: profile.goal }),
      learningPreferences: (profile?.learningPreferences ?? []).slice(0, 8),
      ratings: [...ratings]
        .filter(([, rating]) => rating >= 0 && rating <= 5_000)
        .map(([provider, rating]) => ({ provider, rating }))
        .slice(0, 4),
      topicExposure: topics.map((topic) => ({
        name: topic.name,
        assessment: topic.assessment,
        solved: topic.evidence.solvedProblems,
      })),
      memories: memories
        .filter((memory) => memory.status === 'active')
        .sort((left, right) =>
          // Retrieved memories arrive ranked by relevance; keep that order.
          memoryQuery === undefined ? right.confidence - left.confidence : 0,
        )
        .slice(0, 8)
        .map((memory) => memory.statement.slice(0, 400)),
    }
  }

  // ---------------------------------------------------------------------
  // Problem resolution: trusted identities from validated links only.
  // ---------------------------------------------------------------------

  private async resolveProblem(input: {
    url?: string
    title?: string
    statement?: string
    // Access checks need the identity and metadata, not the statement.
    withContent?: boolean
  }): Promise<ResolvedProblem> {
    const reference =
      input.url === undefined ? null : providerProblemFromUrl(input.url)
    if (reference !== null) {
      // A LeetCode slug outside the bounded catalog is still a valid
      // question identifier for the adapter.
      const externalId =
        reference.externalId ??
        (reference.leetcodeSlug === undefined
          ? null
          : ((await this.options.repository.findLeetCodeIdBySlug(
              reference.leetcodeSlug,
            )) ?? reference.leetcodeSlug.toLowerCase()))
      if (externalId === null || externalId === undefined) {
        throw new MentorError(
          'PROBLEM_UNRESOLVED',
          'That problem link could not be matched to a known problem. Check the link, or paste the statement instead.',
        )
      }
      return this.resolveProviderProblem(
        reference.provider,
        externalId,
        input.statement,
        input.url,
        input.withContent ?? true,
      )
    }
    if (input.url !== undefined) {
      if (!isSafeCoachPublicUrl(input.url)) {
        throw new MentorError(
          'PROBLEM_UNRESOLVED',
          'Only public https problem links can be used.',
        )
      }
      const title = input.title ?? titleFromUrl(input.url)
      return {
        problem: {
          platform: 'other',
          title,
          canonicalUrl: input.url,
          topics: [],
        },
        context: {
          platform: 'other',
          title,
          url: input.url,
          tags: [],
          ...(input.statement === undefined
            ? { readUrl: input.url }
            : {
                statement: input.statement.slice(0, STATEMENT_LIMIT),
                statementOrigin: 'pasted' as const,
              }),
        },
      }
    }
    if (input.title === undefined || input.statement === undefined) {
      throw new MentorError(
        'PROBLEM_UNRESOLVED',
        'Provide a problem link, or a problem name with the pasted statement.',
      )
    }
    return {
      problem: { platform: 'other', title: input.title, topics: [] },
      context: {
        platform: 'other',
        title: input.title,
        statement: input.statement.slice(0, STATEMENT_LIMIT),
        statementOrigin: 'pasted',
        tags: [],
      },
    }
  }

  private async resolveProviderProblem(
    provider: ProviderKey,
    externalId: string,
    pastedStatement?: string,
    linkedUrl?: string,
    withContent = true,
  ): Promise<ResolvedProblem> {
    const problemKey = problemKeyFor(provider, externalId)
    const ref = problemRef(provider, externalId)
    const skipContent =
      !withContent ||
      pastedStatement !== undefined ||
      (this.unreadableUntil.get(ref) ?? 0) > Date.now()
    const [content, metadata] = await Promise.all([
      skipContent
        ? Promise.resolve(null)
        : this.options
            .problemContent(provider, externalId)
            .catch(() => null)
            .then((result) => {
              // A blocked or missing statement is not retried on every
              // turn; the AI service reads the public page instead.
              if (result === null) {
                this.unreadableUntil.set(ref, Date.now() + UNREADABLE_TTL_MS)
              }
              return result
            }),
      this.options.repository
        .problemMetadata([{ provider, problemKey: externalId }])
        .catch(() => new Map<string, ProblemMeta>()),
    ])
    const meta =
      metadata.get(problemRef(provider, externalId)) ??
      [...metadata.values()][0]
    const title = (content?.title ?? meta?.title ?? externalId).slice(0, 200)
    const canonicalUrl = content?.canonicalUrl ?? meta?.canonicalUrl
    const topics = (
      meta?.topics.length ? meta.topics : (meta?.tags ?? [])
    ).slice(0, 12)
    const providerStatement =
      content === null || content.isPaidOnly
        ? undefined
        : linkedProblemFromContent(content, STATEMENT_LIMIT).statement ||
          undefined
    const statement =
      pastedStatement?.slice(0, STATEMENT_LIMIT) ?? providerStatement
    // When the adapter cannot read the page (for example a bot challenge),
    // the AI service reads the public page itself for this request only.
    const readUrl =
      statement !== undefined
        ? undefined
        : [canonicalUrl, linkedUrl].find(
            (url) => url !== undefined && isSafeCoachPublicUrl(url),
          )
    const key =
      provider === 'leetcode' && canonicalUrl !== undefined
        ? problemKeyFor(provider, externalId, canonicalUrl)
        : problemKey
    return {
      problemKey: key,
      problem: {
        platform: provider,
        provider,
        externalId,
        title,
        ...(canonicalUrl === undefined || !isSafeCoachPublicUrl(canonicalUrl)
          ? {}
          : { canonicalUrl }),
        topics,
        ...(meta?.rating === undefined ? {} : { rating: meta.rating }),
      },
      context: {
        platform: provider,
        title,
        ...(canonicalUrl === undefined ? {} : { url: canonicalUrl }),
        ...(statement === undefined
          ? readUrl === undefined
            ? {}
            : { readUrl }
          : {
              statement,
              statementOrigin:
                pastedStatement === undefined
                  ? ('provider' as const)
                  : ('pasted' as const),
            }),
        tags: topics,
        ...(meta?.rating === undefined ? {} : { rating: meta.rating }),
      },
    }
  }

  private async contextForSession(
    session: ProblemHelpSession,
    transientStatement?: string,
  ): Promise<MentorProblemContext> {
    const { problem } = session
    if (problem.provider !== undefined && problem.externalId !== undefined) {
      return (
        await this.resolveProviderProblem(
          problem.provider,
          problem.externalId,
          transientStatement,
          problem.canonicalUrl,
        )
      ).context
    }
    return {
      platform: 'other',
      title: problem.title,
      ...(problem.canonicalUrl === undefined
        ? {}
        : { url: problem.canonicalUrl }),
      ...(transientStatement !== undefined
        ? {
            statement: transientStatement.slice(0, STATEMENT_LIMIT),
            statementOrigin: 'pasted' as const,
          }
        : problem.canonicalUrl !== undefined
          ? { readUrl: problem.canonicalUrl }
          : {}),
      tags: problem.topics,
    }
  }

  // ---------------------------------------------------------------------
  // Doubt Helper.
  // ---------------------------------------------------------------------

  async listHelpSessions(authUserId: string) {
    return this.options.repository.listHelpSessions(authUserId, 50)
  }

  async getHelpSession(
    authUserId: string,
    id: string,
  ): Promise<ProblemHelpSessionResponse> {
    const detail = await this.options.repository.getHelpSession(authUserId, id)
    if (detail === null) {
      throw new MentorError(
        'PROBLEM_HELP_SESSION_NOT_FOUND',
        'This help session was not found.',
      )
    }
    return { data: detail.session, turns: detail.turns }
  }

  private async askMentor(
    input: Omit<AiProblemHelpRequest, 'requestId' | 'learner'> & {
      authUserId: string
      focusTopics: string[]
    },
  ) {
    const { authUserId, focusTopics, ...request } = input
    const learner = await this.learnerSnapshot(
      authUserId,
      undefined,
      focusTopics,
      [
        request.problem.title,
        doubtLabels[request.doubtType as ProblemHelpDoubtType] ?? '',
        request.learnerMessage ?? request.attemptSummary,
        ...focusTopics,
      ].join(' '),
    )
    let response
    try {
      response = await this.options.aiMentorClient.problemHelp({
        ...request,
        requestId: randomUUID(),
        learner,
      })
    } catch (error) {
      this.aiError(error)
    }
    if (response.problemUnavailable) {
      throw new MentorError(
        'PROBLEM_CONTEXT_UNAVAILABLE',
        'The problem statement could not be read. Paste the full statement and try again.',
      )
    }
    this.options.logger.info('mentor_problem_help_turn', {
      phase: request.phase,
      hintLevel: request.hintLevel,
      guardRepaired: response.guardRepaired,
    })
    return response
  }

  async startHelpSession(
    authUserId: string,
    request: StartProblemHelpRequest,
  ): Promise<ProblemHelpSessionResponse> {
    const resolved = await this.resolveProblem({
      ...(request.problemUrl === undefined ? {} : { url: request.problemUrl }),
      ...(request.problemTitle === undefined
        ? {}
        : { title: request.problemTitle }),
      ...(request.transientStatement === undefined
        ? {}
        : { statement: request.transientStatement }),
    })
    const response = await this.askMentor({
      authUserId,
      focusTopics: resolved.problem.topics,
      learnerId: authUserId,
      sessionId: randomUUID(),
      phase: 'first_turn',
      hintLevel: 1,
      doubtType: request.doubtType,
      language: request.language,
      attemptSummary: request.attemptSummary,
      problem: resolved.context,
      priorTurns: [],
      ...(request.transientCode === undefined
        ? {}
        : { transientCode: request.transientCode }),
      ...(request.transientError === undefined
        ? {}
        : { transientError: request.transientError }),
    })
    const attachments = [
      request.transientCode === undefined ? null : 'code',
      request.transientError === undefined ? null : 'error output',
    ].filter((item): item is string => item !== null)
    const intake = [
      `**Doubt:** ${doubtLabels[request.doubtType]}`,
      `**Language:** ${request.language}`,
      `**What I tried:** ${request.attemptSummary}`,
      ...(attachments.length === 0
        ? []
        : [
            `_Shared ${attachments.join(' and ')} for this answer only (not saved)._`,
          ]),
    ].join('\n\n')
    const detail = await this.options.repository.createHelpSession(
      authUserId,
      {
        problem: resolved.problem,
        language: request.language,
        doubtType: request.doubtType,
        attemptSummary: request.attemptSummary,
        source: request.source ?? 'manual',
        stage: 'hinting',
        hintLevel: 1,
        ...(response.bugCategory === undefined
          ? {}
          : { bugCategory: response.bugCategory }),
      },
      [
        { role: 'learner', kind: 'intake', content: intake },
        {
          role: 'mentor',
          kind: debuggingDoubtTypes.includes(request.doubtType)
            ? 'diagnosis'
            : 'hint',
          hintLevel: 1,
          content: response.answer,
        },
      ],
    )
    return { data: detail.session, turns: detail.turns }
  }

  private priorTurns(detail: HelpSessionDetail) {
    return detail.turns.slice(-12).map((turn) => ({
      role: turn.role,
      kind: turn.kind,
      ...(turn.hintLevel === undefined ? {} : { hintLevel: turn.hintLevel }),
      content: turn.content.slice(0, 6_000),
    }))
  }

  async helpTurn(
    authUserId: string,
    id: string,
    request: ProblemHelpTurnRequest,
  ): Promise<ProblemHelpSessionResponse> {
    const detail = await this.options.repository.getHelpSession(authUserId, id)
    if (detail === null) {
      throw new MentorError(
        'PROBLEM_HELP_SESSION_NOT_FOUND',
        'This help session was not found.',
      )
    }
    const { session } = detail
    if (session.version !== request.expectedVersion) {
      throw new MentorError(
        'PROBLEM_HELP_STALE_VERSION',
        'This help session changed in another tab. The latest state was loaded.',
      )
    }
    const invalid = (message: string): never => {
      throw new MentorError('PROBLEM_HELP_INVALID_STATE', message)
    }
    if (!activeProblemHelpStages.includes(session.stage)) {
      invalid('This help session has ended. Start a new one to continue.')
    }
    const commit = async (
      patch: Parameters<MentorRepository['updateHelpSession']>[3],
      turns: NewHelpTurn[],
    ) => {
      const updated = await this.options.repository.updateHelpSession(
        authUserId,
        id,
        request.expectedVersion,
        patch,
        turns,
      )
      if (updated === 'stale') {
        throw new MentorError(
          'PROBLEM_HELP_STALE_VERSION',
          'This help session changed in another tab. The latest state was loaded.',
        )
      }
      if (updated === null) {
        throw new MentorError(
          'PROBLEM_HELP_SESSION_NOT_FOUND',
          'This help session was not found.',
        )
      }
      return { data: updated.session, turns: updated.turns }
    }
    const ask = async (
      phase: AiProblemHelpRequest['phase'],
      hintLevel: number,
      extra: {
        learnerMessage?: string
        transientCode?: string
        transientError?: string
        transientStatement?: string
      } = {},
    ) =>
      this.askMentor({
        authUserId,
        focusTopics: session.problem.topics,
        learnerId: authUserId,
        sessionId: session.id,
        phase,
        hintLevel,
        doubtType: session.doubtType,
        language: session.language,
        attemptSummary: session.attemptSummary,
        problem: await this.contextForSession(
          session,
          extra.transientStatement,
        ),
        priorTurns: this.priorTurns(detail),
        ...(extra.learnerMessage === undefined
          ? {}
          : { learnerMessage: extra.learnerMessage }),
        ...(extra.transientCode === undefined
          ? {}
          : { transientCode: extra.transientCode }),
        ...(extra.transientError === undefined
          ? {}
          : { transientError: extra.transientError }),
      })

    switch (request.action) {
      case 'next_hint': {
        if (session.stage !== 'hinting') {
          invalid('Hints are available while you are working through hints.')
        }
        if (session.hintLevel >= PROBLEM_HELP_MAX_GUIDED_LEVEL) {
          invalid(
            'You have used every guided hint. Reveal the full walkthrough when you are ready.',
          )
        }
        const level = session.hintLevel + 1
        const response = await ask('next_hint', level, {
          ...(request.transientStatement === undefined
            ? {}
            : { transientStatement: request.transientStatement }),
        })
        return commit({ hintLevel: level }, [
          {
            role: 'mentor',
            kind: 'hint',
            hintLevel: level,
            content: response.answer,
          },
        ])
      }
      case 'submit_attempt':
      case 'ask': {
        if (session.stage === 'solution_confirmation') {
          invalid('Confirm or cancel the solution reveal first.')
        }
        const revealed = session.stage === 'solution_revealed'
        const level = revealed ? 5 : Math.max(1, session.hintLevel)
        const attachments = [
          request.transientCode === undefined ? null : 'code',
          request.action === 'submit_attempt' &&
          request.transientError !== undefined
            ? 'error output'
            : null,
        ].filter((item): item is string => item !== null)
        const response = await ask(
          request.action === 'submit_attempt' ? 'attempt_feedback' : 'question',
          level,
          {
            learnerMessage: request.content,
            ...(request.transientCode === undefined
              ? {}
              : { transientCode: request.transientCode }),
            ...(request.action === 'submit_attempt' &&
            request.transientError !== undefined
              ? { transientError: request.transientError }
              : {}),
            ...(request.transientStatement === undefined
              ? {}
              : { transientStatement: request.transientStatement }),
          },
        )
        const learnerContent =
          attachments.length === 0
            ? request.content
            : `${request.content}\n\n_Shared ${attachments.join(' and ')} for this answer only (not saved)._`
        return commit(
          response.bugCategory === undefined
            ? {}
            : { bugCategory: response.bugCategory },
          [
            {
              role: 'learner',
              kind:
                request.action === 'submit_attempt' ? 'attempt' : 'question',
              content: learnerContent,
            },
            {
              role: 'mentor',
              kind: request.action === 'submit_attempt' ? 'feedback' : 'answer',
              hintLevel: level,
              content: response.answer,
            },
          ],
        )
      }
      case 'request_solution': {
        if (session.stage !== 'hinting' || session.hintLevel < 1) {
          throw new MentorError(
            'PROBLEM_HELP_SOLUTION_LOCKED',
            'Work through at least one hint before revealing the full solution.',
          )
        }
        return commit({ stage: 'solution_confirmation' }, [])
      }
      case 'cancel_solution': {
        if (session.stage !== 'solution_confirmation') {
          invalid('There is no pending solution reveal to cancel.')
        }
        return commit({ stage: 'hinting' }, [])
      }
      case 'confirm_solution': {
        if (session.stage !== 'solution_confirmation') {
          throw new MentorError(
            'PROBLEM_HELP_SOLUTION_LOCKED',
            'Ask to reveal the full solution first, then confirm it.',
          )
        }
        const response = await ask('full_solution', 5, {
          ...(request.transientStatement === undefined
            ? {}
            : { transientStatement: request.transientStatement }),
        })
        return commit(
          {
            stage: 'solution_revealed',
            hintLevel: 5,
            solutionRevealedAt: this.now(),
          },
          [
            {
              role: 'mentor',
              kind: 'solution',
              hintLevel: 5,
              content: response.answer,
            },
          ],
        )
      }
      case 'complete': {
        const result = await commit(
          { stage: 'completed', completedAt: this.now() },
          [],
        )
        const { problem } = session
        if (
          problem.provider !== undefined &&
          problem.externalId !== undefined &&
          problem.canonicalUrl !== undefined
        ) {
          await this.options.repository
            .ensureRevision(authUserId, {
              provider: problem.provider,
              externalId: problem.externalId,
              title: problem.title,
              canonicalUrl: problem.canonicalUrl,
              topics: problem.topics,
              source: 'doubt_helper',
              dueAt: new Date(
                this.now().getTime() +
                  (REVISION_INTERVAL_DAYS[0] ?? 3) * DAY_MS,
              ),
            })
            .catch(() => undefined)
        }
        return result
      }
      case 'abandon':
        return commit({ stage: 'abandoned', completedAt: this.now() }, [])
    }
  }

  // ---------------------------------------------------------------------
  // Solution Explorer.
  // ---------------------------------------------------------------------

  private learnerStatusFor(
    activity: LearnerActivity,
    provider: ProviderKey,
    key: string,
  ): 'solved' | 'attempted' | 'unsolved' {
    const ref = problemRef(provider, key)
    const submissions = activity.submissions.filter(
      (submission) =>
        submission.provider === provider && submission.problemKey === key,
    )
    const status = activity.statuses.get(ref)?.status
    if (
      status === 'solved' ||
      submissions.some((submission) => submission.isAccepted) ||
      activity.solved.some(
        (item) => item.provider === provider && item.problemKey === key,
      )
    ) {
      return 'solved'
    }
    return submissions.length > 0 || status === 'attempted'
      ? 'attempted'
      : 'unsolved'
  }

  private explorationKey(resolved: ResolvedProblem, language: string) {
    const identity =
      resolved.problem.provider !== undefined &&
      resolved.problemKey !== undefined
        ? problemRef(resolved.problem.provider, resolved.problemKey)
        : (resolved.problem.canonicalUrl ?? resolved.problem.title)
    return `${identity}|${language.toLowerCase()}`.slice(0, 256)
  }

  private async unlockReason(
    authUserId: string,
    resolved: ResolvedProblem,
  ): Promise<{
    status: 'solved' | 'attempted' | 'unsolved'
    reason?: SolutionUnlockReason
  }> {
    const { problem } = resolved
    if (problem.provider === undefined || resolved.problemKey === undefined) {
      return { status: 'unsolved' }
    }
    const activity = await this.options.repository.loadActivity(authUserId)
    const status = this.learnerStatusFor(
      activity,
      problem.provider,
      resolved.problemKey,
    )
    if (status !== 'unsolved') return { status, reason: status }
    const sessions = await this.options.repository.listHelpSessions(
      authUserId,
      100,
    )
    const helped = sessions.some(
      (session) =>
        session.problem.provider === problem.provider &&
        session.problem.externalId === problem.externalId,
    )
    return helped ? { status, reason: 'helped' } : { status }
  }

  async solutionAccess(
    authUserId: string,
    problemUrl: string,
    language: string,
  ): Promise<SolutionAccess> {
    const resolved = await this.resolveProblem({
      url: problemUrl,
      withContent: false,
    })
    const [{ status, reason }, cached] = await Promise.all([
      this.unlockReason(authUserId, resolved),
      this.cachedExploration(
        authUserId,
        this.explorationKey(resolved, language),
      ),
    ])
    return {
      problem: resolved.problem,
      learnerStatus: status,
      ...(reason === undefined ? {} : { unlockedBy: reason }),
      cached: cached !== null,
    }
  }

  private officialSources(resolved: ResolvedProblem): AiCommunitySource[] {
    const { problem } = resolved
    const sources: Omit<AiCommunitySource, 'id'>[] = []
    // Codeforces editorials are blog posts linked from the contest page; the
    // AI service follows that link (see editorialLookup).
    if (problem.provider === 'leetcode' && resolved.problemKey !== undefined) {
      const editorial = editorialUrl('leetcode', resolved.problemKey, '')
      if (editorial !== undefined) {
        sources.push({
          title: 'Official editorial',
          url: editorial,
          publisher: 'LeetCode',
          kind: 'editorial',
          official: true,
        })
      }
    }
    if (problem.provider === 'codechef' && problem.externalId !== undefined) {
      const discuss = editorialUrl('codechef', problem.externalId, '')
      if (discuss !== undefined) {
        sources.push({
          title: 'Official editorial on CodeChef Discuss',
          url: discuss,
          publisher: 'CodeChef',
          kind: 'editorial',
          official: true,
        })
      }
    }
    return sources
      .filter((source) => isSafeCoachPublicUrl(source.url))
      .map((source, index) => ({ ...source, id: `s${index + 1}` }))
  }

  private editorialLookup(
    resolved: ResolvedProblem,
  ): { contestUrl: string; problemIndex: string } | undefined {
    const { problem } = resolved
    if (problem.provider !== 'codeforces' || problem.externalId === undefined) {
      return undefined
    }
    const match = /^(\d+)([A-Z][0-9]?)$/.exec(problem.externalId)
    if (match?.[1] === undefined || match[2] === undefined) return undefined
    return {
      contestUrl: `https://codeforces.com/contest/${match[1]}`,
      problemIndex: match[2],
    }
  }

  private async platformSolutions(
    resolved: ResolvedProblem,
    language: string,
  ): Promise<AiCommunitySource[]> {
    const { provider, externalId } = resolved.problem
    const read = this.options.communitySolutions
    if (
      read === undefined ||
      provider === undefined ||
      externalId === undefined
    )
      return []
    const key = resolved.problemKey ?? externalId
    try {
      const links = await Promise.race([
        read(provider, key, language),
        new Promise<CommunitySolutionLink[]>((resolve) =>
          setTimeout(() => resolve([]), PLATFORM_SOLUTIONS_BUDGET_MS),
        ),
      ])
      return links
        .filter((link) => isSafeCoachPublicUrl(link.url))
        .slice(0, 3)
        .map((link, index) => ({
          id: `p${index + 1}`,
          title: link.title.slice(0, 200),
          url: link.url,
          publisher: link.publisher,
          kind: 'community' as const,
          official: false,
          language: link.language.slice(0, 64),
          ...(link.note === undefined ? {} : { note: link.note.slice(0, 600) }),
        }))
    } catch {
      this.options.logger.warn('mentor_platform_solutions_unavailable', {
        provider,
      })
      return []
    }
  }

  private async cachedExploration(
    authUserId: string,
    key: string,
  ): Promise<SolutionExploration | null> {
    const cached = await this.options.repository.getReport(
      authUserId,
      'solution_exploration',
      key,
    )
    const parsed = SolutionExplorationSchema.safeParse(cached?.payload)
    // Explorations written before the problem explanation and complete
    // programs existed are regenerated instead of reused.
    return parsed.success && parsed.data.problemExplanation !== undefined
      ? parsed.data
      : null
  }

  async exploreSolutions(
    authUserId: string,
    request: ExploreSolutionsRequest,
  ): Promise<{ data: SolutionExploration; cached: boolean }> {
    const resolved = await this.resolveProblem({
      ...(request.problemUrl === undefined ? {} : { url: request.problemUrl }),
      ...(request.problemTitle === undefined
        ? {}
        : { title: request.problemTitle }),
      ...(request.transientStatement === undefined
        ? {}
        : { statement: request.transientStatement }),
    })
    const { reason } = await this.unlockReason(authUserId, resolved)
    const unlockedBy: SolutionUnlockReason | undefined =
      reason ??
      (request.attemptConfirmed === true ? 'self_reported_attempt' : undefined)
    if (unlockedBy === undefined) {
      throw new MentorError(
        'SOLUTION_LOCKED',
        'The Solution Explorer opens after you solve or genuinely attempt a problem. Try it first, or use the Doubt Helper for hints.',
      )
    }
    const key = this.explorationKey(resolved, request.language)
    if (request.refresh !== true) {
      const cached = await this.cachedExploration(authUserId, key)
      if (cached !== null) return { data: cached, cached: true }
    }
    const [learner, platformSolutions] = await Promise.all([
      this.learnerSnapshot(
        authUserId,
        undefined,
        resolved.problem.topics,
        `${resolved.problem.title} ${resolved.problem.topics.join(' ')} solution approaches`,
      ),
      this.platformSolutions(resolved, request.language),
    ])
    const editorialLookup = this.editorialLookup(resolved)
    let response
    try {
      response = await this.options.aiMentorClient.solutions({
        requestId: randomUUID(),
        learnerId: authUserId,
        language: request.language,
        problem: resolved.context,
        learner,
        officialSources: this.officialSources(resolved),
        ...(editorialLookup === undefined ? {} : { editorialLookup }),
        ...(platformSolutions.length === 0 ? {} : { platformSolutions }),
        searchCommunity: true,
      })
    } catch (error) {
      this.aiError(error)
    }
    const exploration = SolutionExplorationSchema.parse({
      problem: resolved.problem,
      language: request.language,
      unlockedBy,
      summary: response.summary,
      ...(response.problemExplanation === undefined
        ? {}
        : { problemExplanation: response.problemExplanation }),
      ...(response.statementSource === undefined
        ? {}
        : { statementSource: response.statementSource }),
      approaches: response.approaches,
      comparison: response.comparison,
      thinkingLessons: response.thinkingLessons,
      community: response.community
        .filter((item) => isSafeCoachPublicUrl(item.url))
        .slice(0, 8),
      generatedAt: this.now().toISOString(),
    })
    await this.options.repository.saveReport(
      authUserId,
      'solution_exploration',
      key,
      hash(key),
      exploration,
    )
    return { data: exploration, cached: false }
  }

  async solutionChat(
    authUserId: string,
    request: SolutionChatRequest,
  ): Promise<{ answer: string }> {
    // A pasted problem is identified by its name; the cached page carries
    // the explanation of the statement.
    const resolved =
      request.problemUrl !== undefined
        ? await this.resolveProblem({ url: request.problemUrl })
        : pastedProblem(request.problemTitle ?? 'Pasted problem')
    const exploration = await this.cachedExploration(
      authUserId,
      this.explorationKey(resolved, request.language),
    )
    if (exploration === null) {
      throw new MentorError(
        'SOLUTION_LOCKED',
        'Explore the approaches for this problem first, then ask about them.',
      )
    }
    const learner = await this.learnerSnapshot(
      authUserId,
      undefined,
      resolved.problem.topics,
      `${request.question} ${resolved.problem.title}`,
    )
    // The page itself is the context: the learner never restates it. The
    // generated timestamp and unlock reason carry nothing to reason about.
    const {
      generatedAt: _generatedAt,
      unlockedBy: _unlockedBy,
      ...page
    } = exploration
    try {
      return await this.options.aiMentorClient.solutionChat({
        requestId: randomUUID(),
        learnerId: authUserId,
        language: request.language,
        problem: resolved.context,
        learner,
        exploration: page,
        history: (request.history ?? []).slice(-SOLUTION_CHAT_HISTORY_LIMIT),
        question: request.question,
      })
    } catch (error) {
      this.aiError(error)
    }
  }

  async listExplorations(authUserId: string) {
    const reports = await this.options.repository.listReports(
      authUserId,
      'solution_exploration',
      50,
    )
    return reports.flatMap((report) => {
      const parsed = SolutionExplorationSchema.safeParse(report.payload)
      return parsed.success
        ? [
            {
              problem: parsed.data.problem,
              approachCount: parsed.data.approaches.length,
              generatedAt: parsed.data.generatedAt,
            },
          ]
        : []
    })
  }

  // ---------------------------------------------------------------------
  // Contest analysis, upsolve and progress share the analyzed contests.
  // ---------------------------------------------------------------------

  private async analyzeContests(
    activity: LearnerActivity,
    limit = ANALYZED_CONTEST_LIMIT,
  ): Promise<{
    contests: AnalyzedContest[]
    metadata: Map<string, ProblemMeta>
  }> {
    const participations = activity.participations
      .filter((item) => item.attendedAt !== undefined)
      .sort(
        (left, right) =>
          (right.attendedAt?.getTime() ?? 0) -
          (left.attendedAt?.getTime() ?? 0),
      )
      .slice(0, limit)
    if (participations.length === 0) {
      return { contests: [], metadata: new Map() }
    }
    const times = participations.map((item) => item.attendedAt?.getTime() ?? 0)
    const catalog = await this.options.repository.listContests(
      [...new Set(participations.map((item) => item.provider))],
      new Date(Math.min(...times) - 7 * DAY_MS),
      new Date(Math.max(...times) + DAY_MS),
    )
    const ratings = new Map<ProviderKey, number>()
    for (const change of activity.ratingChanges) {
      ratings.set(change.provider, Math.round(change.newRating))
    }
    const matched = await Promise.all(
      participations.map(async (participation) => {
        const contest = matchContest(participation, catalog)
        const contestProblems =
          contest === undefined
            ? []
            : participation.provider === 'codeforces'
              ? await this.options.repository
                  .listContestProblems('codeforces', participation.contestId)
                  .catch(() => [])
              : await this.platformContestProblems(
                  participation.provider,
                  contest,
                  {
                    submittedKeys: contestSubmissions(
                      participation,
                      contest,
                      activity.submissions,
                    ).map((submission) => submission.problemKey),
                    ...ratingHint(ratings.get(participation.provider)),
                  },
                )
        return { participation, contest, contestProblems }
      }),
    )
    const refs = matched.flatMap(({ participation, contest }) =>
      contest === undefined
        ? []
        : contestSubmissions(participation, contest, activity.submissions).map(
            (submission) => ({
              provider: submission.provider,
              problemKey: submission.problemKey,
            }),
          ),
    )
    const platformRefs = matched.flatMap((item) =>
      item.participation.provider === 'codeforces'
        ? []
        : item.contestProblems.map((problem) => ({
            provider: problem.provider,
            problemKey: problem.problemKey,
          })),
    )
    const metadata = await this.options.repository
      .problemMetadata([...refs, ...platformRefs])
      .catch(() => new Map<string, ProblemMeta>())
    for (const item of matched) {
      item.contestProblems = item.contestProblems.map((problem) => {
        const ref = problemRef(problem.provider, problem.problemKey)
        const known = metadata.get(ref)
        // Catalog metadata (rating, topics) enriches a contest list entry,
        // while the contest keeps its own position label and link.
        const merged: ProblemMeta =
          known === undefined
            ? problem
            : {
                ...known,
                ...(problem.position === undefined
                  ? {}
                  : { position: problem.position }),
              }
        metadata.set(ref, merged)
        return merged
      })
    }
    const contests = matched.map((item): AnalyzedContest => {
      const metrics =
        item.contest === undefined
          ? undefined
          : buildContestMetrics({
              participation: item.participation,
              contest: item.contest,
              submissions: activity.submissions,
              contestProblems: item.contestProblems,
              metadata,
            })
      return {
        participation: item.participation,
        ...(item.contest === undefined ? {} : { contest: item.contest }),
        ...(metrics === undefined ? {} : { metrics }),
        contestProblems: item.contestProblems,
      }
    })
    return { contests, metadata }
  }

  private async platformContestProblems(
    provider: ProviderKey,
    contest: CatalogContest,
    hint: ContestProblemsHint,
  ): Promise<ProblemMeta[]> {
    const read = this.options.contestProblems
    const code =
      provider === 'codechef'
        ? codeChefContestCode(contest.canonicalUrl)
        : provider === 'leetcode'
          ? (leetcodeContestSlug(contest.canonicalUrl) ?? contest.externalId)
          : undefined
    if (read === undefined || code === undefined) return []
    try {
      const links = await Promise.race([
        read(provider, code, hint),
        new Promise<ContestProblemLink[]>((resolve) =>
          setTimeout(() => resolve([]), CONTEST_PROBLEMS_BUDGET_MS).unref?.(),
        ),
      ])
      return links
        .filter((link) => isSafeCoachPublicUrl(link.canonicalUrl))
        .map((link) => ({
          provider,
          externalId: link.externalId,
          problemKey: link.problemKey,
          title: link.title,
          canonicalUrl: link.canonicalUrl,
          tags: [],
          topics: [],
          position: link.position,
        }))
    } catch {
      this.options.logger.warn('mentor_contest_problems_unavailable', {
        provider,
      })
      return []
    }
  }

  private contestKey(provider: ProviderKey, contestId: string) {
    return `${provider}:${contestId}`.slice(0, 256)
  }

  async contestOverview(
    authUserId: string,
  ): Promise<ContestAnalysisOverviewResponse['data']> {
    const activity = await this.options.repository.loadActivity(authUserId)
    const { contests } = await this.analyzeContests(activity, 30)
    const [narratives, patternsReport] = await Promise.all([
      this.options.repository.listReports(authUserId, 'contest_analysis', 100),
      this.options.repository.getReport(
        authUserId,
        'contest_patterns',
        'latest',
      ),
    ])
    const narrativeKeys = new Set(narratives.map((report) => report.key))
    const parsedPatterns = ContestPatternsReportSchema.safeParse(
      patternsReport?.payload,
    )
    return {
      contests: contests.map((item) => ({
        provider: item.participation.provider,
        contestId: item.participation.contestId.slice(0, 128),
        name: (
          item.participation.contestName ??
          item.contest?.name ??
          item.participation.contestId
        ).slice(0, 512),
        ...(item.metrics?.startsAt === undefined
          ? item.participation.attendedAt === undefined
            ? {}
            : { startsAt: item.participation.attendedAt.toISOString() }
          : { startsAt: item.metrics.startsAt }),
        ...(item.participation.rank === undefined
          ? {}
          : { rank: item.participation.rank }),
        ...(item.participation.ratingChange === undefined
          ? {}
          : { ratingChange: item.participation.ratingChange }),
        solvedCount: item.metrics?.solvedCount ?? 0,
        attemptedCount: item.metrics?.attemptedCount ?? 0,
        analyzable:
          item.metrics !== undefined && item.metrics.submissionCount > 0,
        narrativeAvailable: narrativeKeys.has(
          this.contestKey(
            item.participation.provider,
            item.participation.contestId,
          ),
        ),
      })),
      patterns: contestPatterns(contests),
      ...(parsedPatterns.success
        ? { patternsReport: parsedPatterns.data }
        : {}),
    }
  }

  private async findAnalyzedContest(
    authUserId: string,
    provider: ProviderKey,
    contestId: string,
  ) {
    const activity = await this.options.repository.loadActivity(authUserId)
    const { contests } = await this.analyzeContests(activity, 30)
    const index = contests.findIndex(
      (item) =>
        item.participation.provider === provider &&
        item.participation.contestId === contestId,
    )
    const found = contests[index]
    if (found?.metrics === undefined) {
      throw new MentorError(
        'CONTEST_NOT_FOUND',
        'This contest could not be matched to its schedule, so it cannot be analyzed yet.',
      )
    }
    return { activity, contests, index, found, metrics: found.metrics }
  }

  async contestDetail(
    authUserId: string,
    provider: ProviderKey,
    contestId: string,
  ): Promise<ContestAnalysisResponse['data']> {
    const { metrics } = await this.findAnalyzedContest(
      authUserId,
      provider,
      contestId,
    )
    const cached = await this.options.repository.getReport(
      authUserId,
      'contest_analysis',
      this.contestKey(provider, contestId),
    )
    const narrative = ContestNarrativeSchema.safeParse(cached?.payload)
    return {
      metrics,
      ...(narrative.success ? { narrative: narrative.data } : {}),
    }
  }

  async contestNarrative(
    authUserId: string,
    provider: ProviderKey,
    contestId: string,
    refresh: boolean,
  ): Promise<ContestAnalysisResponse['data']> {
    const { activity, contests, index, metrics } =
      await this.findAnalyzedContest(authUserId, provider, contestId)
    if (metrics.submissionCount === 0) {
      throw new MentorError(
        'NOT_ENOUGH_CONTEST_DATA',
        'No submissions from this contest are in your synced activity yet. Sync your platform and try again.',
      )
    }
    const key = this.contestKey(provider, contestId)
    const sourceHash = hash(metrics)
    const cached = await this.options.repository.getReport(
      authUserId,
      'contest_analysis',
      key,
    )
    const cachedNarrative = ContestNarrativeSchema.safeParse(cached?.payload)
    if (
      !refresh &&
      cachedNarrative.success &&
      cached?.sourceHash === sourceHash
    ) {
      return { metrics, narrative: cachedNarrative.data }
    }
    const learner = await this.learnerSnapshot(authUserId, activity)
    const recentContests = contests
      .filter(
        (item, position) =>
          position !== index &&
          item.metrics !== undefined &&
          item.metrics.submissionCount > 0,
      )
      .slice(0, 6)
      .flatMap((item) =>
        item.metrics === undefined ? [] : [metricsForAi(item.metrics)],
      )
    let output
    try {
      output = await this.options.aiMentorClient.contestAnalysis({
        requestId: randomUUID(),
        learnerId: authUserId,
        metrics: metricsForAi(metrics),
        learner,
        recentContests,
      })
    } catch (error) {
      this.aiError(error)
    }
    const narrative: ContestNarrative = ContestNarrativeSchema.parse({
      ...output,
      generatedAt: this.now().toISOString(),
    })
    await this.options.repository.saveReport(
      authUserId,
      'contest_analysis',
      key,
      sourceHash,
      narrative,
    )
    return { metrics, narrative }
  }

  async contestPatternsReport(
    authUserId: string,
    refresh: boolean,
  ): Promise<ContestPatternsReport> {
    const activity = await this.options.repository.loadActivity(authUserId)
    const { contests } = await this.analyzeContests(activity)
    const analyzed = contests.filter(
      (item) => item.metrics !== undefined && item.metrics.submissionCount > 0,
    )
    if (analyzed.length === 0) {
      throw new MentorError(
        'NOT_ENOUGH_CONTEST_DATA',
        'Take part in a contest (and sync your platform) to build a cross-contest pattern report.',
      )
    }
    const aggregate = contestPatterns(contests)
    const sourceHash = hash({
      aggregate,
      keys: analyzed.map((item) =>
        this.contestKey(
          item.participation.provider,
          item.participation.contestId,
        ),
      ),
    })
    const cached = await this.options.repository.getReport(
      authUserId,
      'contest_patterns',
      'latest',
    )
    const cachedReport = ContestPatternsReportSchema.safeParse(cached?.payload)
    if (!refresh && cachedReport.success && cached?.sourceHash === sourceHash) {
      return cachedReport.data
    }
    const learner = await this.learnerSnapshot(authUserId, activity)
    let output
    try {
      output = await this.options.aiMentorClient.contestPatterns({
        requestId: randomUUID(),
        learnerId: authUserId,
        learner,
        aggregate,
        contests: analyzed
          .slice(0, 12)
          .flatMap((item) =>
            item.metrics === undefined ? [] : [metricsForAi(item.metrics)],
          ),
      })
    } catch (error) {
      this.aiError(error)
    }
    const report = ContestPatternsReportSchema.parse({
      ...output,
      generatedAt: this.now().toISOString(),
    })
    await this.options.repository.saveReport(
      authUserId,
      'contest_patterns',
      'latest',
      sourceHash,
      report,
    )
    return report
  }

  // ---------------------------------------------------------------------
  // Upsolve Tracker and revision schedule.
  // ---------------------------------------------------------------------

  private async computeUpsolve(authUserId: string, activity: LearnerActivity) {
    const [{ contests, metadata }, states] = await Promise.all([
      this.analyzeContests(activity),
      this.options.repository.listUpsolveStates(authUserId),
    ])
    const result = buildUpsolve({
      contests,
      activity,
      metadata,
      states,
      now: this.now(),
    })
    // Upsolved problems enter the spaced revision schedule.
    for (const problem of result.upsolved) {
      await this.options.repository
        .ensureRevision(authUserId, {
          provider: problem.provider,
          externalId: problem.externalId,
          title: problem.title,
          canonicalUrl: problem.canonicalUrl,
          topics: problem.topics,
          source: 'upsolve',
          dueAt: new Date(
            problem.upsolvedAt.getTime() +
              (REVISION_INTERVAL_DAYS[0] ?? 3) * DAY_MS,
          ),
        })
        .catch(() => undefined)
    }
    return { result, contests }
  }

  async upsolve(authUserId: string): Promise<UpsolveResponse['data']> {
    const activity = await this.options.repository.loadActivity(authUserId)
    const { result } = await this.computeUpsolve(authUserId, activity)
    const [revisions, queue] = await Promise.all([
      this.options.repository.listRevisions(authUserId),
      this.selectUpsolveQueue(authUserId, result.candidates, result.incomplete),
    ])
    // The most recent contest on each platform.
    const seen = new Set<ProviderKey>()
    const latest = result.contests.filter((contest) => {
      if (seen.has(contest.provider)) return false
      seen.add(contest.provider)
      return true
    })
    return {
      queue,
      contests: latest,
      history: result.history,
      summary: result.summary,
      revisionsDue: revisions.filter((item) => item.due).length,
      linkedProviders: activity.linkedProviders,
      generatedAt: this.now().toISOString(),
    }
  }

  async setUpsolveState(
    authUserId: string,
    provider: ProviderKey,
    externalId: string,
    state: 'skipped' | 'pending' | 'solved',
  ) {
    await this.options.repository.setUpsolveState(
      authUserId,
      provider,
      provider === 'leetcode' ? externalId.toLowerCase() : externalId,
      state === 'pending' ? null : state,
    )
  }

  // Five problems in a stable order: problems stay where they are until
  // solved or skipped, and each freed slot is filled at the bottom with the
  // best remaining candidate, chosen by the AI mentor from the learner's
  // level and history (score order when the AI is unavailable).
  private async selectUpsolveQueue(
    authUserId: string,
    candidates: readonly UpsolveCandidate[],
    incomplete = false,
  ): Promise<UpsolveItem[]> {
    const byId = new Map(candidates.map((item) => [item.id, item]))
    const stored = await this.options.repository
      .getReport(authUserId, 'upsolve_queue', 'current')
      .catch(() => null)
    const parsed = StoredUpsolveQueueSchema.safeParse(stored?.payload)
    const previous = parsed.success ? parsed.data.ids : []
    const kept = keptQueue(previous, candidates, UPSOLVE_QUEUE_SIZE)
    const reasons: Record<string, string> = parsed.success
      ? { ...parsed.data.reasons }
      : {}
    const need = UPSOLVE_QUEUE_SIZE - kept.length
    // A fresh queue follows the fixed rule (latest contests' first two
    // unsolved problems); only replacements are chosen by the AI.
    const fresh = kept.length === 0
    const pool = fresh
      ? []
      : replacementPool(candidates, kept).slice(0, UPSOLVE_POOL_LIMIT)
    const picked: string[] = fresh
      ? initialQueue(candidates, UPSOLVE_QUEUE_SIZE)
      : []
    if (!fresh && need > 0 && pool.length > 0) {
      const pick = this.options.aiMentorClient.upsolvePick
      if (pick !== undefined && pool.length > need) {
        try {
          const learner = await this.learnerSnapshot(authUserId)
          const output = await pick.call(this.options.aiMentorClient, {
            requestId: randomUUID(),
            learnerId: authUserId,
            learner,
            count: need,
            candidates: pool.map((item) => ({
              id: item.id,
              title: item.title,
              provider: item.provider,
              contestName: item.contest.name,
              daysAgo: item.daysAgo,
              ...(item.position === undefined
                ? {}
                : { position: item.position }),
              ...(item.rating === undefined ? {} : { rating: item.rating }),
              tags: item.tags,
              attempted: item.contestOutcome === 'attempted',
              wrongAttempts: item.contestWrongAttempts,
              frontierRank: Math.min(item.frontierRank, 10),
              score: item.score,
            })),
            alreadyQueued: kept.flatMap((id) => {
              const item = byId.get(id)
              return item === undefined ? [] : [item.title]
            }),
          })
          for (const choice of output.picks) {
            if (
              picked.length < need &&
              pool.some((item) => item.id === choice.id) &&
              !picked.includes(choice.id)
            ) {
              picked.push(choice.id)
              reasons[choice.id] = choice.reason
            }
          }
        } catch (error) {
          this.options.logger.warn('mentor_upsolve_pick_unavailable', {
            errorCode:
              error instanceof AiMentorClientError ? error.code : 'UNKNOWN',
          })
        }
      }
    }
    const ids = fresh
      ? picked
      : fillQueue(kept, pool, picked, UPSOLVE_QUEUE_SIZE)
    const shown = Object.fromEntries(
      ids.flatMap((id) =>
        reasons[id] === undefined ? [] : [[id, reasons[id].slice(0, 240)]],
      ),
    )
    // A fresh queue built while a contest's problem list is missing is shown
    // but not kept, so the next load can include that contest.
    if (ids.join('|') !== previous.join('|') && !(fresh && incomplete)) {
      await this.options.repository
        .saveReport(authUserId, 'upsolve_queue', 'current', hash(ids), {
          version: UPSOLVE_QUEUE_VERSION,
          ids,
          reasons: shown,
        })
        .catch(() => undefined)
    }
    return ids.flatMap((id) => {
      const item = byId.get(id)
      if (item === undefined) return []
      const {
        frontierRank: _rank,
        contestIndex: _index,
        daysAgo: _days,
        score: _score,
        ...rest
      } = item
      return [{ ...rest, priorityReason: shown[id] ?? rest.priorityReason }]
    })
  }

  async revisions(authUserId: string): Promise<RevisionsResponse> {
    const items = await this.options.repository.listRevisions(authUserId)
    const active = items.filter((item) => item.completedAt === undefined)
    return {
      data: items,
      meta: {
        due: active.filter((item) => item.due).length,
        upcoming: active.filter((item) => !item.due).length,
        completed: items.length - active.length,
      },
    }
  }

  async reviewRevision(
    authUserId: string,
    id: string,
    outcome: 'remembered' | 'struggled',
  ): Promise<RevisionItem> {
    const items = await this.options.repository.listRevisions(authUserId)
    const item = items.find((candidate) => candidate.id === id)
    if (item === undefined) {
      throw new MentorError(
        'REVISION_NOT_FOUND',
        'This revision was not found.',
      )
    }
    const now = this.now()
    const stage =
      outcome === 'remembered'
        ? Math.min(item.stage + 1, REVISION_INTERVAL_DAYS.length)
        : 0
    const completed = stage >= REVISION_INTERVAL_DAYS.length
    const days =
      outcome === 'struggled'
        ? 1
        : (REVISION_INTERVAL_DAYS[
            Math.min(stage, REVISION_INTERVAL_DAYS.length - 1)
          ] ?? 7)
    const updated = await this.options.repository.updateRevision(
      authUserId,
      id,
      {
        stage,
        dueAt: new Date(now.getTime() + days * DAY_MS),
        lastReviewedAt: now,
        ...(completed ? { completedAt: now } : {}),
      },
    )
    if (updated === null) {
      throw new MentorError(
        'REVISION_NOT_FOUND',
        'This revision was not found.',
      )
    }
    return updated
  }

  // ---------------------------------------------------------------------
  // Progress Report.
  // ---------------------------------------------------------------------

  async progressReport(authUserId: string): Promise<ProgressReportResponse> {
    const activity = await this.options.repository.loadActivity(authUserId)
    const [profile, roadmap, sessions, upsolveData, revisions] =
      await Promise.all([
        this.options.learnerProfile(authUserId).catch(() => null),
        this.options.roadmap(authUserId).catch(() => null),
        this.options.repository.listHelpSessions(authUserId, 100),
        this.computeUpsolve(authUserId, activity),
        this.options.repository.listRevisions(authUserId),
      ])
    const since = this.now().getTime() - 60 * DAY_MS
    const refs = [
      ...new Map(
        activity.submissions
          .filter((submission) => submission.occurredAt.getTime() >= since)
          .map((submission) => [
            problemRef(submission.provider, submission.problemKey),
            {
              provider: submission.provider,
              problemKey: submission.problemKey,
            },
          ]),
      ).values(),
    ]
    const metadata = await this.options.repository
      .problemMetadata(refs)
      .catch(() => new Map<string, ProblemMeta>())
    const timeZone = profile?.timezone ?? 'UTC'
    const report = buildProgressReport({
      activity,
      roadmapTopics: roadmap?.topics ?? [],
      contests: upsolveData.contests.flatMap((item) =>
        item.metrics === undefined ? [] : [item.metrics],
      ),
      helpSessions: sessions,
      metadata,
      upsolvePending: upsolveData.result.summary.pending,
      revisionsDue: revisions.filter((item) => item.due).length,
      timeZone,
      now: this.now(),
    })
    const cached = await this.options.repository.getReport(
      authUserId,
      'progress_narrative',
      isoWeekKey(this.now()),
    )
    const narrative = ProgressNarrativeSchema.safeParse(cached?.payload)
    return {
      data: report,
      ...(narrative.success ? { narrative: narrative.data } : {}),
    }
  }

  async progressNarrative(
    authUserId: string,
    refresh: boolean,
  ): Promise<ProgressNarrative> {
    const key = isoWeekKey(this.now())
    if (!refresh) {
      const cached = await this.options.repository.getReport(
        authUserId,
        'progress_narrative',
        key,
      )
      const parsed = ProgressNarrativeSchema.safeParse(cached?.payload)
      if (parsed.success) return parsed.data
    }
    const { data: report } = await this.progressReport(authUserId)
    const learner = await this.learnerSnapshot(authUserId)
    const today = dayKey(this.now(), 'UTC')
    let output
    try {
      output = await this.options.aiMentorClient.progressNarrative({
        requestId: randomUUID(),
        learnerId: authUserId,
        learner,
        report: {
          asOf: today,
          topicProgress: report.topicProgress,
          ratingTrend: report.ratingTrend.map((trend) => ({
            provider: trend.provider,
            current: trend.current,
            changePerContest: trend.changePerContest,
            projection90d: trend.projection90d,
            recentPoints: trend.points.slice(-8),
          })),
          accuracy: report.accuracy,
          consistency: report.consistency,
          solvingSpeed: report.solvingSpeed,
          hintDependency: {
            sessions: report.hintDependency.sessions,
            averageHintLevel: report.hintDependency.averageHintLevel,
            solutionRevealRate: report.hintDependency.solutionRevealRate,
            trend: report.hintDependency.trend,
          },
          insights: report.insights.map((insight) => insight.text),
        },
      })
    } catch (error) {
      this.aiError(error)
    }
    const narrative = ProgressNarrativeSchema.parse({
      ...output,
      generatedAt: this.now().toISOString(),
    })
    await this.options.repository.saveReport(
      authUserId,
      'progress_narrative',
      key,
      hash(report.insights),
      narrative,
    )
    return narrative
  }
}
