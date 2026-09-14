import { randomUUID } from 'node:crypto'

import {
  LinkableProviderSchema,
  ProviderAccountActivityAccessSchema,
  ProviderAccountConsentScopeSchema,
  ProviderPublicStatsErrorCodeSchema,
  ProviderPublicStatsSourceSchema,
  ProviderVerifiedActivityErrorCodeSchema,
  ProviderVerifiedActivityStatusSchema,
  PublicProviderHandleSchema,
  type LinkableProvider,
  type ProviderAccountActivityAccess,
  type ProviderAccountConsentScope,
  type ProviderPublicStatsErrorCode,
  type ProviderPublicStatsSource,
  type PublicProviderHandle,
} from '@algomemtor/shared-contracts'

import type { PrismaClient } from '../generated/prisma/client.js'
import type {
  ProviderVerifiedActivityEvent,
  ProviderVerifiedActivityFetchResult,
} from '../integrations/provider-accounts/provider-public-stats.js'

export type ProviderVerifiedActivityState = {
  enabled: boolean
  status: 'not_enabled' | 'not_synced' | 'synced' | 'partial' | 'error'
  consentedAt: Date | null
  lastAttemptedAt: Date | null
  lastSucceededAt: Date | null
  acceptedProblemCount: number | null
  complete: boolean | null
  errorCode:
    | 'PROVIDER_ACTIVITY_CONSENT_REQUIRED'
    | 'PROVIDER_ACTIVITY_COOLDOWN'
    | 'PROVIDER_ACCOUNT_NOT_FOUND'
    | 'PROVIDER_TIMEOUT'
    | 'PROVIDER_RATE_LIMITED'
    | 'PROVIDER_BLOCKED'
    | 'PROVIDER_UNAVAILABLE'
    | 'PROVIDER_INVALID_RESPONSE'
    | null
  retryAfter: Date | null
}

export type ProviderVerifiedActivitySuccess =
  ProviderVerifiedActivityFetchResult & {
    attemptedAt: Date
  }

export type ProviderVerifiedActivityFailure = {
  errorCode: ProviderVerifiedActivityState['errorCode']
  attemptedAt: Date
  retryAfter?: Date
}

export type ProviderVerifiedActivityRecord = ProviderVerifiedActivityEvent & {
  id: string
  firstObservedAt: Date
  lastObservedAt: Date
  progressActionId: string | null
}

export type ProviderAccountRecord = {
  id: string
  provider: LinkableProvider
  externalHandle: PublicProviderHandle
  consentScope: ProviderAccountConsentScope
  verificationStatus: 'not_verified'
  activityAccess: ProviderAccountActivityAccess
  publicStatsConsentAt: Date | null
  solvedCount: number | null
  statsComplete: boolean | null
  statsSource: ProviderPublicStatsSource | null
  statsFetchedAt: Date | null
  statsAttemptedAt: Date | null
  statsErrorCode: ProviderPublicStatsErrorCode | null
  statsErrorRetryable: boolean | null
  verifiedActivity: ProviderVerifiedActivityState
  linkedAt: Date
  updatedAt: Date
  syncEnabled: boolean
  disconnectedAt: Date | null
}

export type ProviderPublicStatsSuccess = {
  solvedCount: number
  complete: boolean
  source: ProviderPublicStatsSource
  fetchedAt: Date
  attemptedAt: Date
}

export type ProviderPublicStatsFailure = {
  errorCode: ProviderPublicStatsErrorCode
  retryable: boolean
  attemptedAt: Date
}

export interface ProviderAccountRepository {
  findAllByAuthUserId(authUserId: string): Promise<ProviderAccountRecord[]>
  findAllIncludingDisconnectedByAuthUserId?(
    authUserId: string,
  ): Promise<ProviderAccountRecord[]>
  findByAuthUserIdAndProvider(
    authUserId: string,
    provider: LinkableProvider,
  ): Promise<ProviderAccountRecord | null>
  listVerifiedActivityByAuthUserId(
    authUserId: string,
  ): Promise<ProviderVerifiedActivityRecord[]>
  upsertByAuthUserId(
    authUserId: string,
    provider: LinkableProvider,
    handle: PublicProviderHandle,
  ): Promise<ProviderAccountRecord>
  savePublicStatsSuccess(
    authUserId: string,
    provider: LinkableProvider,
    expectedHandle: PublicProviderHandle,
    stats: ProviderPublicStatsSuccess,
  ): Promise<ProviderAccountRecord | null>
  savePublicStatsFailure(
    authUserId: string,
    provider: LinkableProvider,
    expectedHandle: PublicProviderHandle,
    failure: ProviderPublicStatsFailure,
  ): Promise<ProviderAccountRecord | null>
  setVerifiedActivityConsent(
    authUserId: string,
    provider: LinkableProvider,
    enabled: boolean,
    occurredAt: Date,
  ): Promise<ProviderAccountRecord | null>
  saveVerifiedActivitySuccess(
    authUserId: string,
    provider: LinkableProvider,
    expectedHandle: PublicProviderHandle,
    activity: ProviderVerifiedActivitySuccess,
  ): Promise<{
    record: ProviderAccountRecord
    added: ProviderVerifiedActivityRecord[]
    pending: ProviderVerifiedActivityRecord[]
  } | null>
  saveVerifiedActivityFailure(
    authUserId: string,
    provider: LinkableProvider,
    expectedHandle: PublicProviderHandle,
    failure: ProviderVerifiedActivityFailure,
  ): Promise<ProviderAccountRecord | null>
  linkVerifiedActivityAction(
    authUserId: string,
    provider: LinkableProvider,
    externalId: string,
    actionId: string,
  ): Promise<void>
  deleteByAuthUserId(
    authUserId: string,
    provider: LinkableProvider,
  ): Promise<void>
  disconnectByAuthUserId?(
    authUserId: string,
    provider: LinkableProvider,
  ): Promise<void>
  deleteHistoryByAuthUserId?(
    authUserId: string,
    provider: LinkableProvider,
  ): Promise<void>
}

