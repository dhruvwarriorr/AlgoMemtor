import { randomUUID } from 'node:crypto'

import {
  LinkableProviderSchema,
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
      : provider === 'leetcode'
        ? 'LeetCode'
        : 'CSES'

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

  async requestInitialSync(authUserId: string, provider: ProviderKey) {
    const validatedProvider = LinkableProviderSchema.parse(provider)
    const account =
      await this.options.providerAccountRepository.findByAuthUserIdAndProvider(
        authUserId,
        validatedProvider,
      )
    if (account === null)
      throw new ProviderSyncNotLinkedError(validatedProvider)

    return this.options.repository.enqueue({
      userId: authUserId,
      providerAccountId: account.id,
      provider: validatedProvider,
      capability: 'linked_user_sync',
      jobType: 'initial_sync',
      idempotencyKey: `provider-sync:initial:${account.id}:${randomUUID()}`,
    })
  }

  async requestManualSync(
    authUserId: string,
    provider: ProviderKey,
  ): Promise<ProviderSyncRequestResponse> {
    const validatedProvider = LinkableProviderSchema.parse(provider)
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
      'manual_sync',
    )
    const cooldownMs = this.options.cooldownMs ?? MANUAL_SYNC_COOLDOWN_MS
    const latestAt = latest === null ? undefined : new Date(latest.queuedAt)
    const nextAllowedAt =
      latestAt === undefined ? now : new Date(latestAt.getTime() + cooldownMs)
    const inCooldown = nextAllowedAt > now
    const runAfter = inCooldown ? nextAllowedAt : now
    const idempotencyKey = inCooldown
      ? (latest?.idempotencyKey ??
        `provider-sync:manual:${authUserId}:${validatedProvider}:${Math.floor(now.getTime() / cooldownMs)}`)
      : `provider-sync:manual:${authUserId}:${validatedProvider}:${randomUUID()}`
    const queued = await this.options.repository.enqueue({
      userId: authUserId,
      providerAccountId: account.id,
      provider: validatedProvider,
      capability: 'linked_user_sync',
      jobType: 'manual_sync',
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

  // Replaces the old hourly background sync. While the learner is using the
  // site, each consented, server-synced account whose last successful sync
  // is older than `staleAfterMs` gets one sync, unless a sync for it is
  // already queued or running. Returns the providers that were queued.
  async requestActiveSessionSync(authUserId: string, staleAfterMs: number) {
    const now = this.now()
    const accounts =
      await this.options.providerAccountRepository.findAllByAuthUserId(
        authUserId,
      )
    const queued: ProviderKey[] = []
    for (const account of accounts) {
      // CSES has no public data; the browser connector syncs it.
      if (
        account.provider === 'cses' ||
        !account.syncEnabled ||
        account.publicStatsConsentAt === null
      ) {
        continue
      }
      const state = await this.options.repository.getState(
        authUserId,
        account.provider,
        account.id,
      )
      const lastSuccess =
        state.lastSucceededAt === undefined
          ? undefined
          : new Date(state.lastSucceededAt).getTime()
      if (
        lastSuccess !== undefined &&
        now.getTime() - lastSuccess < staleAfterMs
      ) {
        continue
      }
      const latest = await this.options.repository.findLatest(
        authUserId,
        account.provider,
        account.id,
      )
      if (latest?.status === 'queued' || latest?.status === 'running') continue
      // One refresh per account per stale window, even with several tabs.
      const window = Math.floor(now.getTime() / Math.max(60_000, staleAfterMs))
      const result = await this.options.repository.enqueue({
        userId: authUserId,
        providerAccountId: account.id,
        provider: account.provider,
        capability: 'linked_user_sync',
        jobType: 'active_session_sync',
        idempotencyKey: `provider-sync:active:${account.id}:${window}`,
      })
      if (result.accepted) queued.push(account.provider)
    }
    return queued
  }

  async status(
    authUserId: string,
    provider: ProviderKey,
  ): Promise<ProviderSyncStatusResponse> {
    const validatedProvider = LinkableProviderSchema.parse(provider)
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
      LinkableProviderSchema.parse(provider),
    )
  }
}
