import {
  ExternalProblemSummarySchema,
  ProviderAvailabilitySchema,
  ProviderKeySchema,
  type ExternalProblemSummary,
  type ProviderKey,
} from '@algomemtor/shared-contracts'
import { z } from 'zod'

import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import { createLeetCodeProblemUrl } from '../integrations/leetcode/leetcode-url.js'
import type {
  PersistedProblemCatalog,
  ProblemReference,
  ProblemMetadataCache,
} from '../integrations/providers/problem-metadata-cache.js'

const PublicStatsSchema = z
  .object({ solvedCount: z.number().int().nonnegative().optional() })
  .strict()

const PROBLEM_CACHE_WRITE_BATCH_SIZE = 1_000

const problemFromRecord = (record: {
  provider: string
  externalId: string
  title: string
  canonicalUrl: string
  providerDifficulty: Prisma.JsonValue | null
  normalizedDifficulty: string | null
  providerTags: string[]
  normalizedTopics: string[]
  publicStats: Prisma.JsonValue | null
  acceptanceRate: number | null
  isPaidOnly: boolean
  contentAvailable: boolean
  extractionStrategy: string
  sourceUrl: string
  schemaVersion: string
  completeness: string
  stale: boolean
  fetchedAt: Date
}): ExternalProblemSummary => {
  const publicStats =
    record.publicStats === null
      ? undefined
      : PublicStatsSchema.parse(record.publicStats)

  return ExternalProblemSummarySchema.parse({
    provider: record.provider,
    externalId: record.externalId,
    title: record.title,
    canonicalUrl: record.canonicalUrl,
    ...(record.providerDifficulty === null
      ? {}
      : { providerDifficulty: record.providerDifficulty }),
    ...(record.normalizedDifficulty === null
      ? {}
      : { normalizedDifficulty: record.normalizedDifficulty }),
    providerTags: record.providerTags,
    topics: record.normalizedTopics,
    ...(publicStats?.solvedCount === undefined
      ? {}
      : { solvedCount: publicStats.solvedCount }),
    ...(record.acceptanceRate === null
      ? {}
      : { acceptanceRate: record.acceptanceRate }),
    isPaidOnly: record.isPaidOnly,
    contentAvailable: record.contentAvailable,
    extractionStrategy: record.extractionStrategy,
    sourceUrl: record.sourceUrl,
    schemaVersion: record.schemaVersion,
    completeness: record.completeness,
    stale: record.stale,
    fetchedAt: record.fetchedAt.toISOString(),
  })
}

export class PrismaExternalProblemCacheRepository implements ProblemMetadataCache {
  constructor(private readonly prisma: PrismaClient) {}

  async findByReferences(references: readonly ProblemReference[]) {
    const unique = [
      ...new Map(
        references.map((reference) => [
          `${reference.provider}:${reference.externalId}`,
          {
            provider: ProviderKeySchema.parse(reference.provider),
            externalId: reference.externalId,
          },
        ]),
      ).values(),
    ]
    if (unique.length === 0) return []
    // The LeetCode catalog is keyed by question number, but activity refers
    // to problems by title slug. A slug resolves through the canonical URL,
    // and the match is returned under the slug the caller asked for.
    const leetCodeSlugByUrl = new Map<string, string>()
    for (const reference of unique) {
      if (reference.provider !== 'leetcode') continue
      if (/^\d+$/.test(reference.externalId)) continue
      try {
        leetCodeSlugByUrl.set(
          createLeetCodeProblemUrl(reference.externalId),
          reference.externalId,
        )
      } catch {
        // Not a valid slug; only the exact-ID match applies.
      }
    }
    const records = await this.prisma.externalProblemCache.findMany({
      where: {
        OR: [
          ...unique.map((reference) => ({
            provider: reference.provider,
            externalId: reference.externalId,
          })),
          ...(leetCodeSlugByUrl.size === 0
            ? []
            : [
                {
                  provider: 'leetcode',
                  canonicalUrl: { in: [...leetCodeSlugByUrl.keys()] },
                },
              ]),
        ],
      },
    })
    return records.flatMap((record) => {
      const problem = problemFromRecord(record)
      const slug =
        problem.provider === 'leetcode'
          ? leetCodeSlugByUrl.get(problem.canonicalUrl)
          : undefined
      return slug === undefined || slug === problem.externalId
        ? [problem]
        : [{ ...problem, externalId: slug }]
    })
  }