const consentScope = 'store_public_profile_reference' as const

const createUnlinkedStats = () => ({
  activityAccess: 'not_enabled' as const,
  publicStatsConsentAt: null,
  solvedCount: null,
  statsComplete: null,
  statsSource: null,
  statsFetchedAt: null,
  statsAttemptedAt: null,
  statsErrorCode: null,
  statsErrorRetryable: null,
  verifiedActivity: {
    enabled: false,
    status: 'not_enabled' as const,
    consentedAt: null,
    lastAttemptedAt: null,
    lastSucceededAt: null,
    acceptedProblemCount: null,
    complete: null,
    errorCode: null,
    retryAfter: null,
  },
})

export class InMemoryProviderAccountRepository implements ProviderAccountRepository {
  private readonly recordsByAuthUserId = new Map<
    string,
    Map<LinkableProvider, ProviderAccountRecord>
  >()
  private readonly archivedRecordsByAuthUserId = new Map<
    string,
    Map<LinkableProvider, ProviderAccountRecord[]>
  >()
  private readonly activityByAuthUserId = new Map<
    string,
    Map<
      LinkableProvider,
      Map<string, Map<string, ProviderVerifiedActivityRecord>>
    >
  >()

  constructor(private readonly now: () => Date = () => new Date()) {}

  async findAllByAuthUserId(authUserId: string) {
    return [...(this.recordsByAuthUserId.get(authUserId)?.values() ?? [])]
      .filter((record) => record.syncEnabled)
      .sort((left, right) => left.provider.localeCompare(right.provider))
  }

  async findAllIncludingDisconnectedByAuthUserId(authUserId: string) {
    const active = [
      ...(this.recordsByAuthUserId.get(authUserId)?.values() ?? []),
    ]
    const archived = [
      ...(this.archivedRecordsByAuthUserId.get(authUserId)?.values() ?? []),
    ].flatMap((records) => records)
    return [...active, ...archived].sort(
      (left, right) =>
        left.provider.localeCompare(right.provider) ||
        right.linkedAt.getTime() - left.linkedAt.getTime(),
    )
  }

  async findByAuthUserIdAndProvider(
    authUserId: string,
    provider: LinkableProvider,
  ) {
    const record = this.recordsByAuthUserId.get(authUserId)?.get(provider)
    return record?.syncEnabled === false ? null : (record ?? null)
  }

  async listVerifiedActivityByAuthUserId(authUserId: string) {
    const byProvider = this.activityByAuthUserId.get(authUserId)
    return [...(byProvider?.values() ?? [])].flatMap((byAccount) =>
      [...byAccount.values()].flatMap((events) =>
        [...events.values()].map((event) => ({ ...event })),
      ),
    )
  }

