import {
  AiConsentSchema,
  BookmarkSchema,
  ProblemReflectionSchema,
  ProblemReferenceSchema,
  ProblemTimerSessionSchema,
  ProviderKeySchema,
  type ProviderKey,
  type AiConsent,
  type ProblemReflection,
  type ProblemReference,
  type ProblemTimerSession,
  type SaveReflectionRequest,
} from '@algomemtor/shared-contracts'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import {
  AI_CONSENT_POLICY_VERSION,
  alwaysOnAiConsent,
} from '../services/ai-consent-policy.js'

const authUserIdSchema = z.uuid()
const identifierSchema = z.uuid()

const outboxJobSchema = z
  .object({
    id: identifierSchema,
    authUserId: authUserIdSchema,
    jobType: z.string().trim().min(1).max(64),
    evidenceType: z.string().trim().min(1).max(64),
    evidenceId: identifierSchema.optional(),
    evidenceIds: z.array(identifierSchema).max(256).optional(),
    problemProvider: ProviderKeySchema.optional(),
    problemExternalId: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^\S+$/)
      .optional(),
    idempotencyKey: z.string().trim().min(1).max(160),
    status: z.enum(['pending', 'processing', 'completed', 'failed']),
    attempts: z.number().int().nonnegative(),
    nextAttemptAt: z.date(),
    lockedAt: z.date().optional(),
    safeErrorCode: z.string().trim().min(1).max(64).optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.problemProvider === undefined) !==
      (value.problemExternalId === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Problem deletion context must include provider and external ID together.',
        path: ['problemProvider'],
      })
    }
  })

export type OutboxJobRecord = z.infer<typeof outboxJobSchema>
export type DeleteAllDataStatus = 'pending' | 'completed' | 'failed'

export type MemoryEvidencePayload = {
  occurredAt?: Date
  note?: string
  perceivedDifficulty?: 'easy' | 'medium' | 'hard'
  timeSpentMinutes?: number
  feedback?: 'useful' | 'not_useful' | 'too_easy' | 'about_right' | 'too_hard'
  explicitPreference?: string
  problemStatus?: 'unsolved' | 'attempted' | 'solved'
  problemProvider?: ProviderKey
  problemExternalId?: string
}

