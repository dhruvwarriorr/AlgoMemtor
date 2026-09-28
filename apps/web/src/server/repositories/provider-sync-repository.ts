import { randomUUID } from 'node:crypto'

import {
  ProviderKeySchema,
  ProviderSyncJobSchema,
  ProviderSyncStateSchema,
  type ProviderKey,
  type ProviderSyncJob,
  type ProviderSyncState,
} from '@algomemtor/shared-contracts'

import type { PrismaClient } from '../generated/prisma/client'

export type ProviderSyncJobRecord = ProviderSyncJob & {
  userId: string
  providerAccountId?: string
  jobType: string
  idempotencyKey: string
  leaseOwner?: string
  leaseExpiresAt?: Date
}

export type EnqueueProviderSyncInput = {
  userId: string
  providerAccountId: string
  provider: ProviderKey
  capability: string
  jobType: string
  idempotencyKey: string
  cursor?: string
  runAfter?: Date
}

export interface ProviderSyncRepository {
  enqueue(input: EnqueueProviderSyncInput): Promise<{
    job: ProviderSyncJobRecord
    accepted: boolean
  }>
  findLatest(
    userId: string,
    provider: ProviderKey,
    providerAccountId?: string,
    jobType?: string,
  ): Promise<ProviderSyncJobRecord | null>
  getState(
    userId: string,
    provider: ProviderKey,
    providerAccountId?: string,
  ): Promise<ProviderSyncState>
  saveState(
    userId: string,
    provider: ProviderKey,
    state: Omit<ProviderSyncState, 'provider'>,
    providerAccountId?: string,
  ): Promise<ProviderSyncState>
  // With an auth user ID, only that learner's jobs are claimed.
  claimNext(
    leaseOwner: string,
    now?: Date,
    leaseMs?: number,
    authUserId?: string,
  ): Promise<ProviderSyncJobRecord | null>
  // Whether this learner has a job that is running or due to run now.
  hasPendingJob?(authUserId: string, now?: Date): Promise<boolean>
  complete(jobId: string, leaseOwner: string): Promise<boolean>
  markFailed(
    jobId: string,
    leaseOwner: string,
    errorCode: string,
  ): Promise<boolean>
  fail(
    jobId: string,
    leaseOwner: string,
    errorCode: string,
    retryAt: Date,
  ): Promise<boolean>
  deleteHistory(userId: string, provider: ProviderKey): Promise<void>
}

const toProviderJob = (
  record: {
    id: string
    userId: string | null
    providerAccountId: string | null
    provider: string
    capability: string
    jobType: string
    status: string
    runAfter: Date
    cursor: string | null
    attempts: number
    lastErrorCode: string | null
    createdAt: Date
    leaseOwner: string | null
    leaseExpiresAt: Date | null
    idempotencyKey: string
  },
  authUserId?: string,
): ProviderSyncJobRecord => {
  const provider = ProviderKeySchema.parse(record.provider)
  if (record.userId === null) {
    throw new Error('A learner provider-sync job requires a user.')
  }
  return {
    id: record.id,
    userId: authUserId ?? record.userId,
    ...(record.providerAccountId === null
      ? {}
      : { providerAccountId: record.providerAccountId }),
    provider,
    capability: record.capability,
    jobType: record.jobType,
    status: ProviderSyncJobSchema.shape.status.parse(record.status),
    queuedAt: record.createdAt.toISOString(),
    runAfter: record.runAfter.toISOString(),
    ...(record.cursor === null ? {} : { cursor: record.cursor }),
    attempts: record.attempts,
    ...(record.lastErrorCode === null
      ? {}
      : { lastErrorCode: record.lastErrorCode }),
    idempotencyKey: record.idempotencyKey,
    ...(record.leaseOwner === null ? {} : { leaseOwner: record.leaseOwner }),
    ...(record.leaseExpiresAt === null
      ? {}
      : { leaseExpiresAt: record.leaseExpiresAt }),
  }
}

const defaultState = (provider: ProviderKey): ProviderSyncState =>
  ProviderSyncStateSchema.parse({
    provider,
    capability: 'linked_user_sync',
    status: 'idle',
    attempts: 0,
    completeness: 'unknown',
    stale: false,
  })

const stateKey = (
  userId: string,
  provider: ProviderKey,
  providerAccountId?: string,
) => `${userId}:${provider}:${providerAccountId ?? 'global'}`

const databaseStateScopeKey = (userId: string, providerAccountId?: string) =>
  providerAccountId === undefined
    ? `user:${userId}`
    : `user:${userId}:account:${providerAccountId}`