  async upsertByAuthUserId(
    authUserId: string,
    provider: LinkableProvider,
    handle: PublicProviderHandle,
  ) {
    const records =
      this.recordsByAuthUserId.get(authUserId) ??
      new Map<LinkableProvider, ProviderAccountRecord>()
    const existing = records.get(provider)
    const now = this.now()
    if (existing !== undefined && existing.externalHandle !== handle) {
      const archivedByProvider =
        this.archivedRecordsByAuthUserId.get(authUserId) ??
        new Map<LinkableProvider, ProviderAccountRecord[]>()
      const archived = archivedByProvider.get(provider) ?? []
      archived.push({
        ...existing,
        syncEnabled: false,
        disconnectedAt: now,
        updatedAt: now,
      })
      archivedByProvider.set(provider, archived)
      this.archivedRecordsByAuthUserId.set(authUserId, archivedByProvider)
      records.delete(provider)
    }
    const current = records.get(provider)
    const archivedByProvider = this.archivedRecordsByAuthUserId
      .get(authUserId)
      ?.get(provider)
    const archivedMatch =
      current === undefined
        ? archivedByProvider
            ?.slice()
            .reverse()
            .find((record) => record.externalHandle === handle)
        : undefined
    if (current === undefined && archivedMatch !== undefined) {
      const reconnected: ProviderAccountRecord = {
        ...archivedMatch,
        publicStatsConsentAt: archivedMatch.publicStatsConsentAt ?? now,
        syncEnabled: true,
        disconnectedAt: null,
        updatedAt: now,
      }
      records.set(provider, reconnected)
      if (archivedByProvider !== undefined) {
        this.archivedRecordsByAuthUserId.get(authUserId)?.set(
          provider,
          archivedByProvider.filter((record) => record.id !== archivedMatch.id),
        )
      }
      this.recordsByAuthUserId.set(authUserId, records)
      return reconnected
    }
    const preserveStats = current?.externalHandle === handle
    const record: ProviderAccountRecord = {
      id: current?.id ?? randomUUID(),
      provider,
      externalHandle: handle,
      consentScope,
      verificationStatus: 'not_verified',
      syncEnabled: true,
      disconnectedAt: null,
      ...(preserveStats && current !== undefined
        ? {
            activityAccess: current.activityAccess,
            publicStatsConsentAt: current.publicStatsConsentAt ?? now,
            solvedCount: current.solvedCount,
            statsComplete: current.statsComplete,
            statsSource: current.statsSource,
            statsFetchedAt: current.statsFetchedAt,
            statsAttemptedAt: current.statsAttemptedAt,
            statsErrorCode: current.statsErrorCode,
            statsErrorRetryable: current.statsErrorRetryable,
            verifiedActivity: current.verifiedActivity,
            syncEnabled: true,
            disconnectedAt: null,
          }
        : { ...createUnlinkedStats(), publicStatsConsentAt: now }),
      linkedAt: current?.linkedAt ?? now,
      updatedAt: now,
    }

    records.set(provider, record)
    this.recordsByAuthUserId.set(authUserId, records)

    return record
  }

  async savePublicStatsSuccess(
    authUserId: string,
    provider: LinkableProvider,
    expectedHandle: PublicProviderHandle,
    stats: ProviderPublicStatsSuccess,
  ) {
    const records = this.recordsByAuthUserId.get(authUserId)
    const existing = records?.get(provider)

    if (
      records === undefined ||
      existing === undefined ||
      existing.externalHandle !== expectedHandle
    ) {
      return null
    }

    const record: ProviderAccountRecord = {
      ...existing,
      activityAccess: 'public_solved_count',
      publicStatsConsentAt: existing.publicStatsConsentAt ?? stats.attemptedAt,
      solvedCount: stats.solvedCount,
      statsComplete: stats.complete,
      statsSource: stats.source,
      statsFetchedAt: stats.fetchedAt,
      statsAttemptedAt: stats.attemptedAt,
      statsErrorCode: null,
      statsErrorRetryable: null,
      updatedAt: stats.attemptedAt,
    }
    records.set(provider, record)

    return record
  }

  async setVerifiedActivityConsent(
    authUserId: string,
    provider: LinkableProvider,
    enabled: boolean,
    occurredAt: Date,
  ) {
    const records = this.recordsByAuthUserId.get(authUserId)
    const existing = records?.get(provider)
    if (records === undefined || existing === undefined) return null
    const current = existing.verifiedActivity
    const updatedState = enabled
      ? {
          ...current,
          enabled: true,
          status:
            current.status === 'not_enabled' || current.status === 'error'
              ? ('not_synced' as const)
              : current.status,
          consentedAt: current.consentedAt ?? occurredAt,
          errorCode: null,
          retryAfter: null,
        }
      : createUnlinkedStats().verifiedActivity
    const updated = {
      ...existing,
      verifiedActivity: updatedState,
      updatedAt: occurredAt,
    }
    records.set(provider, updated)
    if (!enabled) {
      this.activityByAuthUserId.get(authUserId)?.delete(provider)
    }
    return updated
  }

