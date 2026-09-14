import { createHash, randomUUID } from 'node:crypto'

import {
  AiConsentResponseSchema,
  BookmarkSchema,
  BookmarksResponseSchema,
  DeleteAllDataStatusResponseSchema,
  LearnerProgressSchema,
  ProgressAnalyticsResponseSchema,
  ProgressHistoryResponseSchema,
  ProgressResponseSchema,
  type BookmarkQuery,
  type LearnerProgress,
  type ProblemReference,
  type ProgressAnalytics,
  type ProgressHistoryQuery,
  type SaveReflectionRequest,
  type SetProblemStatusRequest,
} from '@algomemtor/shared-contracts'
import type { ProblemProvider } from '../integrations/providers/problem-provider.js'
import type { ProblemProviderSearchResult } from '../integrations/providers/problem-provider.js'
import type { BookmarkRepository } from '../repositories/bookmark-repository.js'
import type { LearnerProfileRepository } from '../repositories/learner-profile-repository.js'
import type { RecommendationRepository } from '../repositories/recommendation-repository.js'
import type {
  ProblemActionRecord,
  ProblemActionRepository,
} from '../repositories/problem-action-repository.js'
import {
  ActiveTimerError,
  type ProgressRepository,
  TimerNotFoundError,
} from '../repositories/progress-repository.js'

const identity = (reference: ProblemReference) =>
  `${reference.provider}:${reference.externalId}`

const asReference = (
  provider: string,
  externalId: string,
): ProblemReference => ({
  provider: provider as ProblemReference['provider'],
  externalId,
})

const encodeCursor = (value: number) =>
  Buffer.from(String(value), 'utf8').toString('base64url')

const decodeCursor = (value: string | undefined) => {
  if (value === undefined) return 0
  const parsed = Number(Buffer.from(value, 'base64url').toString('utf8'))
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0
}

const currentStatuses = (actions: readonly ProblemActionRecord[]) => {
  const statuses = new Map<string, ProblemActionRecord>()
  for (const action of actions
    .filter((item) => item.actionType === 'status_changed')
    .sort(
      (left, right) =>
        left.occurredAt.getTime() - right.occurredAt.getTime() ||
        left.id.localeCompare(right.id),
    )) {
    statuses.set(identity(action), action)
  }
  return statuses
}

const dateKey = (date: Date, timezone: string) => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  }
}