export class InMemoryProviderSyncRepository implements ProviderSyncRepository {
  private readonly jobs = new Map<string, ProviderSyncJobRecord>()
  private readonly states = new Map<string, ProviderSyncState>()

  async enqueue(input: EnqueueProviderSyncInput) {
    const existing = [...this.jobs.values()].find(
      (job) => job.idempotencyKey === input.idempotencyKey,
    )
    if (existing !== undefined) return { job: existing, accepted: false }
    const now = new Date()
    const job: ProviderSyncJobRecord = {
      id: randomUUID(),
      userId: input.userId,
      providerAccountId: input.providerAccountId,
      provider: ProviderKeySchema.parse(input.provider),
      capability: input.capability,
      jobType: input.jobType,
      status: 'queued',
      queuedAt: now.toISOString(),
      runAfter: (input.runAfter ?? now).toISOString(),
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      attempts: 0,
      idempotencyKey: input.idempotencyKey,
    }
    this.jobs.set(job.id, job)
    const key = stateKey(input.userId, input.provider, input.providerAccountId)
    this.states.set(key, {
      ...(this.states.get(key) ?? defaultState(input.provider)),
      status: 'queued',
      nextRunAt: job.runAfter,
    })
    return { job, accepted: true }
  }

  async findLatest(
    userId: string,
    provider: ProviderKey,
    providerAccountId?: string,
    jobType?: string,
  ) {
    return (
      [...this.jobs.values()]
        .filter(
          (job) =>
            job.userId === userId &&
            job.provider === provider &&
            (providerAccountId === undefined ||
              job.providerAccountId === providerAccountId) &&
            (jobType === undefined || job.jobType === jobType),
        )
        .sort((left, right) =>
          right.queuedAt.localeCompare(left.queuedAt),
        )[0] ?? null
    )
  }

  async getState(
    userId: string,
    provider: ProviderKey,
    providerAccountId?: string,
  ) {
    return (
      this.states.get(stateKey(userId, provider, providerAccountId)) ??
      defaultState(provider)
    )
  }

  async saveState(
    userId: string,
    provider: ProviderKey,
    state: Omit<ProviderSyncState, 'provider'>,
    providerAccountId?: string,
  ) {
    const parsed = ProviderSyncStateSchema.parse({ ...state, provider })
    this.states.set(stateKey(userId, provider, providerAccountId), parsed)
    return parsed
  }

  private isDue(job: ProviderSyncJobRecord, now: Date) {
    return (
      (job.status === 'queued' && new Date(job.runAfter) <= now) ||
      (job.status === 'running' &&
        job.leaseExpiresAt !== undefined &&
        job.leaseExpiresAt <= now)
    )
  }

  async hasPendingJob(authUserId: string, now = new Date()) {
    return [...this.jobs.values()].some(
      (job) =>
        job.userId === authUserId &&
        (job.status === 'running' || this.isDue(job, now)),
    )
  }

  async claimNext(
    leaseOwner: string,
    now = new Date(),
    leaseMs = 60_000,
    authUserId?: string,
  ) {
    const candidate = [...this.jobs.values()]
      .filter(
        (job) =>
          (authUserId === undefined || job.userId === authUserId) &&
          this.isDue(job, now),
      )
      .sort((left, right) => left.runAfter.localeCompare(right.runAfter))[0]
    if (candidate === undefined) return null
    const updated: ProviderSyncJobRecord = {
      ...candidate,
      status: 'running',
      attempts: candidate.attempts + 1,
      leaseOwner,
      leaseExpiresAt: new Date(now.getTime() + leaseMs),
    }
    this.jobs.set(updated.id, updated)
    return updated
  }

  async complete(jobId: string, leaseOwner: string) {
    const job = this.jobs.get(jobId)
    if (job === undefined || job.leaseOwner !== leaseOwner) return false
    this.jobs.set(jobId, { ...job, status: 'completed' })
    return true
  }

  async markFailed(jobId: string, leaseOwner: string, errorCode: string) {
    const job = this.jobs.get(jobId)
    if (job === undefined || job.leaseOwner !== leaseOwner) return false
    const {
      leaseOwner: _owner,
      leaseExpiresAt: _expires,
      ...withoutLease
    } = job
    this.jobs.set(jobId, {
      ...withoutLease,
      status: 'failed',
      lastErrorCode: errorCode,
    })
    return true
  }