  async saveVerifiedActivitySuccess(
    authUserId: string,
    provider: LinkableProvider,
    expectedHandle: PublicProviderHandle,
    activity: ProviderVerifiedActivitySuccess,
  ) {
    const records = this.recordsByAuthUserId.get(authUserId)
    const existing = records?.get(provider)
    if (
      records === undefined ||
      existing === undefined ||
      existing.externalHandle !== expectedHandle ||
      !existing.verifiedActivity.enabled
    ) {
      return null
    }
    const byProvider =
      this.activityByAuthUserId.get(authUserId) ??
      new Map<
        LinkableProvider,
        Map<string, Map<string, ProviderVerifiedActivityRecord>>
      >()
    const byAccount =
      byProvider.get(provider) ??
      new Map<string, Map<string, ProviderVerifiedActivityRecord>>()
    const events =
      byAccount.get(existing.id) ??
      new Map<string, ProviderVerifiedActivityRecord>()
    const added: ProviderVerifiedActivityRecord[] = []
    const pending: ProviderVerifiedActivityRecord[] = []
    for (const event of activity.events) {
      const current = events.get(event.externalId)
      if (current === undefined) {
        const value = {
          ...event,
          id: randomUUID(),
          firstObservedAt: activity.attemptedAt,
          lastObservedAt: activity.attemptedAt,
          progressActionId: null,
        }
        events.set(event.externalId, value)
        added.push(value)
      } else {
        const updated = {
          ...current,
          lastObservedAt: activity.attemptedAt,
          ...(event.occurredAt < current.occurredAt
            ? {
                occurredAt: event.occurredAt,
                providerEventId: event.providerEventId,
              }
            : {}),
        }
        events.set(event.externalId, updated)
        // Keep previously observed records without an action in the work list.
        // This lets a later retry recover if action persistence failed after
        // the evidence row was written.
        if (updated.progressActionId === null) {
          pending.push(updated)
        }
      }
    }
    byAccount.set(existing.id, events)
    byProvider.set(provider, byAccount)
    this.activityByAuthUserId.set(authUserId, byProvider)
    const updated = {
      ...existing,
      verifiedActivity: {
        ...existing.verifiedActivity,
        enabled: true,
        status: activity.complete ? ('synced' as const) : ('partial' as const),
        lastAttemptedAt: activity.attemptedAt,
        lastSucceededAt: activity.attemptedAt,
        acceptedProblemCount: events.size,
        complete: activity.complete,
        errorCode: null,
        retryAfter: null,
      },
      updatedAt: activity.attemptedAt,
    }
    records.set(provider, updated)
    return { record: updated, added, pending }
  }

  async saveVerifiedActivityFailure(
    authUserId: string,
    provider: LinkableProvider,
    expectedHandle: PublicProviderHandle,
    failure: ProviderVerifiedActivityFailure,
  ) {
    const records = this.recordsByAuthUserId.get(authUserId)
    const existing = records?.get(provider)
    if (
      records === undefined ||
      existing === undefined ||
      existing.externalHandle !== expectedHandle ||
      !existing.verifiedActivity.enabled
    ) {
      return null
    }
    const updated = {
      ...existing,
      verifiedActivity: {
        ...existing.verifiedActivity,
        enabled: true,
        status: 'error' as const,
        lastAttemptedAt: failure.attemptedAt,
        errorCode: failure.errorCode,
        retryAfter: failure.retryAfter ?? null,
      },
      updatedAt: failure.attemptedAt,
    }
    records.set(provider, updated)
    return updated
  }

  async linkVerifiedActivityAction(
    authUserId: string,
    provider: LinkableProvider,
    externalId: string,
    actionId: string,
  ) {
    const account = this.recordsByAuthUserId.get(authUserId)?.get(provider)
    const activity =
      account === undefined
        ? undefined
        : this.activityByAuthUserId
            .get(authUserId)
            ?.get(provider)
            ?.get(account.id)
            ?.get(externalId)
    if (activity !== undefined && activity.progressActionId === null) {
      activity.progressActionId = actionId
    }
  }

  async savePublicStatsFailure(
    authUserId: string,
    provider: LinkableProvider,
    expectedHandle: PublicProviderHandle,
    failure: ProviderPublicStatsFailure,
  ) {
    const records = this.recordsByAuthUserId.get(authUserId)
    const existing = records?.get(provider)

    if (
      records === undefined ||
      existing === undefined ||
      existing.externalHandle !== expectedHandle
    ) {
      return null
    }

    const record: ProviderAccountRecord = {
      ...existing,
      activityAccess: 'public_solved_count',
      publicStatsConsentAt:
        existing.publicStatsConsentAt ?? failure.attemptedAt,
      statsAttemptedAt: failure.attemptedAt,
      statsErrorCode: failure.errorCode,
      statsErrorRetryable: failure.retryable,
      updatedAt: failure.attemptedAt,
    }
    records.set(provider, record)

    return record
  }

  async deleteByAuthUserId(authUserId: string, provider: LinkableProvider) {
    const records = this.recordsByAuthUserId.get(authUserId)
    records?.delete(provider)
    this.archivedRecordsByAuthUserId.get(authUserId)?.delete(provider)
    this.activityByAuthUserId.get(authUserId)?.delete(provider)

    if (records?.size === 0) {
      this.recordsByAuthUserId.delete(authUserId)
    }
    if (this.archivedRecordsByAuthUserId.get(authUserId)?.size === 0) {
      this.archivedRecordsByAuthUserId.delete(authUserId)
    }
    if (this.activityByAuthUserId.get(authUserId)?.size === 0) {
      this.activityByAuthUserId.delete(authUserId)
    }
  }

