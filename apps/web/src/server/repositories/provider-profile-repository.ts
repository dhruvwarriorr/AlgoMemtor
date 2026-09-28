import {
  ProviderProfileSchema,
  ProviderKeySchema,
  type ProviderKey,
  type ProviderProfile,
} from '@algomemtor/shared-contracts'

import { Prisma, type PrismaClient } from '../generated/prisma/client'

export interface ProviderProfileRepository {
  saveSnapshot(
    authUserId: string,
    providerAccountId: string,
    profile: ProviderProfile,
  ): Promise<void>
  findLatestByAuthUserId(
    authUserId: string,
    provider?: ProviderKey,
  ): Promise<ProviderProfile[]>
  deleteByAuthUserId(authUserId: string, provider: ProviderKey): Promise<void>
}

const profileFromRecord = (record: {
  provider: string
  externalHandle: string
  displayName: string | null
  profileUrl: string
  avatarUrl: string | null
  rank: string | null
  globalRank: number | null
  rating: number | null
  solvedCount: number | null
  acceptanceRate: number | null
  difficultyCounts: Prisma.JsonValue
  languageCounts: Prisma.JsonValue
  topicCounts: Prisma.JsonValue
  badges: Prisma.JsonValue
  calendar: Prisma.JsonValue
  completeness: string
  extractionStrategy: string
  sourceUrl: string
  schemaVersion: string
  fetchedAt: Date
}) =>
  ProviderProfileSchema.parse({
    provider: record.provider,
    externalId: record.externalHandle,
    handle: record.externalHandle,
    ...(record.displayName === null ? {} : { displayName: record.displayName }),
    profileUrl: record.profileUrl,
    ...(record.avatarUrl === null ? {} : { avatarUrl: record.avatarUrl }),
    ...(record.rank === null ? {} : { rank: record.rank }),
    ...(record.globalRank === null ? {} : { globalRank: record.globalRank }),
    ...(record.rating === null ? {} : { rating: record.rating }),
    ...(record.solvedCount === null ? {} : { solvedCount: record.solvedCount }),
    ...(record.acceptanceRate === null
      ? {}
      : { acceptanceRate: record.acceptanceRate }),
    ...(record.difficultyCounts === null
      ? {}
      : { difficultyCounts: record.difficultyCounts }),
    languageCounts: record.languageCounts,
    topicCounts: record.topicCounts,
    badges: record.badges,
    calendar: record.calendar,
    completeness: record.completeness,
    provenance: {
      provider: record.provider,
      providerId: record.externalHandle,
      canonicalUrl: record.profileUrl,
      sourceUrl: record.sourceUrl,
      extractionStrategy: record.extractionStrategy,
      schemaVersion: record.schemaVersion,
      completeness: record.completeness,
      fetchedAt: record.fetchedAt.toISOString(),
      stale: false,
    },
  })

export class PrismaProviderProfileRepository implements ProviderProfileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private async userId(authUserId: string) {
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId },
      select: { id: true },
    })
    return user?.id ?? null
  }

  async saveSnapshot(
    authUserId: string,
    providerAccountId: string,
    profile: ProviderProfile,
  ) {
    const parsed = ProviderProfileSchema.parse(profile)
    const userId = await this.userId(authUserId)
    if (userId === null) return
    await this.prisma.providerProfileSnapshot.create({
      data: {
        userId,
        providerAccountId,
        provider: parsed.provider,
        externalHandle: parsed.handle,
        displayName: parsed.displayName ?? null,
        profileUrl: parsed.profileUrl,
        avatarUrl: parsed.avatarUrl ?? null,
        rank: parsed.rank ?? null,
        globalRank: parsed.globalRank ?? null,
        rating: parsed.rating ?? null,
        solvedCount: parsed.solvedCount ?? null,
        acceptanceRate: parsed.acceptanceRate ?? null,
        difficultyCounts: parsed.difficultyCounts ?? Prisma.DbNull,
        languageCounts: parsed.languageCounts,
        topicCounts: parsed.topicCounts,
        badges: parsed.badges,
        calendar: parsed.calendar,
        completeness: parsed.completeness,
        extractionStrategy: parsed.provenance.extractionStrategy,
        sourceUrl: parsed.provenance.sourceUrl,
        schemaVersion: parsed.provenance.schemaVersion,
        fetchedAt: new Date(parsed.provenance.fetchedAt),
      },
    })
  }

  async findLatestByAuthUserId(authUserId: string, provider?: ProviderKey) {
    const userId = await this.userId(authUserId)
    if (userId === null) return []
    const records = await this.prisma.providerProfileSnapshot.findMany({
      where: {
        userId,
        ...(provider === undefined
          ? {}
          : { provider: ProviderKeySchema.parse(provider) }),
      },
      orderBy: { fetchedAt: 'desc' },
      distinct: ['providerAccountId'],
    })
    return records.map(profileFromRecord)
  }

  async deleteByAuthUserId(authUserId: string, provider: ProviderKey) {
    const userId = await this.userId(authUserId)
    if (userId === null) return
    await this.prisma.providerProfileSnapshot.deleteMany({
      where: { userId, provider: ProviderKeySchema.parse(provider) },
    })
  }
}

export class InMemoryProviderProfileRepository implements ProviderProfileRepository {
  private readonly records = new Map<
    string,
    Array<{ accountId: string; profile: ProviderProfile }>
  >()

  async saveSnapshot(
    authUserId: string,
    providerAccountId: string,
    profile: ProviderProfile,
  ) {
    const parsed = ProviderProfileSchema.parse(profile)
    const existing = this.records.get(authUserId) ?? []
    this.records.set(authUserId, [
      { accountId: providerAccountId, profile: parsed },
      ...existing.filter((item) => item.accountId !== providerAccountId),
    ])
  }

  async findLatestByAuthUserId(authUserId: string, provider?: ProviderKey) {
    return (this.records.get(authUserId) ?? [])
      .map((item) => item.profile)
      .filter((item) => provider === undefined || item.provider === provider)
  }

  async deleteByAuthUserId(authUserId: string, provider: ProviderKey) {
    this.records.set(
      authUserId,
      (this.records.get(authUserId) ?? []).filter(
        (item) => item.profile.provider !== provider,
      ),
    )
  }
}