  async findByProvider(provider: ProviderKey) {
    const validatedProvider = ProviderKeySchema.parse(provider)
    const records = await this.prisma.externalProblemCache.findMany({
      where: { provider: validatedProvider },
      orderBy: { externalId: 'asc' },
    })

    const first = records[0]

    if (first === undefined) {
      return null
    }

    const hasInconsistentFreshness = records.some(
      (record) =>
        record.fetchedAt.getTime() !== first.fetchedAt.getTime() ||
        record.expiresAt.getTime() !== first.expiresAt.getTime() ||
        record.availability !== first.availability,
    )

    if (hasInconsistentFreshness) {
      throw new Error(
        'The persisted provider catalog has inconsistent freshness.',
      )
    }

    return {
      provider: validatedProvider,
      problems: records.map(problemFromRecord),
      availability: ProviderAvailabilitySchema.parse(first.availability),
      fetchedAtMs: first.fetchedAt.getTime(),
      expiresAtMs: first.expiresAt.getTime(),
    }
  }

  async replaceProviderCatalog(catalog: PersistedProblemCatalog) {
    const provider = ProviderKeySchema.parse(catalog.provider)
    const availability = ProviderAvailabilitySchema.parse(catalog.availability)
    const fetchedAt = new Date(catalog.fetchedAtMs)
    const expiresAt = new Date(catalog.expiresAtMs)

    if (
      !Number.isFinite(fetchedAt.getTime()) ||
      !Number.isFinite(expiresAt.getTime()) ||
      fetchedAt >= expiresAt
    ) {
      throw new Error('The provider catalog freshness window is invalid.')
    }

    const problems = ExternalProblemSummarySchema.array().parse(
      catalog.problems,
    )

    if (problems.some((problem) => problem.provider !== provider)) {
      throw new Error('The provider catalog contains a mismatched problem.')
    }

    if (problems.length === 0) {
      throw new Error('The provider catalog cannot be empty.')
    }

    const identities = new Set(
      problems.map((problem) => `${problem.provider}:${problem.externalId}`),
    )

    if (identities.size !== problems.length) {
      throw new Error('The provider catalog contains duplicate problems.')
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.externalProblemCache.deleteMany({ where: { provider } })

      for (
        let offset = 0;
        offset < problems.length;
        offset += PROBLEM_CACHE_WRITE_BATCH_SIZE
      ) {
        await transaction.externalProblemCache.createMany({
          data: problems
            .slice(offset, offset + PROBLEM_CACHE_WRITE_BATCH_SIZE)
            .map((problem) => ({
              provider,
              externalId: problem.externalId,
              title: problem.title,
              canonicalUrl: problem.canonicalUrl,
              providerDifficulty:
                problem.providerDifficulty === undefined
                  ? Prisma.DbNull
                  : problem.providerDifficulty,
              normalizedDifficulty: problem.normalizedDifficulty ?? null,
              providerTags: problem.providerTags,
              normalizedTopics: problem.topics,
              publicStats:
                problem.solvedCount === undefined
                  ? Prisma.DbNull
                  : { solvedCount: problem.solvedCount },
              acceptanceRate: problem.acceptanceRate ?? null,
              isPaidOnly: problem.isPaidOnly ?? false,
              contentAvailable: problem.contentAvailable ?? false,
              extractionStrategy: problem.extractionStrategy ?? 'official_json',
              sourceUrl: problem.sourceUrl ?? problem.canonicalUrl,
              schemaVersion: problem.schemaVersion ?? 'legacy-v1',
              completeness: problem.completeness ?? 'unknown',
              stale: problem.stale ?? false,
              availability,
              fetchedAt,
              expiresAt,
            })),
        })
      }
    })
  }
}