const addDays = (value: string, amount: number) => {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

const actionToHistory = (action: ProblemActionRecord) => {
  const eventType =
    action.actionType === 'bookmarked'
      ? 'bookmark_added'
      : action.actionType === 'unbookmarked'
        ? 'bookmark_removed'
        : action.actionType === 'status_changed' ||
            action.actionType === 'impression' ||
            action.actionType === 'opened' ||
            action.actionType === 'dismissed' ||
            action.actionType === 'dismissal_restored'
          ? action.actionType
          : undefined
  if (eventType === undefined) return null
  return {
    id: action.id,
    eventType,
    problem: asReference(action.provider, action.externalId),
    occurredAt: action.occurredAt.toISOString(),
    ...(action.learnerStatus === undefined
      ? {}
      : { status: action.learnerStatus }),
    ...(action.evidenceSource === undefined
      ? {}
      : { evidenceSource: action.evidenceSource }),
    ...(action.recommendationItemId === undefined
      ? {}
      : { recommendationItemId: action.recommendationItemId }),
    ...(action.sourceContext === undefined
      ? {}
      : { sourceContext: action.sourceContext }),
  }
}

export type ProgressServiceOptions = {
  actionRepository: ProblemActionRepository
  progressRepository: ProgressRepository
  bookmarkRepository: BookmarkRepository
  recommendationRepository?: RecommendationRepository
  provider: ProblemProvider
  learnerProfileRepository?: LearnerProfileRepository
  logger: { warn(event: string, fields?: Record<string, unknown>): void }
  timezoneForLearner?: (authUserId: string) => Promise<string>
  memoryGenerationEnabled?: boolean
}

export class ProgressOutboxUnavailableError extends Error {
  readonly code = 'OUTBOX_UNAVAILABLE'

  constructor() {
    super('Progress processing is temporarily unavailable.')
    this.name = 'ProgressOutboxUnavailableError'
  }
}

export class ProgressService {
  private readonly timezoneForLearner: (authUserId: string) => Promise<string>

  constructor(private readonly options: ProgressServiceOptions) {
    this.timezoneForLearner = options.timezoneForLearner ?? (async () => 'UTC')
  }

  private async enqueueEvidence(
    authUserId: string,
    evidenceType: string,
    evidenceId: string,
    idempotencySuffix = '',
  ) {
    if (this.options.memoryGenerationEnabled === false) return
    try {
      await this.options.progressRepository.enqueueJob({
        authUserId,
        jobType: 'memory_generation',
        evidenceType,
        evidenceId,
        idempotencyKey: `memory:${evidenceType}:${evidenceId}${idempotencySuffix}`,
      })
    } catch (error) {
      this.options.logger.warn('memory_outbox_enqueue_failed', {
        evidenceType,
        errorCode: 'OUTBOX_UNAVAILABLE',
      })
      void error
    }
  }

  async setStatus(
    authUserId: string,
    reference: ProblemReference,
    input: SetProblemStatusRequest,
  ) {
    const action = await this.options.actionRepository.appendByAuthUserId(
      authUserId,
      {
        ...reference,
        actionType: 'status_changed',
        learnerStatus: input.status,
        evidenceSource: 'manual',
        ...(input.recommendationItemId === undefined
          ? {}
          : { recommendationItemId: input.recommendationItemId }),
        ...(input.sourceContext === undefined
          ? {}
          : { sourceContext: input.sourceContext }),
      },
    )
    await this.enqueueEvidence(authUserId, 'status_action', action.id)
    return action
  }

  async recordAction(
    authUserId: string,
    reference: ProblemReference,
    actionType: 'impression' | 'opened' | 'bookmarked' | 'unbookmarked',
    options: {
      recommendationItemId?: string | undefined
      sourceContext?: string | undefined
    } = {},
  ) {
    return this.options.actionRepository.appendByAuthUserId(authUserId, {
      ...reference,
      actionType,
      ...(options.recommendationItemId === undefined
        ? {}
        : { recommendationItemId: options.recommendationItemId }),
      ...(options.sourceContext === undefined
        ? {}
        : { sourceContext: options.sourceContext }),
    })
  }

  async saveReflection(
    authUserId: string,
    reference: ProblemReference,
    input: SaveReflectionRequest,
  ) {
    if (input.statusActionId !== undefined) {
      const statusAction = (
        await this.options.actionRepository.listByAuthUserId(authUserId)
      ).find((action) => action.id === input.statusActionId)
      if (
        statusAction === undefined ||
        statusAction.actionType !== 'status_changed' ||
        statusAction.provider !== reference.provider ||
        statusAction.externalId !== reference.externalId
      ) {
        throw new ProgressValidationError(
          'The reflection status action is not owned by this learner or problem.',
        )
      }
    }
    const reflection = await this.options.progressRepository.saveReflection(
      authUserId,
      reference,
      input,
    )
    await this.enqueueEvidence(authUserId, 'reflection', reflection.id)
    return reflection
  }

  async getProgress(authUserId: string, reference: ProblemReference) {
    const [actions, reflections, timers, bookmarks] = await Promise.all([
      this.options.actionRepository.listByAuthUserId(authUserId),
      this.options.progressRepository.listReflections(authUserId, reference),
      this.options.progressRepository.listTimerSessions(authUserId, reference),
      this.options.bookmarkRepository.listByAuthUserId(authUserId),
    ])
    const latestStatus = currentStatuses(actions).get(identity(reference))
    const latestReflection = reflections[0]
    const focusedSeconds = timers
      .filter((timer) => timer.state !== 'discarded')
      .reduce((total, timer) => total + timer.durationSeconds, 0)
    const activeTimer = timers.find(
      (timer) => timer.state === 'running' || timer.requiresResolution,
    )
    return ProgressResponseSchema.parse({
      data: {
        problem: reference,
        status: latestStatus?.learnerStatus ?? 'unsolved',
        ...(latestStatus?.evidenceSource === undefined
          ? {}
          : { evidenceSource: latestStatus.evidenceSource }),
        ...(latestStatus?.id === undefined
          ? {}
          : { statusActionId: latestStatus.id }),
        bookmarked: bookmarks.some(
          (bookmark) =>
            bookmark.provider === reference.provider &&
            bookmark.externalId === reference.externalId,
        ),
        ...(latestReflection === undefined ? {} : { latestReflection }),
        focusedSeconds,
        ...(activeTimer === undefined ? {} : { activeTimer }),
      },
    })
  }

  async history(authUserId: string, query: ProgressHistoryQuery) {
    const [actions, reflections, timers] = await Promise.all([
      this.options.actionRepository.listByAuthUserId(authUserId),
      this.options.progressRepository.listReflections(authUserId),
      this.options.progressRepository.listTimerSessions(authUserId),
    ])
    const providerResult = query.topic
      ? await this.options.provider.search({})
      : undefined
    const problemTopics = new Map(
      providerResult?.problems.map((problem) => [
        identity(problem),
        problem.topics,
      ]),
    )
    const events = [
      ...actions.map(actionToHistory).filter((event) => event !== null),
      ...reflections.map((reflection) => ({
        id: reflection.id,
        eventType: 'reflection_created' as const,
        problem: reflection.problem,
        occurredAt: reflection.createdAt,
        reflection,
      })),
      ...timers.map((timer) => ({
        id: timer.id,
        eventType:
          timer.state === 'completed'
            ? ('timer_completed' as const)
            : timer.state === 'discarded'
              ? ('timer_discarded' as const)
              : timer.state === 'paused' || timer.state === 'capped'
                ? ('timer_paused' as const)
                : ('timer_started' as const),
        problem: timer.problem,
        occurredAt: timer.completedAt ?? timer.pausedAt ?? timer.createdAt,
        durationSeconds: timer.durationSeconds,
      })),
    ]
      .filter((event) => {
        if (
          query.eventType !== undefined &&
          event.eventType !== query.eventType
        ) {
          return false
        }
        if (
          query.provider !== undefined &&
          event.problem.provider !== query.provider
        ) {
          return false
        }
        if (
          query.externalId !== undefined &&
          event.problem.externalId !== query.externalId
        ) {
          return false
        }
        if (
          query.topic !== undefined &&
          !problemTopics.get(identity(event.problem))?.includes(query.topic)
        ) {
          return false
        }
        if (
          query.status !== undefined &&
          (!('status' in event) || event.status !== query.status)
        ) {
          return false
        }
        return true
      })
      .sort(
        (left, right) =>
          new Date(right.occurredAt).getTime() -
            new Date(left.occurredAt).getTime() ||
          right.id.localeCompare(left.id),
      )
    const offset = decodeCursor(query.cursor)
    const page = events.slice(offset, offset + query.limit)
    const nextOffset = offset + page.length
    return ProgressHistoryResponseSchema.parse({
      data: page,
      meta: {
        hasMore: nextOffset < events.length,
        ...(nextOffset < events.length
          ? { nextCursor: encodeCursor(nextOffset) }
          : {}),
      },
    })
  }

  async analytics(authUserId: string, days = 30) {
    const [actions, timers, timezone] = await Promise.all([
      this.options.actionRepository.listByAuthUserId(authUserId),
      this.options.progressRepository.listTimerSessions(authUserId),
      this.timezoneForLearner(authUserId),
    ])
    let providerResult: ProblemProviderSearchResult = {
      problems: [],
      freshness: this.options.provider.getHealth(),
      warnings: [],
    }
    try {
      providerResult = await this.options.provider.search({})
    } catch (error) {
      this.options.logger.warn('progress_analytics_provider_unavailable', {
        errorCode: 'PROVIDER_UNAVAILABLE',
      })
      void error
    }
    const now = Date.now()
    const windowDays = Math.min(30, Math.max(1, Math.trunc(days)))
    const last30 = new Date(now - windowDays * 86_400_000)
    const last90 = new Date(now - 90 * 86_400_000)
    const statuses = currentStatuses(actions)
    const inventory = { unsolved: 0, attempted: 0, solved: 0 }
    for (const action of statuses.values()) {
      inventory[action.learnerStatus ?? 'unsolved'] += 1
    }
    const recentStatusActions = actions.filter(
      (action) =>
        action.actionType === 'status_changed' && action.occurredAt >= last30,
    )
    const trendMap = new Map<
      string,
      { attempted: Set<string>; solved: Set<string> }
    >()
    for (const action of recentStatusActions) {
      const key = dateKey(action.occurredAt, timezone)
      const entry = trendMap.get(key) ?? {
        attempted: new Set(),
        solved: new Set(),
      }
      if (
        action.learnerStatus === 'attempted' ||
        action.learnerStatus === 'solved'
      )
        entry.attempted.add(identity(action))
      if (action.learnerStatus === 'solved') entry.solved.add(identity(action))
      trendMap.set(key, entry)
    }
    const today = dateKey(new Date(), timezone)
    const trend = Array.from({ length: windowDays }, (_, index) =>
      addDays(today, index - (windowDays - 1)),
    ).map((date) => {
      const entry = trendMap.get(date)
      return {
        date,
        attempted: entry?.attempted.size ?? 0,
        solved: entry?.solved.size ?? 0,
      }
    })
    const solvedDays = new Set(
      actions
        .filter(
          (action) =>
            action.actionType === 'status_changed' &&
            action.learnerStatus === 'solved',
        )
        .map((action) => dateKey(action.occurredAt, timezone)),
    )
    const streaks = calculateStreaks(solvedDays, today)
    const recentProblemIds = new Set(
      recentStatusActions.map(identity).filter((key) => {
        const status = statuses.get(key)?.learnerStatus
        return status === 'attempted' || status === 'solved'
      }),
    )
    const recentSolvedIds = new Set(
      [...recentProblemIds].filter(
        (key) => statuses.get(key)?.learnerStatus === 'solved',
      ),
    )
    const impressionActions = actions.filter(
      (action) =>
        action.actionType === 'impression' && action.occurredAt >= last30,
    )
    const opens = conversionIds(
      impressionActions,
      actions,
      (action) => action.actionType === 'opened',
    )
    const attempted = countStatusConversions(
      impressionActions,
      actions,
      'attempted',
    )
    const solved = countStatusConversions(impressionActions, actions, 'solved')
    const focusedSeconds = timers
      .filter(
        (timer) =>
          timer.state === 'completed' && timer.completedAt !== undefined,
      )
      .reduce((total, timer) => total + timer.durationSeconds, 0)
    const solvedWithTimer = new Set(
      [...statuses.entries()]
        .filter(([, action]) => action.learnerStatus === 'solved')
        .filter(([key]) =>
          timers.some(
            (timer) =>
              identity(timer.problem) === key &&
              timer.state === 'completed' &&
              timer.durationSeconds > 0,
          ),
        )
        .map(([key]) => key),
    )
    const averageSolvedSeconds =
      solvedWithTimer.size === 0
        ? null
        : [...solvedWithTimer].reduce(
            (total, key) =>
              total +
              timers
                .filter(
                  (timer) =>
                    identity(timer.problem) === key &&
                    timer.state === 'completed',
                )
                .reduce((sum, timer) => sum + timer.durationSeconds, 0),
            0,
          ) / solvedWithTimer.size
    const problemByIdentity = new Map(
      providerResult.problems.map((problem) => [identity(problem), problem]),
    )
    const topicScores = calculateTopicScores(
      actions,
      timers,
      problemByIdentity,
      last90,
    )
    return ProgressAnalyticsResponseSchema.parse({
      data: {
        generatedAt: new Date().toISOString(),
        timezone,
        inventory,
        trend,
        focusedSeconds,
        averageSolvedSeconds,
        currentStreak: streaks.current,
        longestStreak: streaks.longest,
        completionRate:
          recentProblemIds.size === 0
            ? 0
            : recentSolvedIds.size / recentProblemIds.size,
        recommendationConversions: {
          impressions: impressionActions.length,
          opens,
          attempted,
          solved,
          impressionToOpen: ratio(opens, impressionActions.length),
          impressionToAttempt: ratio(attempted, impressionActions.length),
          impressionToSolve: ratio(solved, impressionActions.length),
        },
        topicScores,
      },
    })
  }

  async listBookmarks(authUserId: string, query: BookmarkQuery) {
    const [bookmarks, actions, providerResult] = await Promise.all([
      this.options.bookmarkRepository.listByAuthUserId(authUserId),
      this.options.actionRepository.listByAuthUserId(authUserId),
      this.options.provider.search({}),
    ])
    const statuses = currentStatuses(actions)
    const problems = new Map(
      providerResult.problems.map((problem) => [identity(problem), problem]),
    )
    const data = bookmarks
      .map((bookmark) => {
        const reference = asReference(bookmark.provider, bookmark.externalId)
        const problem = problems.get(identity(reference))
        if (problem === undefined) return null
        const status =
          statuses.get(identity(reference))?.learnerStatus ?? 'unsolved'
        return BookmarkSchema.parse({
          id: bookmark.id,
          createdAt: bookmark.createdAt.toISOString(),
          problem: { ...problem, learnerStatus: status, bookmarked: true },
        })
      })
      .filter((bookmark) => bookmark !== null)
      .filter((bookmark) => {
        const { problem } = bookmark
        if (
          query.search !== undefined &&
          !`${problem.title} ${problem.externalId}`
            .toLowerCase()
            .includes(query.search.toLowerCase())
        )
          return false
        if (query.topic !== undefined && !problem.topics.includes(query.topic))
          return false
        if (
          query.status !== undefined &&
          (problem.learnerStatus ?? 'unsolved') !== query.status
        )
          return false
        if (
          query.difficulty !== undefined &&
          problem.normalizedDifficulty !== query.difficulty
        )
          return false
        return true
      })
      .sort((left, right) => {
        if (query.sort === 'title')
          return left.problem.title.localeCompare(right.problem.title)
        if (query.sort === 'difficulty') {
          const leftDifficulty =
            typeof left.problem.providerDifficulty === 'number'
              ? left.problem.providerDifficulty
              : Number.MAX_SAFE_INTEGER
          const rightDifficulty =
            typeof right.problem.providerDifficulty === 'number'
              ? right.problem.providerDifficulty
              : Number.MAX_SAFE_INTEGER
          return leftDifficulty - rightDifficulty
        }
        return (
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime()
        )
      })
    const total = data.length
    const totalPages = Math.ceil(total / query.pageSize)
    const page = data.slice(
      (query.page - 1) * query.pageSize,
      query.page * query.pageSize,
    )
    return BookmarksResponseSchema.parse({
      data: page,
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages },
    })
  }

  async saveBookmark(authUserId: string, reference: ProblemReference) {
    const providerResult = await this.options.provider.search({})
    const problem = providerResult.problems.find(
      (item) => identity(item) === identity(reference),
    )
    if (problem === undefined) {
      throw new Error(
        'The bookmarked problem is not available in provider data.',
      )
    }
    const [bookmark, actions] = await Promise.all([
      this.options.bookmarkRepository.saveByAuthUserId(authUserId, reference),
      this.options.actionRepository.listByAuthUserId(authUserId),
    ])
    await this.recordAction(authUserId, reference, 'bookmarked', {
      sourceContext: 'bookmark',
    }).catch(() => undefined)
    const status =
      currentStatuses(actions).get(identity(reference))?.learnerStatus ??
      'unsolved'
    return BookmarkSchema.parse({
      id: bookmark.id,
      createdAt: bookmark.createdAt.toISOString(),
      problem: { ...problem, learnerStatus: status, bookmarked: true },
    })
  }

  async removeBookmark(authUserId: string, reference: ProblemReference) {
    await this.options.bookmarkRepository.deleteByAuthUserId(
      authUserId,
      reference.provider,
      reference.externalId,
    )
    return this.recordAction(authUserId, reference, 'unbookmarked', {
      sourceContext: 'bookmark',
    })
  }

  async deleteProblem(authUserId: string, reference: ProblemReference) {
    const [actions, progressEvidenceIds, feedbackEvidenceIds] =
      await Promise.all([
        this.options.actionRepository.listByAuthUserId(authUserId),
        this.options.progressRepository.listMemoryEvidenceIds?.(
          authUserId,
          reference,
        ) ?? Promise.resolve([]),
        this.options.recommendationRepository?.listFeedbackEvidenceIdsByProblem?.(
          authUserId,
          reference.provider,
          reference.externalId,
        ) ?? Promise.resolve([]),
      ])
    const evidenceIds = [
      ...new Set([
        ...progressEvidenceIds,
        ...feedbackEvidenceIds,
        ...actions
          .filter(
            (action) =>
              action.provider === reference.provider &&
              action.externalId === reference.externalId,
          )
          .map((action) => action.id),
      ]),
    ]
    const evidenceDigest = createHash('sha256')
      .update(evidenceIds.slice().sort().join(','))
      .digest('hex')
      .slice(0, 32)
    try {
      await this.options.progressRepository.enqueueJob({
        authUserId,
        jobType: 'problem_data_deletion',
        evidenceType: 'problem_deleted',
        ...(evidenceIds.length === 0 ? {} : { evidenceIds }),
        problemProvider: reference.provider,
        problemExternalId: reference.externalId,
        idempotencyKey: `delete-problem:${authUserId}:${reference.provider}:${reference.externalId}:${evidenceDigest}`,
      })
    } catch {
      this.options.logger.warn('problem_memory_deletion_enqueue_failed', {
        errorCode: 'OUTBOX_UNAVAILABLE',
      })
      throw new ProgressOutboxUnavailableError()
    }
    await this.options.recommendationRepository?.deleteFeedbackByProblem?.(
      authUserId,
      reference.provider,
      reference.externalId,
    )
    await this.options.progressRepository.deleteProblemProgress(
      authUserId,
      reference,
      evidenceIds,
    )
    await this.options.actionRepository.deleteByAuthUserId?.(
      authUserId,
      reference.provider,
      reference.externalId,
    )
  }

  async getConsent(authUserId: string) {
    return AiConsentResponseSchema.parse({
      data: await this.options.progressRepository.getConsent(authUserId),
    })
  }

  async saveConsent(
    authUserId: string,
    enabled: boolean,
    policyVersion: string,
  ) {
    const previous =
      await this.options.progressRepository.getConsent(authUserId)
    const consent = await this.options.progressRepository.saveConsent(
      authUserId,
      enabled,
      policyVersion,
    )
    if (!enabled) {
      try {
        await this.options.progressRepository.enqueueJob({
          authUserId,
          jobType: 'memory_consent_cleanup',
          evidenceType: 'consent_revoked',
          idempotencyKey: `memory-consent-cleanup:${authUserId}:${consent.decidedAt ?? policyVersion}`,
        })
      } catch {
        this.options.logger.warn('memory_consent_cleanup_enqueue_failed', {
          errorCode: 'OUTBOX_UNAVAILABLE',
        })
        throw new ProgressOutboxUnavailableError()
      }
    } else if (
      previous?.enabled !== true &&
      this.options.memoryGenerationEnabled !== false
    ) {
      try {
        const profile =
          await this.options.learnerProfileRepository?.findByAuthUserId(
            authUserId,
          )
        if (profile?.recommendationPreference !== undefined) {
          await this.enqueueEvidence(
            authUserId,
            'profile_preference',
            randomUUID(),
            `:consent:${consent.decidedAt === undefined ? 'current' : new Date(consent.decidedAt).getTime()}`,
          )
        }
      } catch (error) {
        this.options.logger.warn('profile_preference_memory_enqueue_failed', {
          errorCode: 'OUTBOX_UNAVAILABLE',
        })
        void error
      }
      const reflections =
        await this.options.progressRepository.listReflections(authUserId)
      await Promise.all(
        reflections.map((reflection) =>
          this.enqueueEvidence(
            authUserId,
            'reflection',
            reflection.id,
            `:consent:${consent.decidedAt === undefined ? 'current' : new Date(consent.decidedAt).getTime()}`,
          ),
        ),
      )
    }
    return AiConsentResponseSchema.parse({ data: consent })
  }

  async requestDeleteAll(authUserId: string) {
    try {
      return await this.options.progressRepository.requestDeleteAll(authUserId)
    } catch {
      this.options.logger.warn('learner_data_deletion_enqueue_failed', {
        errorCode: 'OUTBOX_UNAVAILABLE',
      })
      throw new ProgressOutboxUnavailableError()
    }
  }

  async getDeleteStatus(authUserId: string) {
    const status =
      (await this.options.progressRepository.deleteStatus?.(authUserId)) ??
      (((await this.options.progressRepository.hasPendingDeletion?.(
        authUserId,
      )) ?? false)
        ? 'pending'
        : 'completed')
    return DeleteAllDataStatusResponseSchema.parse({
      data: { status },
    })
  }

  async startTimer(
    authUserId: string,
    reference: ProblemReference,
    confirmSwitch: boolean,
  ) {
    const result = await this.options.progressRepository.startTimer(
      authUserId,
      reference,
      confirmSwitch,
    )
    return result
  }

  async timerAction(
    authUserId: string,
    sessionId: string,
    action: 'pause' | 'resume' | 'complete' | 'discard',
  ) {
    if (action === 'pause')
      return this.options.progressRepository.pauseTimer(authUserId, sessionId)
    if (action === 'resume')
      return this.options.progressRepository.resumeTimer(authUserId, sessionId)
    const session = await this.options.progressRepository.resolveTimer(
      authUserId,
      sessionId,
      action,
    )
    if (action === 'complete')
      await this.enqueueEvidence(authUserId, 'timer', session.id)
    return session
  }
}