const timerInternalSchema = z
  .object({
    id: identifierSchema,
    authUserId: authUserIdSchema,
    provider: ProblemReferenceSchema.shape.provider,
    externalId: ProblemReferenceSchema.shape.externalId,
    state: z.enum(['running', 'paused', 'completed', 'discarded', 'capped']),
    durationSeconds: z.number().int().nonnegative().max(14_400),
    startedAt: z.date(),
    lastResumedAt: z.date().optional(),
    pausedAt: z.date().optional(),
    completedAt: z.date().optional(),
    requiresResolution: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict()

type TimerInternal = z.infer<typeof timerInternalSchema>

const reflectionInternalSchema = z
  .object({
    id: identifierSchema,
    authUserId: authUserIdSchema,
    provider: ProblemReferenceSchema.shape.provider,
    externalId: ProblemReferenceSchema.shape.externalId,
    perceivedDifficulty: z.enum(['easy', 'medium', 'hard']),
    note: z.string().max(1_000).optional(),
    statusActionId: identifierSchema.optional(),
    supersedesReflectionId: identifierSchema.optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict()

type ReflectionInternal = z.infer<typeof reflectionInternalSchema>

export type ProgressRepository = {
  saveReflection(
    authUserId: string,
    reference: ProblemReference,
    input: SaveReflectionRequest,
  ): Promise<ProblemReflection>
  listReflections(
    authUserId: string,
    reference?: ProblemReference,
  ): Promise<ProblemReflection[]>
  findRunningTimer(authUserId: string): Promise<ProblemTimerSession | null>
  listTimerSessions(
    authUserId: string,
    reference?: ProblemReference,
  ): Promise<ProblemTimerSession[]>
  startTimer(
    authUserId: string,
    reference: ProblemReference,
    confirmSwitch: boolean,
  ): Promise<{
    session: ProblemTimerSession
    pausedSession?: ProblemTimerSession
  }>
  pauseTimer(
    authUserId: string,
    sessionId: string,
  ): Promise<ProblemTimerSession>
  resumeTimer(
    authUserId: string,
    sessionId: string,
  ): Promise<ProblemTimerSession>
  resolveTimer(
    authUserId: string,
    sessionId: string,
    resolution: 'complete' | 'discard',
  ): Promise<ProblemTimerSession>
  getConsent(authUserId: string): Promise<AiConsent | null>
  saveConsent(
    authUserId: string,
    enabled: boolean,
    policyVersion: string,
  ): Promise<AiConsent>
  enqueueJob(input: {
    authUserId: string
    jobType: string
    evidenceType: string
    evidenceId?: string
    evidenceIds?: string[]
    problemProvider?: ProviderKey
    problemExternalId?: string
    idempotencyKey: string
  }): Promise<OutboxJobRecord>
  claimNextJob(now?: Date): Promise<OutboxJobRecord | null>
  completeJob(jobId: string, lockedAt?: Date): Promise<boolean>
  retryJob(
    jobId: string,
    nextAttemptAt: Date,
    errorCode: string,
    lockedAt?: Date,
  ): Promise<boolean>
  failJob(jobId: string, errorCode: string, lockedAt?: Date): Promise<boolean>
  deleteProblemProgress(
    authUserId: string,
    reference: ProblemReference,
    additionalEvidenceIds?: readonly string[],
  ): Promise<void>
  requestDeleteAll(authUserId: string): Promise<OutboxJobRecord>
  deleteStatus?(authUserId: string): Promise<DeleteAllDataStatus>
  hasPendingDeletion?(authUserId: string): Promise<boolean>
  deleteAllForAuthUser(authUserId: string): Promise<void>
  latestRelevantChangeAt(authUserId: string): Promise<Date | undefined>
  pendingJobCount?(authUserId: string): Promise<number>
  listMemoryEvidenceIds?(
    authUserId: string,
    reference: ProblemReference,
  ): Promise<string[]>
  getMemoryEvidence?(
    authUserId: string,
    evidenceType: string,
    evidenceId: string,
  ): Promise<MemoryEvidencePayload | null>
}

const parseAuthUserId = (value: string) => authUserIdSchema.parse(value)
const parseReference = (value: ProblemReference) =>
  ProblemReferenceSchema.parse(value)

const referenceKey = (reference: ProblemReference) =>
  `${reference.provider}:${reference.externalId}`

const publicReflection = (value: ReflectionInternal): ProblemReflection =>
  ProblemReflectionSchema.parse({
    id: value.id,
    problem: { provider: value.provider, externalId: value.externalId },
    perceivedDifficulty: value.perceivedDifficulty,
    ...(value.note === undefined ? {} : { note: value.note }),
    ...(value.statusActionId === undefined
      ? {}
      : { statusActionId: value.statusActionId }),
    createdAt: value.createdAt.toISOString(),
    ...(value.supersedesReflectionId === undefined
      ? {}
      : { supersedesReflectionId: value.supersedesReflectionId }),
  })

const currentDuration = (value: TimerInternal, now: Date) => {
  if (value.state !== 'running' || value.lastResumedAt === undefined) {
    return value.durationSeconds
  }

  return Math.min(
    14_400,
    value.durationSeconds +
      Math.max(
        0,
        Math.floor((now.getTime() - value.lastResumedAt.getTime()) / 1_000),
      ),
  )
}

const publicTimer = (value: TimerInternal, now: Date): ProblemTimerSession => {
  const durationSeconds = currentDuration(value, now)
  const capped = value.state === 'running' && durationSeconds >= 14_400
  const state = capped ? 'capped' : value.state

  return ProblemTimerSessionSchema.parse({
    id: value.id,
    problem: { provider: value.provider, externalId: value.externalId },
    state,
    durationSeconds,
    startedAt: value.startedAt.toISOString(),
    ...(state === 'running' && value.lastResumedAt !== undefined
      ? { lastResumedAt: value.lastResumedAt.toISOString() }
      : {}),
    ...(value.pausedAt === undefined
      ? {}
      : { pausedAt: value.pausedAt.toISOString() }),
    ...(value.completedAt === undefined
      ? {}
      : { completedAt: value.completedAt.toISOString() }),
    requiresResolution: value.requiresResolution || capped,
    createdAt: value.createdAt.toISOString(),
  })
}

export class InMemoryProgressRepository implements ProgressRepository {
  private readonly reflections = new Map<string, ReflectionInternal[]>()
  private readonly timers = new Map<string, TimerInternal[]>()
  private readonly consents = new Map<string, AiConsent>()
  private readonly jobs = new Map<string, OutboxJobRecord>()
  private readonly jobLocks = new Map<string, Date>()

  constructor(private readonly now: () => Date = () => new Date()) {}

  async saveReflection(
    authUserId: string,
    reference: ProblemReference,
    input: SaveReflectionRequest,
  ) {
    const owner = parseAuthUserId(authUserId)
    const ref = parseReference(reference)
    const createdAt = this.now()
    const existing = (this.reflections.get(owner) ?? []).filter(
      (item) => referenceKey(item) === referenceKey(ref),
    )
    const reflection = reflectionInternalSchema.parse({
      id: randomUUID(),
      authUserId: owner,
      ...ref,
      perceivedDifficulty: input.perceivedDifficulty,
      ...(input.note === undefined ? {} : { note: input.note }),
      ...(input.statusActionId === undefined
        ? {}
        : { statusActionId: input.statusActionId }),
      ...(existing.at(-1) === undefined
        ? {}
        : { supersedesReflectionId: existing.at(-1)?.id }),
      createdAt,
      updatedAt: createdAt,
    })
    const all = this.reflections.get(owner) ?? []
    all.push(reflection)
    this.reflections.set(owner, all)
    return publicReflection(reflection)
  }

  async listReflections(authUserId: string, reference?: ProblemReference) {
    const owner = parseAuthUserId(authUserId)
    const parsedReference =
      reference === undefined ? undefined : parseReference(reference)
    return (this.reflections.get(owner) ?? [])
      .filter(
        (item) =>
          parsedReference === undefined ||
          referenceKey(item) === referenceKey(parsedReference),
      )
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      )
      .map(publicReflection)
  }

  async findRunningTimer(authUserId: string) {
    const owner = parseAuthUserId(authUserId)
    const timer = (this.timers.get(owner) ?? []).find(
      (item) => item.state === 'running',
    )
    if (timer === undefined) return null
    const now = this.now()
    if (currentDuration(timer, now) >= 14_400) {
      timer.durationSeconds = 14_400
      timer.state = 'capped'
      timer.requiresResolution = true
      timer.pausedAt = now
      timer.lastResumedAt = undefined
      timer.updatedAt = now
      return publicTimer(timer, now)
    }
    return publicTimer(timer, now)
  }

  async listTimerSessions(authUserId: string, reference?: ProblemReference) {
    const owner = parseAuthUserId(authUserId)
    const parsedReference =
      reference === undefined ? undefined : parseReference(reference)
    return (this.timers.get(owner) ?? [])
      .filter(
        (item) =>
          parsedReference === undefined ||
          referenceKey(item) === referenceKey(parsedReference),
      )
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      )
      .map((item) => publicTimer(item, this.now()))
  }

  async startTimer(
    authUserId: string,
    reference: ProblemReference,
    confirmSwitch: boolean,
  ) {
    const owner = parseAuthUserId(authUserId)
    const ref = parseReference(reference)
    const now = this.now()
    const all = this.timers.get(owner) ?? []
    const running = all.find((item) => item.state === 'running')
    let pausedSession: ProblemTimerSession | undefined

    const unresolved = all.find((item) => item.requiresResolution)
    if (unresolved !== undefined) {
      throw new TimerResolutionRequiredError(publicTimer(unresolved, now))
    }

    if (running !== undefined) {
      if (currentDuration(running, now) >= 14_400) {
        running.durationSeconds = 14_400
        running.state = 'capped'
        running.requiresResolution = true
        running.pausedAt = now
        running.lastResumedAt = undefined
        running.updatedAt = now
        throw new TimerResolutionRequiredError(publicTimer(running, now))
      }
    }

    const activeRunning = all.find((item) => item.state === 'running')
    if (activeRunning !== undefined) {
      if (!confirmSwitch) {
        throw new ActiveTimerError(publicTimer(activeRunning, now))
      }
      activeRunning.durationSeconds = currentDuration(activeRunning, now)
      activeRunning.state = 'paused'
      activeRunning.pausedAt = now
      activeRunning.lastResumedAt = undefined
      activeRunning.updatedAt = now
      pausedSession = publicTimer(activeRunning, now)
    }

    const session = timerInternalSchema.parse({
      id: randomUUID(),
      authUserId: owner,
      ...ref,
      state: 'running',
      durationSeconds: 0,
      startedAt: now,
      lastResumedAt: now,
      requiresResolution: false,
      createdAt: now,
      updatedAt: now,
    })
    all.push(session)
    this.timers.set(owner, all)
    return {
      session: publicTimer(session, now),
      ...(pausedSession === undefined ? {} : { pausedSession }),
    }
  }

  private findTimer(owner: string, sessionId: string) {
    const id = identifierSchema.parse(sessionId)
    const timer = (this.timers.get(owner) ?? []).find((item) => item.id === id)
    if (timer === undefined) {
      throw new TimerNotFoundError()
    }
    return timer
  }

  async pauseTimer(authUserId: string, sessionId: string) {
    const owner = parseAuthUserId(authUserId)
    const timer = this.findTimer(owner, sessionId)
    const now = this.now()
    if (timer.state === 'running') {
      timer.durationSeconds = currentDuration(timer, now)
      timer.state = timer.durationSeconds >= 14_400 ? 'capped' : 'paused'
      timer.requiresResolution = timer.state === 'capped'
      timer.pausedAt = now
      timer.lastResumedAt = undefined
      timer.updatedAt = now
    }
    return publicTimer(timer, now)
  }

  async resumeTimer(authUserId: string, sessionId: string) {
    const owner = parseAuthUserId(authUserId)
    const timer = this.findTimer(owner, sessionId)
    const now = this.now()
    if (timer.state !== 'paused') {
      return publicTimer(timer, now)
    }
    const running = (this.timers.get(owner) ?? []).find(
      (item) => item.state === 'running' && item.id !== timer.id,
    )
    if (running !== undefined) {
      throw new ActiveTimerError(publicTimer(running, now))
    }
    timer.state = 'running'
    timer.lastResumedAt = now
    timer.pausedAt = undefined
    timer.updatedAt = now
    return publicTimer(timer, now)
  }

  async resolveTimer(
    authUserId: string,
    sessionId: string,
    resolution: 'complete' | 'discard',
  ) {
    const owner = parseAuthUserId(authUserId)
    const timer = this.findTimer(owner, sessionId)
    const now = this.now()
    if (timer.state === 'completed' || timer.state === 'discarded') {
      return publicTimer(timer, now)
    }
    if (timer.state === 'running') {
      timer.durationSeconds = currentDuration(timer, now)
    }
    timer.state = resolution === 'complete' ? 'completed' : 'discarded'
    timer.requiresResolution = false
    timer.completedAt = now
    timer.lastResumedAt = undefined
    timer.updatedAt = now
    return publicTimer(timer, now)
  }

  async getConsent(authUserId: string) {
    const owner = parseAuthUserId(authUserId)
    const value = this.consents.get(owner)
    return value === undefined
      ? alwaysOnAiConsent()
      : alwaysOnAiConsent(
          value.decidedAt === undefined ? undefined : new Date(value.decidedAt),
        )
  }

  async saveConsent(
    authUserId: string,
    enabled: boolean,
    policyVersion: string,
  ) {
    const owner = parseAuthUserId(authUserId)
    void enabled
    void policyVersion
    const value = alwaysOnAiConsent(this.now())
    this.consents.set(owner, value)
    return value
  }

  async enqueueJob(input: Parameters<ProgressRepository['enqueueJob']>[0]) {
    const owner = parseAuthUserId(input.authUserId)
    const existing = [...this.jobs.values()].find(
      (job) => job.idempotencyKey === input.idempotencyKey,
    )
    if (existing !== undefined) {
      return outboxJobSchema.parse(existing)
    }
    const now = this.now()
    const job = outboxJobSchema.parse({
      id: randomUUID(),
      authUserId: owner,
      jobType: input.jobType,
      evidenceType: input.evidenceType,
      ...(input.evidenceId === undefined
        ? {}
        : { evidenceId: input.evidenceId }),
      ...(input.evidenceIds === undefined
        ? {}
        : { evidenceIds: input.evidenceIds }),
      ...(input.problemProvider === undefined
        ? {}
        : { problemProvider: input.problemProvider }),
      ...(input.problemExternalId === undefined
        ? {}
        : { problemExternalId: input.problemExternalId }),
      idempotencyKey: input.idempotencyKey,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    })
    this.jobs.set(job.id, job)
    return job
  }

  async claimNextJob(now = this.now()) {
    const staleBefore = new Date(now.getTime() - 60_000)
    const job = [...this.jobs.values()]
      .filter(
        (item) =>
          (item.status === 'pending' && item.nextAttemptAt <= now) ||
          (item.status === 'processing' &&
            (this.jobLocks.get(item.id)?.getTime() ?? 0) <=
              staleBefore.getTime()),
      )
      .sort(
        (left, right) =>
          left.nextAttemptAt.getTime() - right.nextAttemptAt.getTime(),
      )[0]
    if (job === undefined) {
      return null
    }
    job.status = 'processing'
    job.attempts += 1
    job.lockedAt = now
    this.jobLocks.set(job.id, now)
    job.updatedAt = now
    return outboxJobSchema.parse(job)
  }

  private ownsJobLease(job: OutboxJobRecord, lockedAt?: Date) {
    return (
      lockedAt === undefined ||
      (job.lockedAt !== undefined &&
        job.lockedAt.getTime() === lockedAt.getTime())
    )
  }

  async completeJob(jobId: string, lockedAt?: Date) {
    const job = this.jobs.get(identifierSchema.parse(jobId))
    if (job === undefined || !this.ownsJobLease(job, lockedAt)) return false
    job.status = 'completed'
    delete job.lockedAt
    this.jobLocks.delete(job.id)
    job.updatedAt = this.now()
    return true
  }

  async retryJob(
    jobId: string,
    nextAttemptAt: Date,
    errorCode: string,
    lockedAt?: Date,
  ) {
    const job = this.jobs.get(identifierSchema.parse(jobId))
    if (job === undefined || !this.ownsJobLease(job, lockedAt)) return false
    job.status = 'pending'
    job.nextAttemptAt = nextAttemptAt
    job.safeErrorCode = errorCode
    delete job.lockedAt
    this.jobLocks.delete(job.id)
    job.updatedAt = this.now()
    return true
  }

  async failJob(jobId: string, errorCode: string, lockedAt?: Date) {
    const job = this.jobs.get(identifierSchema.parse(jobId))
    if (job === undefined || !this.ownsJobLease(job, lockedAt)) return false
    job.status = 'failed'
    job.safeErrorCode = errorCode
    delete job.lockedAt
    this.jobLocks.delete(job.id)
    job.updatedAt = this.now()
    return true
  }

  async deleteProblemProgress(
    authUserId: string,
    reference: ProblemReference,
    additionalEvidenceIds: readonly string[] = [],
  ) {
    const owner = parseAuthUserId(authUserId)
    const ref = parseReference(reference)
    const evidenceIds = new Set([
      ...additionalEvidenceIds.map((evidenceId) =>
        identifierSchema.parse(evidenceId),
      ),
      ...(this.reflections.get(owner) ?? [])
        .filter((item) => referenceKey(item) === referenceKey(ref))
        .map((item) => item.id),
      ...(this.timers.get(owner) ?? [])
        .filter((item) => referenceKey(item) === referenceKey(ref))
        .map((item) => item.id),
    ])
    this.reflections.set(
      owner,
      (this.reflections.get(owner) ?? []).filter(
        (item) => referenceKey(item) !== referenceKey(ref),
      ),
    )
    this.timers.set(
      owner,
      (this.timers.get(owner) ?? []).filter(
        (item) => referenceKey(item) !== referenceKey(ref),
      ),
    )
    for (const [id, job] of this.jobs) {
      if (
        job.authUserId === owner &&
        job.evidenceId !== undefined &&
        evidenceIds.has(job.evidenceId)
      ) {
        this.jobs.delete(id)
        this.jobLocks.delete(id)
      }
    }
  }

  async requestDeleteAll(authUserId: string) {
    const owner = parseAuthUserId(authUserId)
    const now = this.now()
    for (const job of this.jobs.values()) {
      if (
        job.authUserId === owner &&
        job.jobType !== 'learner_data_deletion' &&
        (job.status === 'pending' || job.status === 'processing')
      ) {
        job.status = 'completed'
        delete job.lockedAt
        this.jobLocks.delete(job.id)
        job.updatedAt = now
      }
    }
    const existing = [...this.jobs.values()].find(
      (job) =>
        job.authUserId === owner &&
        job.jobType === 'learner_data_deletion' &&
        job.idempotencyKey === `delete-all:${owner}`,
    )
    if (existing?.status === 'failed') {
      existing.status = 'pending'
      existing.attempts = 0
      existing.nextAttemptAt = now
      delete existing.safeErrorCode
      delete existing.lockedAt
      this.jobLocks.delete(existing.id)
      existing.updatedAt = now
      return outboxJobSchema.parse(existing)
    }
    if (existing !== undefined) return outboxJobSchema.parse(existing)
    return this.enqueueJob({
      authUserId: owner,
      jobType: 'learner_data_deletion',
      evidenceType: 'learner',
      idempotencyKey: `delete-all:${owner}`,
    })
  }

  async deleteStatus(authUserId: string): Promise<DeleteAllDataStatus> {
    const owner = parseAuthUserId(authUserId)
    const deletionJobs = [...this.jobs.values()]
      .filter(
        (job) =>
          job.authUserId === owner && job.jobType === 'learner_data_deletion',
      )
      .sort(
        (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
      )
    const status = deletionJobs[0]?.status
    return status === 'pending' || status === 'processing'
      ? 'pending'
      : status === 'failed'
        ? 'failed'
        : 'completed'
  }

  async hasPendingDeletion(authUserId: string) {
    return (await this.deleteStatus(authUserId)) !== 'completed'
  }

  async deleteAllForAuthUser(authUserId: string) {
    const owner = parseAuthUserId(authUserId)
    this.reflections.delete(owner)
    this.timers.delete(owner)
    this.consents.delete(owner)
    for (const [id, job] of this.jobs) {
      if (job.authUserId === owner) this.jobs.delete(id)
      if (job.authUserId === owner) this.jobLocks.delete(id)
    }
  }

  async latestRelevantChangeAt(authUserId: string) {
    const owner = parseAuthUserId(authUserId)
    const dates = [
      ...(this.reflections.get(owner) ?? []).map((item) => item.createdAt),
      ...(this.timers.get(owner) ?? []).map((item) => item.updatedAt),
      ...[...this.jobs.values()]
        .filter((job) => job.authUserId === owner)
        .map((job) => job.updatedAt),
    ]
    return dates.sort((left, right) => right.getTime() - left.getTime())[0]
  }

  async pendingJobCount(authUserId: string) {
    const owner = parseAuthUserId(authUserId)
    return [...this.jobs.values()].filter(
      (job) =>
        job.authUserId === owner &&
        (job.status === 'pending' || job.status === 'processing') &&
        job.jobType === 'memory_generation',
    ).length
  }

  async listMemoryEvidenceIds(authUserId: string, reference: ProblemReference) {
    const owner = parseAuthUserId(authUserId)
    const ref = parseReference(reference)
    return [
      ...(this.reflections.get(owner) ?? [])
        .filter((item) => referenceKey(item) === referenceKey(ref))
        .map((item) => item.id),
      ...(this.timers.get(owner) ?? [])
        .filter((item) => referenceKey(item) === referenceKey(ref))
        .map((item) => item.id),
    ]
  }

  async getMemoryEvidence(
    authUserId: string,
    evidenceType: string,
    evidenceId: string,
  ): Promise<MemoryEvidencePayload | null> {
    parseAuthUserId(authUserId)
    identifierSchema.parse(evidenceId)
    void evidenceType
    return null
  }
}

export class ActiveTimerError extends Error {
  constructor(readonly activeTimer: ProblemTimerSession) {
    super('Another timer is already running for this learner.')
    this.name = 'ActiveTimerError'
  }
}

export class TimerNotFoundError extends Error {
  constructor() {
    super('The timer session could not be found.')
    this.name = 'TimerNotFoundError'
  }
}

export class TimerResolutionRequiredError extends Error {
  constructor(readonly activeTimer: ProblemTimerSession) {
    super('Save or discard the capped timer before starting another one.')
    this.name = 'TimerResolutionRequiredError'
  }
}

const databaseUser = async (
  prisma: Pick<PrismaClient, 'coreUser'>,
  authUserId: string,
) =>
  prisma.coreUser.upsert({
    where: { authUserId },
    create: { authUserId },
    update: {},
    select: { id: true, authUserId: true },
  })

export class PrismaProgressRepository implements ProgressRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async saveReflection(
    authUserId: string,
    reference: ProblemReference,
    input: SaveReflectionRequest,
  ) {
    const owner = parseAuthUserId(authUserId)
    const ref = parseReference(reference)
    const record = await this.prisma.$transaction(async (transaction) => {
      const user = await databaseUser(transaction, owner)
      if (input.statusActionId !== undefined) {
        const statusAction = await transaction.problemAction.findFirst({
          where: {
            id: input.statusActionId,
            userId: user.id,
            provider: ref.provider,
            externalId: ref.externalId,
            actionType: 'status_changed',
          },
          select: { id: true },
        })
        if (statusAction === null) {
          throw new Error(
            'The reflection status action is not owned by this learner or problem.',
          )
        }
      }
      const previous = await transaction.problemReflection.findFirst({
        where: {
          userId: user.id,
          provider: ref.provider,
          externalId: ref.externalId,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
      const created = await transaction.problemReflection.create({
        data: {
          userId: user.id,
          provider: ref.provider,
          externalId: ref.externalId,
          perceivedDifficulty: input.perceivedDifficulty,
          ...(input.note === undefined ? {} : { note: input.note }),
          ...(input.statusActionId === undefined
            ? {}
            : { statusActionId: input.statusActionId }),
          ...(previous === null ? {} : { supersedesReflectionId: previous.id }),
        },
      })
      return { user, created }
    })
    return publicReflection(
      reflectionInternalSchema.parse({
        id: record.created.id,
        authUserId: owner,
        provider: record.created.provider,
        externalId: record.created.externalId,
        perceivedDifficulty: record.created.perceivedDifficulty,
        ...(record.created.note === null ? {} : { note: record.created.note }),
        ...(record.created.statusActionId === null
          ? {}
          : { statusActionId: record.created.statusActionId }),
        ...(record.created.supersedesReflectionId === null
          ? {}
          : { supersedesReflectionId: record.created.supersedesReflectionId }),
        createdAt: record.created.createdAt,
        updatedAt: record.created.createdAt,
      }),
    )
  }

  async listReflections(authUserId: string, reference?: ProblemReference) {
    const owner = parseAuthUserId(authUserId)
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId: owner },
      select: { id: true },
    })
    if (user === null) return []
    const ref = reference === undefined ? undefined : parseReference(reference)
    const records = await this.prisma.problemReflection.findMany({
      where: {
        userId: user.id,
        ...(ref === undefined
          ? {}
          : { provider: ref.provider, externalId: ref.externalId }),
      },
      orderBy: { createdAt: 'desc' },
    })
    return records.map((record) =>
      publicReflection(
        reflectionInternalSchema.parse({
          id: record.id,
          authUserId: owner,
          provider: record.provider,
          externalId: record.externalId,
          perceivedDifficulty: record.perceivedDifficulty,
          ...(record.note === null ? {} : { note: record.note }),
          ...(record.statusActionId === null
            ? {}
            : { statusActionId: record.statusActionId }),
          ...(record.supersedesReflectionId === null
            ? {}
            : { supersedesReflectionId: record.supersedesReflectionId }),
          createdAt: record.createdAt,
          updatedAt: record.createdAt,
        }),
      ),
    )
  }

  private timerPublic(
    owner: string,
    record: {
      id: string
      provider: string
      externalId: string
      state: string
      durationSeconds: number
      startedAt: Date
      lastResumedAt: Date | null
      pausedAt: Date | null
      completedAt: Date | null
      requiresResolution: boolean
      createdAt: Date
      updatedAt: Date
    },
    now = new Date(),
  ) {
    return publicTimer(
      timerInternalSchema.parse({
        id: record.id,
        authUserId: owner,
        provider: record.provider,
        externalId: record.externalId,
        state: record.state,
        durationSeconds: record.durationSeconds,
        startedAt: record.startedAt,
        ...(record.lastResumedAt === null
          ? {}
          : { lastResumedAt: record.lastResumedAt }),
        ...(record.pausedAt === null ? {} : { pausedAt: record.pausedAt }),
        ...(record.completedAt === null
          ? {}
          : { completedAt: record.completedAt }),
        requiresResolution: record.requiresResolution,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }),
      now,
    )
  }

  async findRunningTimer(authUserId: string) {
    const owner = parseAuthUserId(authUserId)
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.coreUser.findUnique({
        where: { authUserId: owner },
        select: { id: true },
      })
      if (user === null) return null
      await transaction.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${user.id} AS text), 0))`,
      )
      let record = await transaction.problemTimerSession.findFirst({
        where: { userId: user.id, state: 'running' },
      })
      if (record !== null && record.lastResumedAt !== null) {
        const now = new Date()
        const duration =
          record.durationSeconds +
          Math.floor((now.getTime() - record.lastResumedAt.getTime()) / 1_000)
        if (duration >= 14_400) {
          record = await transaction.problemTimerSession.update({
            where: { id: record.id },
            data: {
              state: 'capped',
              durationSeconds: 14_400,
              requiresResolution: true,
              pausedAt: now,
              lastResumedAt: null,
            },
          })
        }
      }
      return record === null ? null : this.timerPublic(owner, record)
    })
  }

  async listTimerSessions(authUserId: string, reference?: ProblemReference) {
    const owner = parseAuthUserId(authUserId)
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId: owner },
      select: { id: true },
    })
    if (user === null) return []
    const ref = reference === undefined ? undefined : parseReference(reference)
    const records = await this.prisma.problemTimerSession.findMany({
      where: {
        userId: user.id,
        ...(ref === undefined
          ? {}
          : { provider: ref.provider, externalId: ref.externalId }),
      },
      orderBy: { createdAt: 'desc' },
    })
    return records.map((record) => this.timerPublic(owner, record))
  }

  async startTimer(
    authUserId: string,
    reference: ProblemReference,
    confirmSwitch: boolean,
  ) {
    const owner = parseAuthUserId(authUserId)
    const ref = parseReference(reference)
    const now = new Date()
    const result = await this.prisma.$transaction(async (transaction) => {
      const user = await databaseUser(transaction, owner)
      await transaction.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${user.id} AS text), 0))`,
      )
      const unresolved = await transaction.problemTimerSession.findFirst({
        where: { userId: user.id, requiresResolution: true },
      })
      if (unresolved !== null) {
        return {
          created: null,
          pausedSession: undefined,
          resolutionRequired: this.timerPublic(owner, unresolved, now),
        }
      }
      let running = await transaction.problemTimerSession.findFirst({
        where: { userId: user.id, state: 'running' },
      })
      if (
        running !== null &&
        running.lastResumedAt !== null &&
        Math.floor((now.getTime() - running.lastResumedAt.getTime()) / 1_000) +
          running.durationSeconds >=
          14_400
      ) {
        const capped = await transaction.problemTimerSession.update({
          where: { id: running.id },
          data: {
            state: 'capped',
            durationSeconds: 14_400,
            requiresResolution: true,
            pausedAt: now,
            lastResumedAt: null,
          },
        })
        return {
          created: null,
          pausedSession: undefined,
          resolutionRequired: this.timerPublic(owner, capped, now),
        }
      }
      if (running !== null && !confirmSwitch)
        throw new ActiveTimerError(this.timerPublic(owner, running, now))
      let pausedSession: ProblemTimerSession | undefined
      if (running !== null) {
        const duration = Math.min(
          14_400,
          running.durationSeconds +
            Math.floor(
              (now.getTime() -
                (running.lastResumedAt ?? running.startedAt).getTime()) /
                1_000,
            ),
        )
        const paused = await transaction.problemTimerSession.update({
          where: { id: running.id },
          data: {
            durationSeconds: duration,
            state: duration >= 14_400 ? 'capped' : 'paused',
            requiresResolution: duration >= 14_400,
            pausedAt: now,
            lastResumedAt: null,
          },
        })
        pausedSession = this.timerPublic(owner, paused, now)
      }
      const created = await transaction.problemTimerSession.create({
        data: {
          userId: user.id,
          provider: ref.provider,
          externalId: ref.externalId,
          state: 'running',
          durationSeconds: 0,
          startedAt: now,
          lastResumedAt: now,
        },
      })
      return { created, pausedSession, resolutionRequired: undefined }
    })
    if (result.resolutionRequired !== undefined) {
      throw new TimerResolutionRequiredError(result.resolutionRequired)
    }
    if (result.created === null) {
      throw new Error('The timer could not be started.')
    }
    return {
      session: this.timerPublic(owner, result.created, now),
      ...(result.pausedSession === undefined
        ? {}
        : { pausedSession: result.pausedSession }),
    }
  }

  async pauseTimer(authUserId: string, sessionId: string) {
    const owner = parseAuthUserId(authUserId)
    const id = identifierSchema.parse(sessionId)
    return this.prisma.$transaction(async (transaction) => {
      const user = await databaseUser(transaction, owner)
      await transaction.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${user.id} AS text), 0))`,
      )
      const record = await transaction.problemTimerSession.findFirst({
        where: { id, userId: user.id },
      })
      if (record === null) throw new TimerNotFoundError()
      if (record.state !== 'running') return this.timerPublic(owner, record)
      const now = new Date()
      const duration = Math.min(
        14_400,
        record.durationSeconds +
          Math.floor(
            (now.getTime() -
              (record.lastResumedAt ?? record.startedAt).getTime()) /
              1_000,
          ),
      )
      const updated = await transaction.problemTimerSession.update({
        where: { id: record.id },
        data: {
          durationSeconds: duration,
          state: duration >= 14_400 ? 'capped' : 'paused',
          requiresResolution: duration >= 14_400,
          pausedAt: now,
          lastResumedAt: null,
        },
      })
      return this.timerPublic(owner, updated, now)
    })
  }

  async resumeTimer(authUserId: string, sessionId: string) {
    const owner = parseAuthUserId(authUserId)
    const id = identifierSchema.parse(sessionId)
    return this.prisma.$transaction(async (transaction) => {
      const user = await databaseUser(transaction, owner)
      await transaction.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${user.id} AS text), 0))`,
      )
      const record = await transaction.problemTimerSession.findFirst({
        where: { id, userId: user.id },
      })
      if (record === null) throw new TimerNotFoundError()
      if (record.state !== 'paused') return this.timerPublic(owner, record)
      const running = await transaction.problemTimerSession.findFirst({
        where: { userId: user.id, state: 'running' },
      })
      if (running !== null)
        throw new ActiveTimerError(this.timerPublic(owner, running))
      const updated = await transaction.problemTimerSession.update({
        where: { id: record.id },
        data: { state: 'running', lastResumedAt: new Date(), pausedAt: null },
      })
      return this.timerPublic(owner, updated)
    })
  }

  async resolveTimer(
    authUserId: string,
    sessionId: string,
    resolution: 'complete' | 'discard',
  ) {
    const owner = parseAuthUserId(authUserId)
    const id = identifierSchema.parse(sessionId)
    return this.prisma.$transaction(async (transaction) => {
      const user = await databaseUser(transaction, owner)
      await transaction.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${user.id} AS text), 0))`,
      )
      const record = await transaction.problemTimerSession.findFirst({
        where: { id, userId: user.id },
      })
      if (record === null) throw new TimerNotFoundError()
      const now = new Date()
      if (record.state === 'completed' || record.state === 'discarded') {
        return this.timerPublic(owner, record, now)
      }
      const duration =
        record.state === 'running'
          ? Math.min(
              14_400,
              record.durationSeconds +
                Math.floor(
                  (now.getTime() -
                    (record.lastResumedAt ?? record.startedAt).getTime()) /
                    1_000,
                ),
            )
          : record.durationSeconds
      const updated = await transaction.problemTimerSession.update({
        where: { id: record.id },
        data: {
          durationSeconds: duration,
          state: resolution === 'complete' ? 'completed' : 'discarded',
          completedAt: now,
          lastResumedAt: null,
          requiresResolution: false,
        },
      })
      return this.timerPublic(owner, updated, now)
    })
  }

  async getConsent(authUserId: string) {
    const owner = parseAuthUserId(authUserId)
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId: owner },
      select: { id: true },
    })
    if (user === null) return alwaysOnAiConsent()
    const record = await this.prisma.learnerAiConsent.findFirst({
      where: { userId: user.id },
      orderBy: { occurredAt: 'desc' },
    })
    return record === null
      ? alwaysOnAiConsent()
      : alwaysOnAiConsent(record.occurredAt)
  }

  async saveConsent(
    authUserId: string,
    enabled: boolean,
    policyVersion: string,
  ) {
    const owner = parseAuthUserId(authUserId)
    void enabled
    void policyVersion
    const record = await this.prisma.$transaction(async (transaction) => {
      const user = await databaseUser(transaction, owner)
      return transaction.learnerAiConsent.create({
        data: {
          userId: user.id,
          enabled: true,
          policyVersion: AI_CONSENT_POLICY_VERSION,
        },
      })
    })
    return alwaysOnAiConsent(record.occurredAt)
  }

  async enqueueJob(input: Parameters<ProgressRepository['enqueueJob']>[0]) {
    const owner = parseAuthUserId(input.authUserId)
    const record = await this.prisma.$transaction(async (transaction) => {
      const user = await databaseUser(transaction, owner)
      return transaction.outboxJob.upsert({
        where: { idempotencyKey: input.idempotencyKey },
        create: {
          userId: user.id,
          jobType: input.jobType,
          evidenceType: input.evidenceType,
          ...(input.evidenceId === undefined
            ? {}
            : { evidenceId: input.evidenceId }),
          ...(input.evidenceIds === undefined
            ? {}
            : { evidenceIds: input.evidenceIds }),
          ...(input.problemProvider === undefined
            ? {}
            : { problemProvider: input.problemProvider }),
          ...(input.problemExternalId === undefined
            ? {}
            : { problemExternalId: input.problemExternalId }),
          idempotencyKey: input.idempotencyKey,
        },
        update: {},
        include: { user: { select: { authUserId: true } } },
      })
    })
    return this.jobPublic(record)
  }

  private jobPublic(record: {
    id: string
    user?: { authUserId: string } | null
    userId: string
    jobType: string
    evidenceType: string
    evidenceId: string | null
    evidenceIds: unknown
    problemProvider: string | null
    problemExternalId: string | null
    idempotencyKey: string
    status: string
    attempts: number
    nextAttemptAt: Date
    lockedAt: Date | null
    safeErrorCode: string | null
    createdAt: Date
    updatedAt: Date
  }) {
    const evidenceIds = z
      .array(identifierSchema)
      .max(256)
      .safeParse(record.evidenceIds)
    return outboxJobSchema.parse({
      id: record.id,
      authUserId: record.user?.authUserId ?? record.userId,
      jobType: record.jobType,
      evidenceType: record.evidenceType,
      ...(record.evidenceId === null ? {} : { evidenceId: record.evidenceId }),
      ...(evidenceIds.success ? { evidenceIds: evidenceIds.data } : {}),
      ...(record.problemProvider === null
        ? {}
        : { problemProvider: record.problemProvider }),
      ...(record.problemExternalId === null
        ? {}
        : { problemExternalId: record.problemExternalId }),
      idempotencyKey: record.idempotencyKey,
      status: record.status,
      attempts: record.attempts,
      nextAttemptAt: record.nextAttemptAt,
      ...(record.lockedAt === null ? {} : { lockedAt: record.lockedAt }),
      ...(record.safeErrorCode === null
        ? {}
        : { safeErrorCode: record.safeErrorCode }),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    })
  }

  async claimNextJob(now = new Date()) {
    const staleBefore = new Date(now.getTime() - 60_000)
    const record = await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          UPDATE "core"."outbox_jobs"
          SET "status" = 'processing',
              "attempts" = "attempts" + 1,
              "locked_at" = ${now},
              "updated_at" = ${now}
          WHERE "id" = (
            SELECT "id"
            FROM "core"."outbox_jobs"
            WHERE (
                "status" = 'pending'
                AND "next_attempt_at" <= ${now}
              )
              OR (
                "status" = 'processing'
                AND "locked_at" IS NOT NULL
                AND "locked_at" <= ${staleBefore}
              )
            ORDER BY "next_attempt_at" ASC, "created_at" ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )
          RETURNING "id"
        `,
      )
      const id = claimed[0]?.id
      if (id === undefined) return null
      return transaction.outboxJob.findUnique({
        where: { id },
        include: { user: { select: { authUserId: true } } },
      })
    })
    return record === null ? null : this.jobPublic(record)
  }

  async completeJob(jobId: string, lockedAt?: Date) {
    const result = await this.prisma.outboxJob.updateMany({
      where: {
        id: identifierSchema.parse(jobId),
        status: 'processing',
        ...(lockedAt === undefined ? {} : { lockedAt }),
      },
      data: { status: 'completed', lockedAt: null },
    })
    return result.count > 0
  }

  async retryJob(
    jobId: string,
    nextAttemptAt: Date,
    errorCode: string,
    lockedAt?: Date,
  ) {
    const result = await this.prisma.outboxJob.updateMany({
      where: {
        id: identifierSchema.parse(jobId),
        status: 'processing',
        ...(lockedAt === undefined ? {} : { lockedAt }),
      },
      data: {
        status: 'pending',
        nextAttemptAt,
        safeErrorCode: errorCode,
        lockedAt: null,
      },
    })
    return result.count > 0
  }

  async failJob(jobId: string, errorCode: string, lockedAt?: Date) {
    const result = await this.prisma.outboxJob.updateMany({
      where: {
        id: identifierSchema.parse(jobId),
        status: 'processing',
        ...(lockedAt === undefined ? {} : { lockedAt }),
      },
      data: { status: 'failed', safeErrorCode: errorCode, lockedAt: null },
    })
    return result.count > 0
  }

  async deleteProblemProgress(
    authUserId: string,
    reference: ProblemReference,
    additionalEvidenceIds: readonly string[] = [],
  ) {
    const owner = parseAuthUserId(authUserId)
    const ref = parseReference(reference)
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId: owner },
      select: { id: true },
    })
    if (user === null) return
    const [reflections, timers, actions] = await Promise.all([
      this.prisma.problemReflection.findMany({
        where: {
          userId: user.id,
          provider: ref.provider,
          externalId: ref.externalId,
        },
        select: { id: true },
      }),
      this.prisma.problemTimerSession.findMany({
        where: {
          userId: user.id,
          provider: ref.provider,
          externalId: ref.externalId,
        },
        select: { id: true },
      }),
      this.prisma.problemAction.findMany({
        where: {
          userId: user.id,
          provider: ref.provider,
          externalId: ref.externalId,
        },
        select: { id: true },
      }),
    ])
    const evidenceIds = [
      ...additionalEvidenceIds.map((evidenceId) =>
        identifierSchema.parse(evidenceId),
      ),
      ...reflections.map((record) => record.id),
      ...timers.map((record) => record.id),
      ...actions.map((record) => record.id),
    ]
    await this.prisma.$transaction([
      this.prisma.outboxJob.deleteMany({
        where: { userId: user.id, evidenceId: { in: evidenceIds } },
      }),
      this.prisma.problemReflection.deleteMany({
        where: {
          userId: user.id,
          provider: ref.provider,
          externalId: ref.externalId,
        },
      }),
      this.prisma.problemTimerSession.deleteMany({
        where: {
          userId: user.id,
          provider: ref.provider,
          externalId: ref.externalId,
        },
      }),
      this.prisma.problemAction.deleteMany({
        where: {
          userId: user.id,
          provider: ref.provider,
          externalId: ref.externalId,
        },
      }),
    ])
  }

  async requestDeleteAll(authUserId: string) {
    const owner = parseAuthUserId(authUserId)
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId: owner },
      select: { id: true },
    })
    if (user !== null) {
      await this.prisma.outboxJob.updateMany({
        where: {
          userId: user.id,
          jobType: { not: 'learner_data_deletion' },
          status: { in: ['pending', 'processing'] },
        },
        data: { status: 'completed' },
      })

      const existing = await this.prisma.outboxJob.findUnique({
        where: { idempotencyKey: `delete-all:${owner}` },
        include: { user: { select: { authUserId: true } } },
      })
      if (existing?.status === 'failed') {
        const retried = await this.prisma.outboxJob.update({
          where: { id: existing.id },
          data: {
            status: 'pending',
            attempts: 0,
            nextAttemptAt: new Date(),
            safeErrorCode: null,
            lockedAt: null,
          },
          include: { user: { select: { authUserId: true } } },
        })
        return this.jobPublic(retried)
      }
      if (existing !== null) return this.jobPublic(existing)
    }
    return this.enqueueJob({
      authUserId: owner,
      jobType: 'learner_data_deletion',
      evidenceType: 'learner',
      idempotencyKey: `delete-all:${owner}`,
    })
  }

  async deleteStatus(authUserId: string): Promise<DeleteAllDataStatus> {
    const owner = parseAuthUserId(authUserId)
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId: owner },
      select: { id: true },
    })
    if (user === null) return 'completed'
    const job = await this.prisma.outboxJob.findFirst({
      where: { userId: user.id, jobType: 'learner_data_deletion' },
      orderBy: { updatedAt: 'desc' },
      select: { status: true },
    })
    return job?.status === 'pending' || job?.status === 'processing'
      ? 'pending'
      : job?.status === 'failed'
        ? 'failed'
        : 'completed'
  }

  async hasPendingDeletion(authUserId: string) {
    return (await this.deleteStatus(authUserId)) !== 'completed'
  }

  async deleteAllForAuthUser(authUserId: string) {
    const owner = parseAuthUserId(authUserId)
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId: owner },
      select: { id: true },
    })
    if (user === null) return
    await this.prisma.coreUser.delete({ where: { id: user.id } })
  }

  async latestRelevantChangeAt(authUserId: string) {
    const owner = parseAuthUserId(authUserId)
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId: owner },
      select: { id: true },
    })
    if (user === null) return undefined
    const [reflection, timer, outbox] = await Promise.all([
      this.prisma.problemReflection.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.problemTimerSession.findFirst({
        where: { userId: user.id },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
      this.prisma.outboxJob.findFirst({
        where: { userId: user.id },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ])
    const dates = [
      reflection?.createdAt,
      timer?.updatedAt,
      outbox?.updatedAt,
    ].filter((date): date is Date => date !== undefined)
    return dates.sort((left, right) => right.getTime() - left.getTime())[0]
  }

  async pendingJobCount(authUserId: string) {
    const owner = parseAuthUserId(authUserId)
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId: owner },
      select: { id: true },
    })
    if (user === null) return 0
    return this.prisma.outboxJob.count({
      where: {
        userId: user.id,
        jobType: 'memory_generation',
        status: { in: ['pending', 'processing'] },
      },
    })
  }

  async listMemoryEvidenceIds(authUserId: string, reference: ProblemReference) {
    const owner = parseAuthUserId(authUserId)
    const ref = parseReference(reference)
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId: owner },
      select: { id: true },
    })
    if (user === null) return []
    const [reflections, timers, actions] = await Promise.all([
      this.prisma.problemReflection.findMany({
        where: {
          userId: user.id,
          provider: ref.provider,
          externalId: ref.externalId,
        },
        select: { id: true },
      }),
      this.prisma.problemTimerSession.findMany({
        where: {
          userId: user.id,
          provider: ref.provider,
          externalId: ref.externalId,
        },
        select: { id: true },
      }),
      this.prisma.problemAction.findMany({
        where: {
          userId: user.id,
          provider: ref.provider,
          externalId: ref.externalId,
        },
        select: { id: true },
      }),
    ])
    return [
      ...reflections.map((record) => record.id),
      ...timers.map((record) => record.id),
      ...actions.map((record) => record.id),
    ]
  }

  async getMemoryEvidence(
    authUserId: string,
    evidenceType: string,
    evidenceId: string,
  ): Promise<MemoryEvidencePayload | null> {
    const owner = parseAuthUserId(authUserId)
    const id = identifierSchema.parse(evidenceId)
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId: owner },
      select: { id: true },
    })
    if (user === null) return null

    if (evidenceType === 'reflection') {
      const reflection = await this.prisma.problemReflection.findFirst({
        where: { id, userId: user.id },
      })
      if (reflection === null) return null
      return {
        occurredAt: reflection.createdAt,
        ...(reflection.note === null ? {} : { note: reflection.note }),
        perceivedDifficulty: reflection.perceivedDifficulty as
          'easy' | 'medium' | 'hard',
        problemProvider: ProviderKeySchema.parse(reflection.provider),
        problemExternalId: reflection.externalId,
      }
    }

    if (evidenceType === 'timer') {
      const timer = await this.prisma.problemTimerSession.findFirst({
        where: { id, userId: user.id },
      })
      if (timer === null) return null
      return {
        occurredAt: timer.completedAt ?? timer.updatedAt,
        timeSpentMinutes: Math.floor(timer.durationSeconds / 60),
        problemProvider: ProviderKeySchema.parse(timer.provider),
        problemExternalId: timer.externalId,
      }
    }

    if (
      evidenceType === 'status_action' ||
      evidenceType === 'manual_progress'
    ) {
      const action = await this.prisma.problemAction.findFirst({
        where: { id, userId: user.id, actionType: 'status_changed' },
      })
      if (action === null) return null
      return {
        occurredAt: action.occurredAt,
        ...(action.learnerStatus === null
          ? {}
          : {
              problemStatus: action.learnerStatus as
                'unsolved' | 'attempted' | 'solved',
            }),
        problemProvider: ProviderKeySchema.parse(action.provider),
        problemExternalId: action.externalId,
      }
    }

    return null
  }
}