  async deleteHistoryByAuthUserId(
    authUserId: string,
    provider: LinkableProvider,
  ) {
    const records = this.recordsByAuthUserId.get(authUserId)
    const existing = records?.get(provider)
    const archived = this.archivedRecordsByAuthUserId
      .get(authUserId)
      ?.get(provider)
    if (existing === undefined && archived === undefined) return
    const now = this.now()
    if (existing !== undefined && records !== undefined) {
      records.set(provider, {
        ...existing,
        ...createUnlinkedStats(),
        syncEnabled: false,
        disconnectedAt: now,
        updatedAt: now,
      })
    }
    this.activityByAuthUserId.get(authUserId)?.delete(provider)
    if (archived !== undefined) {
      this.archivedRecordsByAuthUserId.get(authUserId)?.set(
        provider,
        archived.map((record) => ({
          ...record,
          ...createUnlinkedStats(),
          syncEnabled: false,
          disconnectedAt: now,
          updatedAt: now,
        })),
      )
    }
  }

  async disconnectByAuthUserId(authUserId: string, provider: LinkableProvider) {
    const records = this.recordsByAuthUserId.get(authUserId)
    const existing = records?.get(provider)
    if (existing === undefined || records === undefined) return
    const now = this.now()
    records.set(provider, {
      ...existing,
      syncEnabled: false,
      disconnectedAt: now,
      updatedAt: now,
    })
  }
}

const recordFromDatabase = (record: {
  id: string
  provider: string
  externalHandle: string
  consentScope: string
  verificationStatus: string
  activityAccess: string
  publicStatsConsentAt: Date | null
  solvedCount: number | null
  statsComplete: boolean | null
  statsSource: string | null
  statsFetchedAt: Date | null
  statsAttemptedAt: Date | null
  statsErrorCode: string | null
  statsErrorRetryable: boolean | null
  activityConsentAt: Date | null
  activitySyncStatus: string
  activityLastAttemptedAt: Date | null
  activityLastSucceededAt: Date | null
  activityAcceptedProblemCount: number | null
  activityComplete: boolean | null
  activityErrorCode: string | null
  activityRetryAfter: Date | null
  linkedAt: Date
  updatedAt: Date
  syncEnabled: boolean
  disconnectedAt: Date | null
}): ProviderAccountRecord => {
  if (record.verificationStatus !== 'not_verified') {
    throw new Error('Provider account record has an unsupported access state.')
  }

  return {
    id: record.id,
    provider: LinkableProviderSchema.parse(record.provider),
    externalHandle: PublicProviderHandleSchema.parse(record.externalHandle),
    consentScope: ProviderAccountConsentScopeSchema.parse(record.consentScope),
    verificationStatus: record.verificationStatus,
    activityAccess: ProviderAccountActivityAccessSchema.parse(
      record.activityAccess,
    ),
    publicStatsConsentAt: record.publicStatsConsentAt,
    solvedCount: record.solvedCount,
    statsComplete: record.statsComplete,
    statsSource:
      record.statsSource === null
        ? null
        : ProviderPublicStatsSourceSchema.parse(record.statsSource),
    statsFetchedAt: record.statsFetchedAt,
    statsAttemptedAt: record.statsAttemptedAt,
    statsErrorCode:
      record.statsErrorCode === null
        ? null
        : ProviderPublicStatsErrorCodeSchema.parse(record.statsErrorCode),
    statsErrorRetryable: record.statsErrorRetryable,
    verifiedActivity: {
      enabled: record.activityConsentAt !== null,
      status: ProviderVerifiedActivityStatusSchema.parse(
        record.activitySyncStatus,
      ),
      consentedAt: record.activityConsentAt,
      lastAttemptedAt: record.activityLastAttemptedAt,
      lastSucceededAt: record.activityLastSucceededAt,
      acceptedProblemCount: record.activityAcceptedProblemCount,
      complete: record.activityComplete,
      errorCode:
        record.activityErrorCode === null
          ? null
          : ProviderVerifiedActivityErrorCodeSchema.parse(
              record.activityErrorCode,
            ),
      retryAfter: record.activityRetryAfter,
    },
    linkedAt: record.linkedAt,
    updatedAt: record.updatedAt,
    syncEnabled: record.syncEnabled,
    disconnectedAt: record.disconnectedAt,
  }
}

const verifiedActivityFromDatabase = (record: {
  id: string
  externalId: string
  providerEventId: string
  providerOccurredAt: Date
  firstObservedAt: Date
  lastObservedAt: Date
  progressActionId: string | null
}): ProviderVerifiedActivityRecord => ({
  id: record.id,
  externalId: record.externalId,
  providerEventId: record.providerEventId,
  occurredAt: record.providerOccurredAt,
  firstObservedAt: record.firstObservedAt,
  lastObservedAt: record.lastObservedAt,
  progressActionId: record.progressActionId,
})