const ratio = (numerator: number, denominator: number) =>
  denominator === 0 ? 0 : numerator / denominator

const conversionIds = (
  impressions: readonly ProblemActionRecord[],
  actions: readonly ProblemActionRecord[],
  matches: (action: ProblemActionRecord) => boolean,
) => {
  const ids = new Set<string>()
  for (const action of actions.filter(matches)) {
    const preceding = impressions
      .filter((impression) => {
        if (action.occurredAt < impression.occurredAt) return false
        if (
          action.recommendationItemId !== undefined &&
          action.recommendationItemId !== impression.recommendationItemId
        ) {
          return false
        }
        return (
          action.provider === impression.provider &&
          action.externalId === impression.externalId
        )
      })
      .sort(
        (left, right) =>
          right.occurredAt.getTime() - left.occurredAt.getTime() ||
          right.id.localeCompare(left.id),
      )[0]
    if (preceding !== undefined) {
      ids.add(preceding.recommendationItemId ?? preceding.id)
    }
  }
  return ids.size
}

const countStatusConversions = (
  impressions: readonly ProblemActionRecord[],
  actions: readonly ProblemActionRecord[],
  status: 'attempted' | 'solved',
) =>
  conversionIds(
    impressions,
    actions,
    (action) =>
      action.actionType === 'status_changed' && action.learnerStatus === status,
  )

