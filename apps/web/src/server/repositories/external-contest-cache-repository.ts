import {
  ExternalContestSchema,
  ProviderAvailabilitySchema,
  ProviderKeySchema,
  type ProviderKey,
} from '@algomemtor/shared-contracts'
import type { PrismaClient } from '../generated/prisma/client'
import type {
  ContestCache,
  PersistedContestCatalog,
} from '../integrations/providers/contest-cache'

const contestFromRecord = (record: {
  provider: string
  externalId: string
  name: string
  canonicalUrl: string
  phase: string | null
  startsAt: Date | null
  endsAt: Date | null
  durationSeconds: number | null
  isRated: boolean | null
  status: string
  extractionStrategy: string
  sourceUrl: string
  schemaVersion: string
  completeness: string
  fetchedAt: Date
}) =>
  ExternalContestSchema.parse({
    provider: record.provider,
    externalId: record.externalId,
    name: record.name,
    canonicalUrl: record.canonicalUrl,
    ...(record.phase === null ? {} : { phase: record.phase }),
    ...(record.startsAt === null
      ? {}
      : { startsAt: record.startsAt.toISOString() }),
    ...(record.endsAt === null ? {} : { endsAt: record.endsAt.toISOString() }),
    ...(record.durationSeconds === null
      ? {}
      : { durationSeconds: record.durationSeconds }),
    ...(record.isRated === null ? {} : { isRated: record.isRated }),
    status: record.status,
    provenance: {
      provider: record.provider,
      providerId: record.externalId,
      canonicalUrl: record.canonicalUrl,
      sourceUrl: record.sourceUrl,
      extractionStrategy: record.extractionStrategy,
      schemaVersion: record.schemaVersion,
      completeness: record.completeness,
      fetchedAt: record.fetchedAt.toISOString(),
      stale: false,
    },
  })

export class PrismaExternalContestCacheRepository implements ContestCache {
  constructor(private readonly prisma: PrismaClient) {}

  async findByProvider(
    provider: ProviderKey,
  ): Promise<PersistedContestCatalog | null> {
    const validatedProvider = ProviderKeySchema.parse(provider)
    const records = await this.prisma.externalContest.findMany({
      where: { provider: validatedProvider },
      orderBy: { startsAt: 'asc' },
    })
    const first = records[0]
    if (first === undefined) return null
    const freshness = records.some(
      (record) =>
        record.fetchedAt.getTime() !== first.fetchedAt.getTime() ||
        record.expiresAt.getTime() !== first.expiresAt.getTime(),
    )
    if (freshness)
      throw new Error(
        'The persisted contest catalog has inconsistent freshness.',
      )
    return {
      provider: validatedProvider,
      contests: records.map(contestFromRecord),
      availability: 'available',
      fetchedAtMs: first.fetchedAt.getTime(),
      expiresAtMs: first.expiresAt.getTime(),
    }
  }

  async replaceProviderCatalog(catalog: PersistedContestCatalog) {
    const provider = ProviderKeySchema.parse(catalog.provider)
    const availability = ProviderAvailabilitySchema.parse(catalog.availability)
    const fetchedAt = new Date(catalog.fetchedAtMs)
    const expiresAt = new Date(catalog.expiresAtMs)
    const contests = ExternalContestSchema.array().parse(catalog.contests)
    if (
      !Number.isFinite(fetchedAt.getTime()) ||
      !Number.isFinite(expiresAt.getTime()) ||
      fetchedAt >= expiresAt ||
      contests.length === 0 ||
      contests.some((contest) => contest.provider !== provider)
    ) {
      throw new Error('The provider contest catalog is invalid.')
    }
    const identities = new Set(
      contests.map((contest) => `${contest.provider}:${contest.externalId}`),
    )
    if (identities.size !== contests.length)
      throw new Error('The provider contest catalog contains duplicates.')
    await this.prisma.$transaction(async (transaction) => {
      await transaction.externalContest.deleteMany({ where: { provider } })
      await transaction.externalContest.createMany({
        data: contests.map((contest) => ({
          provider,
          externalId: contest.externalId,
          name: contest.name,
          canonicalUrl: contest.canonicalUrl,
          phase: contest.phase ?? null,
          startsAt: contest.startsAt ? new Date(contest.startsAt) : null,
          endsAt: contest.endsAt ? new Date(contest.endsAt) : null,
          durationSeconds: contest.durationSeconds ?? null,
          isRated: contest.isRated ?? null,
          status: contest.status,
          extractionStrategy: contest.provenance.extractionStrategy,
          sourceUrl: contest.provenance.sourceUrl,
          schemaVersion: contest.provenance.schemaVersion,
          completeness: contest.provenance.completeness,
          fetchedAt,
          expiresAt,
          availability,
        })),
      })
    })
  }
}

export class InMemoryExternalContestCacheRepository implements ContestCache {
  private readonly records = new Map<ProviderKey, PersistedContestCatalog>()

  async findByProvider(provider: ProviderKey) {
    const value = this.records.get(provider)
    return value === undefined
      ? null
      : { ...value, contests: [...value.contests] }
  }

  async replaceProviderCatalog(catalog: PersistedContestCatalog) {
    this.records.set(catalog.provider, {
      ...catalog,
      contests: catalog.contests.map((contest) => ({ ...contest })),
    })
  }
}
