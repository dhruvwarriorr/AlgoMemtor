import {
  LinkableProviderSchema,
  ProviderAccountActivityAccessSchema,
  ProviderAccountConsentScopeSchema,
  ProviderPublicStatsErrorCodeSchema,
  ProviderPublicStatsSourceSchema,
  PublicProviderHandleSchema,
  type LinkableProvider,
  type ProviderAccountActivityAccess,
  type ProviderAccountConsentScope,
  type ProviderPublicStatsErrorCode,
  type ProviderPublicStatsSource,
  type PublicProviderHandle,
} from '@algomemtor/shared-contracts'

import type { PrismaClient } from '../generated/prisma/client.js'

export type ProviderAccountRecord = {
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
  linkedAt: Date
  updatedAt: Date
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
  findByAuthUserIdAndProvider(
    authUserId: string,
    provider: LinkableProvider,
  ): Promise<ProviderAccountRecord | null>
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
  deleteByAuthUserId(
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
})

export class InMemoryProviderAccountRepository implements ProviderAccountRepository {
  private readonly recordsByAuthUserId = new Map<
    string,
    Map<LinkableProvider, ProviderAccountRecord>
  >()

  constructor(private readonly now: () => Date = () => new Date()) {}

  async findAllByAuthUserId(authUserId: string) {
    return [...(this.recordsByAuthUserId.get(authUserId)?.values() ?? [])].sort(
      (left, right) => left.provider.localeCompare(right.provider),
    )
  }

  async findByAuthUserIdAndProvider(
    authUserId: string,
    provider: LinkableProvider,
  ) {
    return this.recordsByAuthUserId.get(authUserId)?.get(provider) ?? null
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
    const preserveStats = existing?.externalHandle === handle
    const record: ProviderAccountRecord = {
      provider,
      externalHandle: handle,
      consentScope,
      verificationStatus: 'not_verified',
      ...(preserveStats && existing !== undefined
        ? {
            activityAccess: existing.activityAccess,
            publicStatsConsentAt: existing.publicStatsConsentAt,
            solvedCount: existing.solvedCount,
            statsComplete: existing.statsComplete,
            statsSource: existing.statsSource,
            statsFetchedAt: existing.statsFetchedAt,
            statsAttemptedAt: existing.statsAttemptedAt,
            statsErrorCode: existing.statsErrorCode,
            statsErrorRetryable: existing.statsErrorRetryable,
          }
        : createUnlinkedStats()),
      linkedAt: existing?.linkedAt ?? now,
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

    if (records?.size === 0) {
      this.recordsByAuthUserId.delete(authUserId)
    }
  }
}

const recordFromDatabase = (record: {
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
  linkedAt: Date
  updatedAt: Date
}): ProviderAccountRecord => {
  if (record.verificationStatus !== 'not_verified') {
    throw new Error('Provider account record has an unsupported access state.')
  }

  return {
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
    linkedAt: record.linkedAt,
    updatedAt: record.updatedAt,
  }
}

export class PrismaProviderAccountRepository implements ProviderAccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAllByAuthUserId(authUserId: string) {
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId },
      select: {
        providerAccounts: {
          orderBy: { provider: 'asc' },
        },
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
          where: { provider },
          take: 1,
        },
      },
    })

    const record = user?.providerAccounts[0]
    return record === undefined ? null : recordFromDatabase(record)
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
      const existing = await transaction.providerAccount.findUnique({
        where: { userId_provider: { userId: user.id, provider } },
      })

      if (existing === null) {
        return transaction.providerAccount.create({
          data: {
            userId: user.id,
            provider,
            externalHandle: handle,
            consentScope,
          },
        })
      }

      const handleChanged = existing.externalHandle !== handle

      return transaction.providerAccount.update({
        where: { id: existing.id },
        data: {
          externalHandle: handle,
          consentScope,
          verificationStatus: 'not_verified',
          ...(handleChanged
            ? {
                activityAccess: 'not_enabled',
                publicStatsConsentAt: null,
                solvedCount: null,
                statsComplete: null,
                statsSource: null,
                statsFetchedAt: null,
                statsAttemptedAt: null,
                statsErrorCode: null,
                statsErrorRetryable: null,
              }
            : {}),
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

      const existing = await transaction.providerAccount.findUnique({
        where: { userId_provider: { userId: user.id, provider } },
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
