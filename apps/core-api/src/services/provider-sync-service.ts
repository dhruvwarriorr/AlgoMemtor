import { randomUUID } from 'node:crypto'

import {
  ProviderKeySchema,
  ProviderSyncJobSchema,
  ProviderSyncRequestResponseSchema,
  ProviderSyncStateSchema,
  ProviderSyncStatusResponseSchema,
  type ProviderKey,
  type ProviderSyncRequestResponse,
  type ProviderSyncStatusResponse,
} from '@algomemtor/shared-contracts'

import type { ProviderAccountRepository } from '../repositories/provider-account-repository.js'
import type {
  ProviderSyncRepository,
  ProviderSyncJobRecord,
} from '../repositories/provider-sync-repository.js'

const MANUAL_SYNC_COOLDOWN_MS = 15 * 60 * 1000

const providerLabel = (provider: ProviderKey) =>
  provider === 'codeforces'
    ? 'Codeforces'
    : provider === 'codechef'
      ? 'CodeChef'
      : 'LeetCode'

const toJob = (job: ProviderSyncJobRecord) =>
  ProviderSyncJobSchema.parse({
    id: job.id,
    provider: job.provider,
    capability: job.capability,
    status: job.status,
    queuedAt: job.queuedAt,
    runAfter: job.runAfter,
    ...(job.cursor === undefined ? {} : { cursor: job.cursor }),
    attempts: job.attempts,
    ...(job.lastErrorCode === undefined
      ? {}
      : { lastErrorCode: job.lastErrorCode }),
  })

export class ProviderSyncNotLinkedError extends Error {
  constructor(provider: ProviderKey) {
    super(`The ${providerLabel(provider)} account is not linked.`)
    this.name = 'ProviderSyncNotLinkedError'
  }
}

export class ProviderSyncService {
  constructor(
    private readonly options: {
      repository: ProviderSyncRepository
      providerAccountRepository: ProviderAccountRepository
      now?: () => Date
      cooldownMs?: number
    },
  ) {}

  private now() {
    return this.options.now?.() ?? new Date()
  }

  async requestManualSync(
    authUserId: string,
    provider: ProviderKey,
  ): Promise<ProviderSyncRequestResponse> {
    const validatedProvider = ProviderKeySchema.parse(provider)
    const account =
      await this.options.providerAccountRepository.findByAuthUserIdAndProvider(
        authUserId,
        validatedProvider,
      )
    if (account === null)
      throw new ProviderSyncNotLinkedError(validatedProvider)

    const now = this.now()
    const latest = await this.options.repository.findLatest(
      authUserId,
      validatedProvider,
      account.id,
    )
    const cooldownMs = this.options.cooldownMs ?? MANUAL_SYNC_COOLDOWN_MS
    const latestAt = latest === null ? undefined : new Date(latest.queuedAt)
    const nextAllowedAt =
      latestAt === undefined ? now : new Date(latestAt.getTime() + cooldownMs)
    const inCooldown = nextAllowedAt > now
    const runAfter = inCooldown ? nextAllowedAt : now
    const idempotencyKey = inCooldown
      ? (latest?.idempotencyKey ??
        `provider-sync:${authUserId}:${validatedProvider}:${Math.floor(now.getTime() / cooldownMs)}`)
      : `provider-sync:${authUserId}:${validatedProvider}:${randomUUID()}`
    const queued = await this.options.repository.enqueue({
      userId: authUserId,
      providerAccountId: account.id,
      provider: validatedProvider,
      capability: 'linked_user_sync',
      jobType: 'linked_user_sync',
      idempotencyKey,
      ...(inCooldown ? { runAfter } : {}),
    })
    return ProviderSyncRequestResponseSchema.parse({
      data: {
        provider: validatedProvider,
        job: toJob(queued.job),
        accepted: queued.accepted && !inCooldown,
        nextAllowedAt: nextAllowedAt.toISOString(),
      },
    })
  }

  async status(
    authUserId: string,
    provider: ProviderKey,
  ): Promise<ProviderSyncStatusResponse> {
    const validatedProvider = ProviderKeySchema.parse(provider)
    const account =
      await this.options.providerAccountRepository.findByAuthUserIdAndProvider(
        authUserId,
        validatedProvider,
      )
    const state = await this.options.repository.getState(
      authUserId,
      validatedProvider,
      account?.id,
    )
    const job = await this.options.repository.findLatest(
      authUserId,
      validatedProvider,
      account?.id,
    )
    return ProviderSyncStatusResponseSchema.parse({
      data: {
        provider: validatedProvider,
        state: ProviderSyncStateSchema.parse(state),
        ...(job === null ? {} : { job: toJob(job) }),
      },
    })
  }

  async deleteHistory(authUserId: string, provider: ProviderKey) {
    await this.options.repository.deleteHistory(
      authUserId,
      ProviderKeySchema.parse(provider),
    )
  }
}