  async fail(
    jobId: string,
    leaseOwner: string,
    errorCode: string,
    retryAt: Date,
  ) {
    const job = this.jobs.get(jobId)
    if (job === undefined || job.leaseOwner !== leaseOwner) return false
    const {
      leaseOwner: _previousLeaseOwner,
      leaseExpiresAt: _previousLeaseExpiresAt,
      ...withoutLease
    } = job
    this.jobs.set(jobId, {
      ...withoutLease,
      status: 'queued',
      runAfter: retryAt.toISOString(),
      lastErrorCode: errorCode,
    })
    return true
  }

  async deleteHistory(userId: string, provider: ProviderKey) {
    for (const [id, job] of this.jobs) {
      if (job.userId === userId && job.provider === provider)
        this.jobs.delete(id)
    }
    for (const key of this.states.keys()) {
      if (key.startsWith(`${userId}:${provider}:`)) this.states.delete(key)
    }
  }
}

export class PrismaProviderSyncRepository implements ProviderSyncRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private async internalUserId(authUserId: string) {
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId },
      select: { id: true },
    })
    return user?.id ?? null
  }

  async enqueue(input: EnqueueProviderSyncInput) {
    const existing = await this.prisma.providerSyncJob.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    })
    if (existing !== null) {
      const owner =
        existing.userId === null
          ? null
          : await this.prisma.coreUser.findUnique({
              where: { id: existing.userId },
              select: { authUserId: true },
            })
      return {
        job: toProviderJob(existing, owner?.authUserId),
        accepted: false,
      }
    }
    const userId = await this.internalUserId(input.userId)
    if (userId === null) {
      throw new Error(
        'The learner must exist before queuing provider synchronization.',
      )
    }
    const record = await this.prisma.providerSyncJob.create({
      data: {
        userId,
        providerAccountId: input.providerAccountId,
        provider: ProviderKeySchema.parse(input.provider),
        capability: input.capability,
        jobType: input.jobType,
        idempotencyKey: input.idempotencyKey,
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
        ...(input.runAfter === undefined ? {} : { runAfter: input.runAfter }),
      },
    })
    return { job: toProviderJob(record, input.userId), accepted: true }
  }

  async findLatest(
    userId: string,
    provider: ProviderKey,
    providerAccountId?: string,
    jobType?: string,
  ) {
    const internalUserId = await this.internalUserId(userId)
    if (internalUserId === null) return null
    const record = await this.prisma.providerSyncJob.findFirst({
      where: {
        userId: internalUserId,
        provider: ProviderKeySchema.parse(provider),
        ...(providerAccountId === undefined ? {} : { providerAccountId }),
        ...(jobType === undefined ? {} : { jobType }),
      },
      orderBy: { createdAt: 'desc' },
    })
    return record === null ? null : toProviderJob(record, userId)
  }

  async getState(
    userId: string,
    provider: ProviderKey,
    providerAccountId?: string,
  ) {
    const internalUserId = await this.internalUserId(userId)
    if (internalUserId === null) return defaultState(provider)
    const record = await this.prisma.providerSyncState.findFirst({
      where: {
        userId: internalUserId,
        provider: ProviderKeySchema.parse(provider),
        ...(providerAccountId === undefined ? {} : { providerAccountId }),
      },
      orderBy: { updatedAt: 'desc' },
    })
    if (record === null) return defaultState(provider)
    return ProviderSyncStateSchema.parse({
      provider: provider,
      capability: record.capability,
      status: record.status,
      ...(record.cursor === null ? {} : { cursor: record.cursor }),
      ...(record.lastStartedAt === null
        ? {}
        : { lastStartedAt: record.lastStartedAt.toISOString() }),
      ...(record.lastSucceededAt === null
        ? {}
        : { lastSucceededAt: record.lastSucceededAt.toISOString() }),
      ...(record.nextRunAt === null
        ? {}
        : { nextRunAt: record.nextRunAt.toISOString() }),
      attempts: record.attempts,
      ...(record.lastErrorCode === null
        ? {}
        : { lastErrorCode: record.lastErrorCode }),
      completeness: record.completeness,
      stale: record.stale,
    })
  }

  async saveState(
    userId: string,
    provider: ProviderKey,
    state: Omit<ProviderSyncState, 'provider'>,
    providerAccountId?: string,
  ) {
    const validatedProvider = ProviderKeySchema.parse(provider)
    const internalUserId = await this.internalUserId(userId)
    if (internalUserId === null) {
      throw new Error(
        'The learner must exist before saving provider synchronization state.',
      )
    }
    const scopeKey = databaseStateScopeKey(internalUserId, providerAccountId)
    const record = await this.prisma.providerSyncState.upsert({
      where: {
        scopeKey_provider_capability: {
          scopeKey,
          provider: validatedProvider,
          capability: state.capability,
        },
      },
      create: {
        scopeKey,
        userId: internalUserId,
        providerAccountId: providerAccountId ?? null,
        provider: validatedProvider,
        capability: state.capability,
        status: state.status,
        cursor: state.cursor ?? null,
        lastStartedAt: state.lastStartedAt
          ? new Date(state.lastStartedAt)
          : null,
        lastSucceededAt: state.lastSucceededAt
          ? new Date(state.lastSucceededAt)
          : null,
        nextRunAt: state.nextRunAt ? new Date(state.nextRunAt) : null,
        attempts: state.attempts,
        lastErrorCode: state.lastErrorCode ?? null,
        completeness: state.completeness,
        stale: state.stale,
      },
      update: {
        status: state.status,
        cursor: state.cursor ?? null,
        lastStartedAt: state.lastStartedAt
          ? new Date(state.lastStartedAt)
          : null,
        lastSucceededAt: state.lastSucceededAt
          ? new Date(state.lastSucceededAt)
          : null,
        nextRunAt: state.nextRunAt ? new Date(state.nextRunAt) : null,
        attempts: state.attempts,
        lastErrorCode: state.lastErrorCode ?? null,
        completeness: state.completeness,
        stale: state.stale,
        providerAccountId: providerAccountId ?? null,
      },
    })
    return ProviderSyncStateSchema.parse({
      ...state,
      provider: validatedProvider,
      ...(record.cursor === null ? {} : { cursor: record.cursor }),
    })
  }

  async hasPendingJob(authUserId: string, now = new Date()) {
    const record = await this.prisma.providerSyncJob.findFirst({
      where: {
        user: { authUserId },
        OR: [
          { status: 'queued', runAfter: { lte: now } },
          { status: 'running' },
        ],
      },
      select: { id: true },
    })
    return record !== null
  }

  async claimNext(
    leaseOwner: string,
    now = new Date(),
    leaseMs = 60_000,
    authUserId?: string,
  ) {
    const record = await this.prisma.providerSyncJob.findFirst({
      where: {
        ...(authUserId === undefined ? {} : { user: { authUserId } }),
        OR: [
          { status: 'queued', runAfter: { lte: now } },
          { status: 'running', leaseExpiresAt: { lte: now } },
        ],
      },
      orderBy: { runAfter: 'asc' },
    })
    if (record === null) return null
    const updated = await this.prisma.providerSyncJob.updateMany({
      where: {
        id: record.id,
        OR: [
          { status: 'queued', runAfter: { lte: now } },
          { status: 'running', leaseExpiresAt: { lte: now } },
        ],
      },
      data: {
        status: 'running',
        attempts: { increment: 1 },
        leaseOwner,
        leaseExpiresAt: new Date(now.getTime() + leaseMs),
      },
    })
    if (updated.count !== 1) return null
    const claimed = await this.prisma.providerSyncJob.findUnique({
      where: { id: record.id },
      include: { user: { select: { authUserId: true } } },
    })
    return claimed === null
      ? null
      : toProviderJob(claimed, claimed.user?.authUserId)
  }

  async complete(jobId: string, leaseOwner: string) {
    const result = await this.prisma.providerSyncJob.updateMany({
      where: { id: jobId, status: 'running', leaseOwner },
      data: { status: 'completed', leaseExpiresAt: null },
    })
    return result.count === 1
  }

  async markFailed(jobId: string, leaseOwner: string, errorCode: string) {
    const result = await this.prisma.providerSyncJob.updateMany({
      where: { id: jobId, status: 'running', leaseOwner },
      data: {
        status: 'failed',
        lastErrorCode: errorCode,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    })
    return result.count === 1
  }

  async fail(
    jobId: string,
    leaseOwner: string,
    errorCode: string,
    retryAt: Date,
  ) {
    const result = await this.prisma.providerSyncJob.updateMany({
      where: { id: jobId, status: 'running', leaseOwner },
      data: {
        status: 'queued',
        runAfter: retryAt,
        lastErrorCode: errorCode,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    })
    return result.count === 1
  }

  async deleteHistory(userId: string, provider: ProviderKey) {
    const validatedProvider = ProviderKeySchema.parse(provider)
    const internalUserId = await this.internalUserId(userId)
    if (internalUserId === null) return
    await this.prisma.$transaction([
      this.prisma.providerSyncJob.deleteMany({
        where: { userId: internalUserId, provider: validatedProvider },
      }),
      this.prisma.providerSyncState.deleteMany({
        where: { userId: internalUserId, provider: validatedProvider },
      }),
    ])
  }
}
