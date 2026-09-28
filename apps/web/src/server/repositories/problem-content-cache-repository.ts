import {
  ProblemContentSchema,
  ProviderAvailabilitySchema,
  ProviderKeySchema,
  type ProblemContent,
  type ProviderAvailability,
  type ProviderKey,
} from '@algomemtor/shared-contracts'

import { Prisma, type PrismaClient } from '../generated/prisma/client'

export type PersistedProblemContent = {
  provider: ProviderKey
  externalId: string
  content: ProblemContent
  availability: ProviderAvailability
  fetchedAtMs: number
  expiresAtMs: number
}

export interface ProblemContentCacheRepository {
  find(
    provider: ProviderKey,
    externalId: string,
  ): Promise<PersistedProblemContent | null>
  save(value: PersistedProblemContent): Promise<void>
}

const contentFromRecord = (record: {
  provider: string
  externalId: string
  title: string
  canonicalUrl: string
  statementHtml: string | null
  statementText: string | null
  constraints: Prisma.JsonValue | null
  examples: Prisma.JsonValue | null
  hints: Prisma.JsonValue | null
  publicSolutionHtml: string | null
  isPaidOnly: boolean
  completeness: string
  extractionStrategy: string
  sourceUrl: string
  schemaVersion: string
  fetchedAt: Date
}) =>
  ProblemContentSchema.parse({
    provider: record.provider,
    externalId: record.externalId,
    title: record.title,
    canonicalUrl: record.canonicalUrl,
    ...(record.statementHtml === null
      ? {}
      : { statementHtml: record.statementHtml }),
    ...(record.statementText === null
      ? {}
      : { statementText: record.statementText }),
    constraints: Array.isArray(record.constraints) ? record.constraints : [],
    examples: Array.isArray(record.examples) ? record.examples : [],
    hints: Array.isArray(record.hints) ? record.hints : [],
    ...(record.publicSolutionHtml === null
      ? {}
      : { publicSolutionHtml: record.publicSolutionHtml }),
    isPaidOnly: record.isPaidOnly,
    completeness: record.completeness,
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

export class PrismaProblemContentCacheRepository implements ProblemContentCacheRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async find(provider: ProviderKey, externalId: string) {
    const record = await this.prisma.problemContentCache.findUnique({
      where: {
        provider_externalId: {
          provider: ProviderKeySchema.parse(provider),
          externalId,
        },
      },
    })
    if (record === null) return null
    return {
      provider: ProviderKeySchema.parse(record.provider),
      externalId: record.externalId,
      content: contentFromRecord(record),
      availability: ProviderAvailabilitySchema.parse(record.availability),
      fetchedAtMs: record.fetchedAt.getTime(),
      expiresAtMs: record.expiresAt.getTime(),
    }
  }

  async save(value: PersistedProblemContent) {
    const parsed = ProblemContentSchema.parse(value.content)
    const provider = ProviderKeySchema.parse(value.provider)
    const fetchedAt = new Date(value.fetchedAtMs)
    const expiresAt = new Date(value.expiresAtMs)
    await this.prisma.problemContentCache.upsert({
      where: {
        provider_externalId: { provider, externalId: value.externalId },
      },
      create: {
        provider,
        externalId: value.externalId,
        title: parsed.title,
        canonicalUrl: parsed.canonicalUrl,
        statementHtml: parsed.statementHtml ?? null,
        statementText: parsed.statementText ?? null,
        constraints: parsed.constraints,
        examples: parsed.examples,
        hints: parsed.hints,
        publicSolutionHtml: parsed.publicSolutionHtml ?? null,
        isPaidOnly: parsed.isPaidOnly,
        contentAvailable: parsed.statementText !== undefined,
        extractionStrategy: parsed.provenance.extractionStrategy,
        sourceUrl: parsed.provenance.sourceUrl,
        schemaVersion: parsed.provenance.schemaVersion,
        completeness: parsed.completeness,
        availability: ProviderAvailabilitySchema.parse(value.availability),
        fetchedAt,
        expiresAt,
      },
      update: {
        title: parsed.title,
        canonicalUrl: parsed.canonicalUrl,
        statementHtml: parsed.statementHtml ?? null,
        statementText: parsed.statementText ?? null,
        constraints: parsed.constraints,
        examples: parsed.examples,
        hints: parsed.hints,
        publicSolutionHtml: parsed.publicSolutionHtml ?? null,
        isPaidOnly: parsed.isPaidOnly,
        contentAvailable: parsed.statementText !== undefined,
        extractionStrategy: parsed.provenance.extractionStrategy,
        sourceUrl: parsed.provenance.sourceUrl,
        schemaVersion: parsed.provenance.schemaVersion,
        completeness: parsed.completeness,
        availability: ProviderAvailabilitySchema.parse(value.availability),
        fetchedAt,
        expiresAt,
      },
    })
  }
}

export class InMemoryProblemContentCacheRepository implements ProblemContentCacheRepository {
  private readonly values = new Map<string, PersistedProblemContent>()

  async find(provider: ProviderKey, externalId: string) {
    const value = this.values.get(`${provider}:${externalId}`)
    return value === undefined
      ? null
      : { ...value, content: ProblemContentSchema.parse(value.content) }
  }

  async save(value: PersistedProblemContent) {
    const parsed = ProblemContentSchema.parse(value.content)
    this.values.set(`${value.provider}:${value.externalId}`, {
      ...value,
      content: parsed,
    })
  }
}