const calculateStreaks = (days: ReadonlySet<string>, today: string) => {
  let current = 0
  for (let cursor = today; days.has(cursor); cursor = addDays(cursor, -1))
    current += 1
  let longest = 0
  let running = 0
  let previous: string | undefined
  for (const day of [...days].sort()) {
    if (previous !== undefined && day === addDays(previous, 1)) {
      running += 1
    } else {
      running = 1
    }
    longest = Math.max(longest, running)
    previous = day
  }
  return { current, longest }
}

const calculateTopicScores = (
  actions: readonly ProblemActionRecord[],
  timers: Awaited<ReturnType<ProgressRepository['listTimerSessions']>>,
  problems: ReadonlyMap<
    string,
    {
      topics: string[]
      normalizedDifficulty?: 'easy' | 'medium' | 'hard' | undefined
    }
  >,
  since: Date,
) => {
  const statuses = currentStatuses(actions)
  const eligibleKeys = new Set(
    actions
      .filter(
        (action) =>
          action.actionType === 'status_changed' &&
          action.occurredAt >= since &&
          (action.learnerStatus === 'attempted' ||
            action.learnerStatus === 'solved'),
      )
      .map(identity),
  )
  const byTopic = new Map<
    string,
    Array<{
      status: 'unsolved' | 'attempted' | 'solved'
      difficulty: number
      effort: number
    }>
  >()
  for (const key of eligibleKeys) {
    const action = statuses.get(key)
    if (action === undefined) continue
    const problem = problems.get(key)
    if (problem === undefined) continue
    const difficulty =
      problem.normalizedDifficulty === 'easy'
        ? 0.33
        : problem.normalizedDifficulty === 'hard'
          ? 1
          : 0.67
    const effort = timers.some(
      (timer) =>
        identity(timer.problem) === key &&
        timer.state === 'completed' &&
        timer.durationSeconds >= 300,
    )
      ? 1
      : 0
    for (const topic of problem.topics) {
      const values = byTopic.get(topic) ?? []
      values.push({
        status: action.learnerStatus ?? 'unsolved',
        difficulty,
        effort,
      })
      byTopic.set(topic, values)
    }
  }
  return [...byTopic.entries()]
    .filter(([, values]) => values.length >= 3)
    .map(([topic, values]) => {
      const outcome =
        values.reduce(
          (sum, value) =>
            sum +
            (value.status === 'solved'
              ? 1
              : value.status === 'attempted'
                ? 0.4
                : 0),
          0,
        ) / values.length
      const difficulty =
        values.reduce((sum, value) => sum + value.difficulty, 0) / values.length
      const effort =
        values.reduce((sum, value) => sum + value.effort, 0) / values.length
      return {
        topic,
        score: Math.round(
          (outcome * 0.5 + difficulty * 0.3 + effort * 0.2) * 100,
        ),
        evidenceCount: values.length,
        formula:
          '50% outcome + 30% solved difficulty + 20% completed timer effort',
      }
    })
    .sort(
      (left, right) =>
        right.score - left.score || left.topic.localeCompare(right.topic),
    )
}

export { ActiveTimerError, TimerNotFoundError }

export class ProgressValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProgressValidationError'
  }
}