export class PrismaProviderAccountRepository implements ProviderAccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAllByAuthUserId(authUserId: string) {
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId },
      select: {
        providerAccounts: {
          where: { syncEnabled: true },
          orderBy: { provider: 'asc' },
        },
      },
    })

    return (user?.providerAccounts ?? []).map(recordFromDatabase)
  }

  async findAllIncludingDisconnectedByAuthUserId(authUserId: string) {
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId },
      select: {
        providerAccounts: { orderBy: { provider: 'asc' } },
      },
    })
    return (user?.providerAccounts ?? []).map(recordFromDatabase)
  }

  async findByAuthUserIdAndProvider(
    authUserId: string,
    provider: LinkableProvider,
  ) {
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId },
      select: {
        providerAccounts: {
          where: { provider, syncEnabled: true },
          take: 1,
        },
      },
    })

    const record = user?.providerAccounts[0]
    return record === undefined ? null : recordFromDatabase(record)
  }

  async listVerifiedActivityByAuthUserId(authUserId: string) {
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId },
      select: { id: true },
    })
    if (user === null) return []
    const records = await this.prisma.providerVerifiedActivity.findMany({
      where: { userId: user.id },
      orderBy: { providerOccurredAt: 'asc' },
    })
    return records.map(verifiedActivityFromDatabase)
  }

  async upsertByAuthUserId(
    authUserId: string,
    provider: LinkableProvider,
    handle: PublicProviderHandle,
  ) {
    const record = await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.coreUser.upsert({
        where: { authUserId },
        create: { authUserId },
        update: {},
        select: { id: true },
      })
      const existing = await transaction.providerAccount.findFirst({
        where: { userId: user.id, provider, syncEnabled: true },
        orderBy: { updatedAt: 'desc' },
      })
      const sameHandle = await transaction.providerAccount.findUnique({
        where: {
          userId_provider_externalHandle: {
            userId: user.id,
            provider,
            externalHandle: handle,
          },
        },
      })

      if (sameHandle !== null) {
        if (existing !== null && existing.id !== sameHandle.id) {
          await transaction.providerAccount.update({
            where: { id: existing.id },
            data: { syncEnabled: false, disconnectedAt: new Date() },
          })
        }
        return transaction.providerAccount.update({
          where: { id: sameHandle.id },
          data: {
            consentScope,
            publicStatsConsentAt: sameHandle.publicStatsConsentAt ?? new Date(),
            syncEnabled: true,
            disconnectedAt: null,
            verificationStatus: 'not_verified',
          },
        })
      }

      if (existing !== null) {
        await transaction.providerAccount.update({
          where: { id: existing.id },
          data: { syncEnabled: false, disconnectedAt: new Date() },
        })
      }

      return transaction.providerAccount.create({
        data: {
          userId: user.id,
          provider,
          externalHandle: handle,
          consentScope,
          publicStatsConsentAt: new Date(),
        },
      })
    })

    return recordFromDatabase(record)
  }

  async savePublicStatsSuccess(
    authUserId: string,
    provider: LinkableProvider,
    expectedHandle: PublicProviderHandle,
    stats: ProviderPublicStatsSuccess,
  ) {
    const record = await this.updateStatsRecord(
      authUserId,
      provider,
      expectedHandle,
      {
        activityAccess: 'public_solved_count',
        publicStatsConsentAt: stats.attemptedAt,
        solvedCount: stats.solvedCount,
        statsComplete: stats.complete,
        statsSource: stats.source,
        statsFetchedAt: stats.fetchedAt,
        statsAttemptedAt: stats.attemptedAt,
        statsErrorCode: null,
        statsErrorRetryable: null,
      },
    )

    return record === null ? null : recordFromDatabase(record)
  }

  async savePublicStatsFailure(
    authUserId: string,
    provider: LinkableProvider,
    expectedHandle: PublicProviderHandle,
    failure: ProviderPublicStatsFailure,
  ) {
    const record = await this.updateStatsRecord(
      authUserId,
      provider,
      expectedHandle,
      {
        activityAccess: 'public_solved_count',
        publicStatsConsentAt: failure.attemptedAt,
        statsAttemptedAt: failure.attemptedAt,
        statsErrorCode: failure.errorCode,
        statsErrorRetryable: failure.retryable,
      },
    )

    return record === null ? null : recordFromDatabase(record)
  }

  async setVerifiedActivityConsent(
    authUserId: string,
    provider: LinkableProvider,
    enabled: boolean,
    occurredAt: Date,
  ) {
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId },
      select: { id: true },
    })
    if (user === null) return null
    const account = await this.prisma.providerAccount.findFirst({
      where: { userId: user.id, provider, syncEnabled: true },
      orderBy: { updatedAt: 'desc' },
    })
    if (account === null) return null
    if (!enabled) {
      await this.prisma.providerVerifiedActivity.deleteMany({
        where: { providerAccountId: account.id },
      })
    }
    const updated = await this.prisma.providerAccount.update({
      where: { id: account.id },
      data: enabled
        ? {
            activityConsentAt: account.activityConsentAt ?? occurredAt,
            activitySyncStatus:
              account.activitySyncStatus === 'not_enabled' ||
              account.activitySyncStatus === 'error'
                ? 'not_synced'
                : account.activitySyncStatus,
            activityErrorCode: null,
            activityRetryAfter: null,
          }
        : {
            activityConsentAt: null,
            activitySyncStatus: 'not_enabled',
            activityLastAttemptedAt: null,
            activityLastSucceededAt: null,
            activityAcceptedProblemCount: null,
            activityComplete: null,
            activityErrorCode: null,
            activityRetryAfter: null,
          },
    })
    return recordFromDatabase(updated)
  }

  async saveVerifiedActivitySuccess(
    authUserId: string,
    provider: LinkableProvider,
    expectedHandle: PublicProviderHandle,
    activity: ProviderVerifiedActivitySuccess,
  ) {
    const result = await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.coreUser.findUnique({
        where: { authUserId },
        select: { id: true },
      })
      if (user === null) return null
      const account = await transaction.providerAccount.findFirst({
        where: { userId: user.id, provider, syncEnabled: true },
        orderBy: { updatedAt: 'desc' },
      })
      if (
        account === null ||
        account.externalHandle !== expectedHandle ||
        account.activityConsentAt === null
      ) {
        return null
      }
      const added: ProviderVerifiedActivityRecord[] = []
      const pending: ProviderVerifiedActivityRecord[] = []
      for (const event of activity.events) {
        const existing = await transaction.providerVerifiedActivity.findUnique({
          where: {
            providerAccountId_externalId: {
              providerAccountId: account.id,
              externalId: event.externalId,
            },
          },
        })
        if (existing === null) {
          const created = await transaction.providerVerifiedActivity.create({
            data: {
              userId: user.id,
              providerAccountId: account.id,
              provider,
              externalId: event.externalId,
              providerEventId: event.providerEventId,
              providerOccurredAt: event.occurredAt,
              firstObservedAt: activity.attemptedAt,
              lastObservedAt: activity.attemptedAt,
            },
          })
          added.push({
            externalId: created.externalId,
            providerEventId: created.providerEventId,
            occurredAt: created.providerOccurredAt,
            id: created.id,
            firstObservedAt: created.firstObservedAt,
            lastObservedAt: created.lastObservedAt,
            progressActionId: created.progressActionId,
          })
        } else {
          const occurredAt =
            event.occurredAt < existing.providerOccurredAt
              ? event.occurredAt
              : existing.providerOccurredAt
          const providerEventId =
            event.occurredAt < existing.providerOccurredAt
              ? event.providerEventId
              : existing.providerEventId
          await transaction.providerVerifiedActivity.update({
            where: { id: existing.id },
            data: {
              lastObservedAt: activity.attemptedAt,
              ...(event.occurredAt < existing.providerOccurredAt
                ? {
                    providerOccurredAt: event.occurredAt,
                    providerEventId: event.providerEventId,
                  }
                : {}),
            },
          })
          if (existing.progressActionId === null) {
            pending.push({
              externalId: existing.externalId,
              providerEventId,
              occurredAt,
              id: existing.id,
              firstObservedAt: existing.firstObservedAt,
              lastObservedAt: activity.attemptedAt,
              progressActionId: null,
            })
          }
        }
      }
      const updated = await transaction.providerAccount.update({
        where: { id: account.id },
        data: {
          activitySyncStatus: activity.complete ? 'synced' : 'partial',
          activityLastAttemptedAt: activity.attemptedAt,
          activityLastSucceededAt: activity.attemptedAt,
          activityAcceptedProblemCount:
            await transaction.providerVerifiedActivity.count({
              where: { providerAccountId: account.id },
            }),
          activityComplete: activity.complete,
          activityErrorCode: null,
          activityRetryAfter: null,
        },
      })
      return { record: recordFromDatabase(updated), added, pending }
    })
    return result
  }

  async saveVerifiedActivityFailure(
    authUserId: string,
    provider: LinkableProvider,
    expectedHandle: PublicProviderHandle,
    failure: ProviderVerifiedActivityFailure,
  ) {
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId },
      select: { id: true },
    })
    if (user === null) return null
    const account = await this.prisma.providerAccount.findFirst({
      where: { userId: user.id, provider, syncEnabled: true },
      orderBy: { updatedAt: 'desc' },
    })
    if (
      account === null ||
      account.externalHandle !== expectedHandle ||
      account.activityConsentAt === null
    )
      return null
    const updated = await this.prisma.providerAccount.update({
      where: { id: account.id },
      data: {
        activitySyncStatus: 'error',
        activityLastAttemptedAt: failure.attemptedAt,
        activityErrorCode: failure.errorCode,
        activityRetryAfter: failure.retryAfter ?? null,
      },
    })
    return recordFromDatabase(updated)
  }

  async linkVerifiedActivityAction(
    authUserId: string,
    provider: LinkableProvider,
    externalId: string,
    actionId: string,
  ) {
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId },
      select: {
        id: true,
        providerAccounts: {
          where: { provider, syncEnabled: true },
          select: { id: true },
          take: 1,
        },
      },
    })
    if (user === null) return
    const account = user.providerAccounts[0]
    if (account === undefined) return
    await this.prisma.providerVerifiedActivity.updateMany({
      where: {
        providerAccountId: account.id,
        externalId,
        progressActionId: null,
      },
      data: { progressActionId: actionId },
    })
  }

  async deleteByAuthUserId(authUserId: string, provider: LinkableProvider) {
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId },
      select: { id: true },
    })

    if (!user) {
      return
    }

    await this.prisma.providerAccount.deleteMany({
      where: { userId: user.id, provider },
    })
  }

  async deleteHistoryByAuthUserId(
    authUserId: string,
    provider: LinkableProvider,
  ) {
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId },
      select: { id: true },
    })
    if (user === null) return
    const accounts = await this.prisma.providerAccount.findMany({
      where: { userId: user.id, provider },
      select: { id: true },
    })
    if (accounts.length === 0) return
    await this.prisma.$transaction(async (transaction) => {
      const accountIds = accounts.map((account) => account.id)
      await transaction.providerVerifiedActivity.deleteMany({
        where: { providerAccountId: { in: accountIds } },
      })
      await transaction.providerProfileSnapshot.deleteMany({
        where: { providerAccountId: { in: accountIds } },
      })
      await transaction.providerSubmission.deleteMany({
        where: { providerAccountId: { in: accountIds } },
      })
      await transaction.providerSolvedObservation.deleteMany({
        where: { providerAccountId: { in: accountIds } },
      })
      await transaction.providerRatingChange.deleteMany({
        where: { providerAccountId: { in: accountIds } },
      })
      await transaction.contestParticipation.deleteMany({
        where: { providerAccountId: { in: accountIds } },
      })
      await transaction.providerAccount.updateMany({
        where: { id: { in: accountIds } },
        data: {
          publicStatsConsentAt: null,
          solvedCount: null,
          statsComplete: null,
          statsSource: null,
          statsFetchedAt: null,
          statsAttemptedAt: null,
          statsErrorCode: null,
          statsErrorRetryable: null,
          activityAccess: 'not_enabled',
          activityConsentAt: null,
          activitySyncStatus: 'not_enabled',
          activityLastAttemptedAt: null,
          activityLastSucceededAt: null,
          activityAcceptedProblemCount: null,
          activityComplete: null,
          activityErrorCode: null,
          activityRetryAfter: null,
          syncEnabled: false,
          disconnectedAt: new Date(),
        },
      })
    })
  }

  async disconnectByAuthUserId(authUserId: string, provider: LinkableProvider) {
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId },
      select: { id: true },
    })
    if (user === null) return
    await this.prisma.providerAccount.updateMany({
      where: { userId: user.id, provider },
      data: { syncEnabled: false, disconnectedAt: new Date() },
    })
  }

  private async updateStatsRecord(
    authUserId: string,
    provider: LinkableProvider,
    expectedHandle: PublicProviderHandle,
    data: {
      activityAccess: 'public_solved_count'
      publicStatsConsentAt: Date
      solvedCount?: number
      statsComplete?: boolean
      statsSource?: ProviderPublicStatsSource
      statsFetchedAt?: Date
      statsAttemptedAt: Date
      statsErrorCode: ProviderPublicStatsErrorCode | null
      statsErrorRetryable: boolean | null
    },
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.coreUser.findUnique({
        where: { authUserId },
        select: { id: true },
      })

      if (user === null) {
        return null
      }

      const existing = await transaction.providerAccount.findFirst({
        where: { userId: user.id, provider, syncEnabled: true },
        orderBy: { updatedAt: 'desc' },
      })

      if (existing === null || existing.externalHandle !== expectedHandle) {
        return null
      }

      return transaction.providerAccount.update({
        where: { id: existing.id },
        data: {
          ...data,
          publicStatsConsentAt:
            existing.publicStatsConsentAt ?? data.publicStatsConsentAt,
        },
      })
    })
  }
}
