import {
  ContestParticipationSchema,
  ProviderKeySchema,
  ProviderRatingChangeSchema,
  ProviderSolvedProblemSchema,
  ProviderSubmissionSchema,
  type ContestParticipation,
  type ProviderKey,
  type ProviderRatingChange,
  type ProviderSolvedProblem,
  type ProviderSubmission,
} from '@algomemtor/shared-contracts'

import { Prisma, type PrismaClient } from '../generated/prisma/client.js'

export interface ProviderDataRepository {
  saveSubmissions(
    authUserId: string,
    providerAccountId: string,
    submissions: readonly ProviderSubmission[],
  ): Promise<void>
  saveSolvedProblems(
    authUserId: string,
    providerAccountId: string,
    solvedProblems: readonly ProviderSolvedProblem[],
  ): Promise<void>
  saveRatingChanges(
    authUserId: string,
    providerAccountId: string,
    changes: readonly ProviderRatingChange[],
  ): Promise<void>
  saveContestParticipations(
    authUserId: string,
    providerAccountId: string,
    participations: readonly ContestParticipation[],
  ): Promise<void>
  listSubmissions(
    authUserId: string,
    provider?: ProviderKey,
  ): Promise<ProviderSubmission[]>
  listSolvedProblems(
    authUserId: string,
    provider?: ProviderKey,
  ): Promise<ProviderSolvedProblem[]>
  listRatingChanges(
    authUserId: string,
    provider?: ProviderKey,
  ): Promise<ProviderRatingChange[]>
  listContestParticipations(
    authUserId: string,
    provider?: ProviderKey,
  ): Promise<ContestParticipation[]>
  deleteByAuthUserId(authUserId: string, provider: ProviderKey): Promise<void>
}

type DatabaseProvenance = {
  extractionStrategy: string
  sourceUrl: string
  schemaVersion: string
  completeness: string
  fetchedAt: Date
}

const provenance = (
  record: DatabaseProvenance,
  provider: string,
  providerId: string,
  canonicalUrl: string,
) => ({
  provider,
  providerId,
  canonicalUrl,
  sourceUrl: record.sourceUrl,
  extractionStrategy: record.extractionStrategy,
  schemaVersion: record.schemaVersion,
  completeness: record.completeness,
  fetchedAt: record.fetchedAt.toISOString(),
  stale: false,
})

const submissionFromRecord = (record: {
  provider: string
  externalId: string
  providerEventId: string
  problemTitle: string | null
  canonicalUrl: string
  verdict: string
  language: string | null
  occurredAt: Date | null
  isAccepted: boolean
  completeness: string
  extractionStrategy: string
  sourceUrl: string
  schemaVersion: string
  fetchedAt: Date
}) =>
  ProviderSubmissionSchema.parse({
    provider: record.provider,
    externalId: record.externalId,
    eventId: record.providerEventId,
    ...(record.problemTitle === null
      ? {}
      : { problemTitle: record.problemTitle }),
    canonicalUrl: record.canonicalUrl,
    verdict: record.verdict,
    ...(record.language === null ? {} : { language: record.language }),
    ...(record.occurredAt === null
      ? {}
      : { occurredAt: record.occurredAt.toISOString() }),
    isAccepted: record.isAccepted,
    completeness: record.completeness,
    provenance: provenance(
      record,
      record.provider,
      record.providerEventId,
      record.canonicalUrl,
    ),
  })

const solvedFromRecord = (record: {
  provider: string
  externalId: string
  canonicalUrl: string
  occurredAt: Date | null
  firstObservedAt: Date
  lastObservedAt: Date
  providerEventId: string | null
  completeness: string
  extractionStrategy: string
  sourceUrl: string
  schemaVersion: string
}) =>
  ProviderSolvedProblemSchema.parse({
    provider: record.provider,
    externalId: record.externalId,
    canonicalUrl: record.canonicalUrl,
    occurredAt: record.occurredAt?.toISOString() ?? null,
    firstObservedAt: record.firstObservedAt.toISOString(),
    lastObservedAt: record.lastObservedAt.toISOString(),
    ...(record.providerEventId === null
      ? {}
      : { sourceSubmissionId: record.providerEventId }),
    completeness: record.completeness,
    provenance: provenance(
      {
        extractionStrategy: record.extractionStrategy,
        sourceUrl: record.sourceUrl,
        schemaVersion: record.schemaVersion,
        completeness: record.completeness,
        fetchedAt: record.lastObservedAt,
      },
      record.provider,
      record.externalId,
      record.canonicalUrl,
    ),
  })

const ratingFromRecord = (record: {
  provider: string
  eventId: string
  contestId: string | null
  contestName: string | null
  canonicalUrl: string
  occurredAt: Date
  oldRating: number
  newRating: number
  delta: number
  providerPercentile: number | null
  completeness: string
  extractionStrategy: string
  sourceUrl: string
  schemaVersion: string
}) =>
  ProviderRatingChangeSchema.parse({
    provider: record.provider,
    eventId: record.eventId,
    ...(record.contestId === null ? {} : { contestId: record.contestId }),
    ...(record.contestName === null ? {} : { contestName: record.contestName }),
    occurredAt: record.occurredAt.toISOString(),
    oldRating: record.oldRating,
    newRating: record.newRating,
    delta: record.delta,
    ...(record.providerPercentile === null
      ? {}
      : { providerPercentile: record.providerPercentile }),
    provenance: provenance(
      {
        extractionStrategy: record.extractionStrategy,
        sourceUrl: record.sourceUrl,
        schemaVersion: record.schemaVersion,
        completeness: record.completeness,
        fetchedAt: record.occurredAt,
      },
      record.provider,
      record.eventId,
      record.canonicalUrl,
    ),
  })

const participationFromRecord = (record: {
  provider: string
  contestId: string
  contestName: string | null
  canonicalUrl: string
  rank: number | null
  score: number | null
  ratingChange: number | null
  oldRating: number | null
  newRating: number | null
  attendedAt: Date | null
  extractionStrategy: string
  sourceUrl: string
  schemaVersion: string
  completeness: string
}) =>
  ContestParticipationSchema.parse({
    provider: record.provider,
    contestId: record.contestId,
    ...(record.contestName === null ? {} : { contestName: record.contestName }),
    ...(record.rank === null ? {} : { rank: record.rank }),
    ...(record.score === null ? {} : { score: record.score }),
    ...(record.ratingChange === null
      ? {}
      : { ratingChange: record.ratingChange }),
    ...(record.oldRating === null ? {} : { oldRating: record.oldRating }),
    ...(record.newRating === null ? {} : { newRating: record.newRating }),
    ...(record.attendedAt === null
      ? {}
      : { attendedAt: record.attendedAt.toISOString() }),
    provenance: provenance(
      {
        extractionStrategy: record.extractionStrategy,
        sourceUrl: record.sourceUrl,
        schemaVersion: record.schemaVersion,
        completeness: record.completeness,
        fetchedAt: record.attendedAt ?? new Date(0),
      },
      record.provider,
      record.contestId,
      record.canonicalUrl,
    ),
  })

const parseProvider = (provider?: ProviderKey) =>
  provider === undefined ? undefined : ProviderKeySchema.parse(provider)

export class InMemoryProviderDataRepository implements ProviderDataRepository {
  private readonly submissions = new Map<string, ProviderSubmission>()
  private readonly solvedProblems = new Map<string, ProviderSolvedProblem>()
  private readonly ratingChanges = new Map<string, ProviderRatingChange>()
  private readonly participations = new Map<string, ContestParticipation>()

  async saveSubmissions(
    _authUserId: string,
    _providerAccountId: string,
    values: readonly ProviderSubmission[],
  ) {
    for (const value of values) {
      const parsed = ProviderSubmissionSchema.parse(value)
      this.submissions.set(
        `${_authUserId}:${_providerAccountId}:${parsed.provider}:${parsed.eventId}`,
        parsed,
      )
    }
  }

  async saveSolvedProblems(
    _authUserId: string,
    _providerAccountId: string,
    values: readonly ProviderSolvedProblem[],
  ) {
    for (const value of values) {
      const parsed = ProviderSolvedProblemSchema.parse(value)
      const key = `${_authUserId}:${_providerAccountId}:${parsed.provider}:${parsed.externalId}`
      const existing = this.solvedProblems.get(key)
      this.solvedProblems.set(
        key,
        existing === undefined
          ? parsed
          : {
              ...parsed,
              firstObservedAt:
                existing.firstObservedAt < parsed.firstObservedAt
                  ? existing.firstObservedAt
                  : parsed.firstObservedAt,
            },
      )
    }
  }

  async saveRatingChanges(
    _authUserId: string,
    _providerAccountId: string,
    values: readonly ProviderRatingChange[],
  ) {
    for (const value of values) {
      const parsed = ProviderRatingChangeSchema.parse(value)
      this.ratingChanges.set(
        `${_authUserId}:${_providerAccountId}:${parsed.provider}:${parsed.eventId}`,
        parsed,
      )
    }
  }

  async saveContestParticipations(
    _authUserId: string,
    _providerAccountId: string,
    values: readonly ContestParticipation[],
  ) {
    for (const value of values) {
      const parsed = ContestParticipationSchema.parse(value)
      this.participations.set(
        `${_authUserId}:${_providerAccountId}:${parsed.provider}:${parsed.contestId}`,
        parsed,
      )
    }
  }

  async listSubmissions(authUserId: string, provider?: ProviderKey) {
    const parsedProvider = parseProvider(provider)
    return [...this.submissions.entries()]
      .filter(
        ([key, value]) =>
          key.startsWith(`${authUserId}:`) &&
          (parsedProvider === undefined || value.provider === parsedProvider),
      )
      .map(([, value]) => value)
      .sort((left, right) =>
        (right.occurredAt ?? '').localeCompare(left.occurredAt ?? ''),
      )
  }

  async listSolvedProblems(authUserId: string, provider?: ProviderKey) {
    const parsedProvider = parseProvider(provider)
    return [...this.solvedProblems.entries()]
      .filter(
        ([key, value]) =>
          key.startsWith(`${authUserId}:`) &&
          (parsedProvider === undefined || value.provider === parsedProvider),
      )
      .map(([, value]) => value)
  }

  async listRatingChanges(authUserId: string, provider?: ProviderKey) {
    const parsedProvider = parseProvider(provider)
    return [...this.ratingChanges.entries()]
      .filter(
        ([key, value]) =>
          key.startsWith(`${authUserId}:`) &&
          (parsedProvider === undefined || value.provider === parsedProvider),
      )
      .map(([, value]) => value)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
  }

  async listContestParticipations(authUserId: string, provider?: ProviderKey) {
    const parsedProvider = parseProvider(provider)
    return [...this.participations.entries()]
      .filter(
        ([key, value]) =>
          key.startsWith(`${authUserId}:`) &&
          (parsedProvider === undefined || value.provider === parsedProvider),
      )
      .map(([, value]) => value)
  }

  async deleteByAuthUserId(authUserId: string, provider: ProviderKey) {
    const parsedProvider = ProviderKeySchema.parse(provider)
    for (const [key, value] of this.submissions)
      if (key.startsWith(`${authUserId}:`) && value.provider === parsedProvider)
        this.submissions.delete(key)
    for (const [key, value] of this.solvedProblems)
      if (key.startsWith(`${authUserId}:`) && value.provider === parsedProvider)
        this.solvedProblems.delete(key)
    for (const [key, value] of this.ratingChanges)
      if (key.startsWith(`${authUserId}:`) && value.provider === parsedProvider)
        this.ratingChanges.delete(key)
    for (const [key, value] of this.participations)
      if (key.startsWith(`${authUserId}:`) && value.provider === parsedProvider)
        this.participations.delete(key)
  }
}

export class PrismaProviderDataRepository implements ProviderDataRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private async userId(authUserId: string) {
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId },
      select: { id: true },
    })
    return user?.id ?? null
  }

  async saveSubmissions(
    authUserId: string,
    providerAccountId: string,
    values: readonly ProviderSubmission[],
  ) {
    const userId = await this.userId(authUserId)
    if (userId === null) return
    await this.prisma.$transaction(async (transaction) => {
      for (const value of values) {
        const parsed = ProviderSubmissionSchema.parse(value)
        await transaction.providerSubmission.upsert({
          where: {
            providerAccountId_providerEventId: {
              providerAccountId,
              providerEventId: parsed.eventId,
            },
          },
          create: {
            userId,
            providerAccountId,
            provider: parsed.provider,
            externalId: parsed.externalId,
            providerEventId: parsed.eventId,
            problemTitle: parsed.problemTitle ?? null,
            canonicalUrl: parsed.canonicalUrl,
            verdict: parsed.verdict,
            language: parsed.language ?? null,
            occurredAt: parsed.occurredAt ? new Date(parsed.occurredAt) : null,
            isAccepted: parsed.isAccepted,
            completeness: parsed.completeness,
            extractionStrategy: parsed.provenance.extractionStrategy,
            sourceUrl: parsed.provenance.sourceUrl,
            schemaVersion: parsed.provenance.schemaVersion,
            fetchedAt: new Date(parsed.provenance.fetchedAt),
          },
          update: {
            verdict: parsed.verdict,
            language: parsed.language ?? null,
            occurredAt: parsed.occurredAt ? new Date(parsed.occurredAt) : null,
            isAccepted: parsed.isAccepted,
            completeness: parsed.completeness,
            extractionStrategy: parsed.provenance.extractionStrategy,
            sourceUrl: parsed.provenance.sourceUrl,
            schemaVersion: parsed.provenance.schemaVersion,
            fetchedAt: new Date(parsed.provenance.fetchedAt),
          },
        })
      }
    })
  }

  async saveSolvedProblems(
    authUserId: string,
    providerAccountId: string,
    values: readonly ProviderSolvedProblem[],
  ) {
    const userId = await this.userId(authUserId)
    if (userId === null) return
    await this.prisma.$transaction(async (transaction) => {
      for (const value of values) {
        const parsed = ProviderSolvedProblemSchema.parse(value)
        const occurredAt = parsed.occurredAt
          ? new Date(parsed.occurredAt)
          : null
        await transaction.providerSolvedObservation.upsert({
          where: {
            providerAccountId_externalId: {
              providerAccountId,
              externalId: parsed.externalId,
            },
          },
          create: {
            userId,
            providerAccountId,
            provider: parsed.provider,
            externalId: parsed.externalId,
            providerEventId: parsed.sourceSubmissionId ?? null,
            canonicalUrl: parsed.canonicalUrl,
            occurredAt,
            firstObservedAt: new Date(parsed.firstObservedAt),
            lastObservedAt: new Date(parsed.lastObservedAt),
            completeness: parsed.completeness,
            extractionStrategy: parsed.provenance.extractionStrategy,
            sourceUrl: parsed.provenance.sourceUrl,
            schemaVersion: parsed.provenance.schemaVersion,
          },
          update: {
            providerEventId: parsed.sourceSubmissionId ?? null,
            occurredAt,
            lastObservedAt: new Date(parsed.lastObservedAt),
            completeness: parsed.completeness,
            extractionStrategy: parsed.provenance.extractionStrategy,
            sourceUrl: parsed.provenance.sourceUrl,
            schemaVersion: parsed.provenance.schemaVersion,
          },
        })
      }
    })
  }

  async saveRatingChanges(
    authUserId: string,
    providerAccountId: string,
    values: readonly ProviderRatingChange[],
  ) {
    const userId = await this.userId(authUserId)
    if (userId === null) return
    await this.prisma.$transaction(async (transaction) => {
      for (const value of values) {
        const parsed = ProviderRatingChangeSchema.parse(value)
        await transaction.providerRatingChange.upsert({
          where: {
            providerAccountId_eventId: {
              providerAccountId,
              eventId: parsed.eventId,
            },
          },
          create: {
            userId,
            providerAccountId,
            provider: parsed.provider,
            eventId: parsed.eventId,
            contestId: parsed.contestId ?? null,
            contestName: parsed.contestName ?? null,
            canonicalUrl: parsed.provenance.canonicalUrl,
            occurredAt: new Date(parsed.occurredAt),
            oldRating: parsed.oldRating,
            newRating: parsed.newRating,
            delta: parsed.delta,
            providerPercentile: parsed.providerPercentile ?? null,
            completeness: parsed.provenance.completeness,
            extractionStrategy: parsed.provenance.extractionStrategy,
            sourceUrl: parsed.provenance.sourceUrl,
            schemaVersion: parsed.provenance.schemaVersion,
          },
          update: {
            contestName: parsed.contestName ?? null,
            canonicalUrl: parsed.provenance.canonicalUrl,
            occurredAt: new Date(parsed.occurredAt),
            oldRating: parsed.oldRating,
            newRating: parsed.newRating,
            delta: parsed.delta,
            providerPercentile: parsed.providerPercentile ?? null,
            completeness: parsed.provenance.completeness,
            extractionStrategy: parsed.provenance.extractionStrategy,
            sourceUrl: parsed.provenance.sourceUrl,
            schemaVersion: parsed.provenance.schemaVersion,
          },
        })
      }
    })
  }

  async saveContestParticipations(
    authUserId: string,
    providerAccountId: string,
    values: readonly ContestParticipation[],
  ) {
    const userId = await this.userId(authUserId)
    if (userId === null) return
    await this.prisma.$transaction(async (transaction) => {
      for (const value of values) {
        const parsed = ContestParticipationSchema.parse(value)
        await transaction.contestParticipation.upsert({
          where: {
            providerAccountId_contestId: {
              providerAccountId,
              contestId: parsed.contestId,
            },
          },
          create: {
            userId,
            providerAccountId,
            provider: parsed.provider,
            contestId: parsed.contestId,
            contestName: parsed.contestName ?? null,
            canonicalUrl: parsed.provenance.canonicalUrl,
            rank: parsed.rank ?? null,
            score: parsed.score ?? null,
            ratingChange: parsed.ratingChange ?? null,
            oldRating: parsed.oldRating ?? null,
            newRating: parsed.newRating ?? null,
            attendedAt: parsed.attendedAt ? new Date(parsed.attendedAt) : null,
            extractionStrategy: parsed.provenance.extractionStrategy,
            sourceUrl: parsed.provenance.sourceUrl,
            schemaVersion: parsed.provenance.schemaVersion,
            completeness: parsed.provenance.completeness,
          },
          update: {
            contestName: parsed.contestName ?? null,
            canonicalUrl: parsed.provenance.canonicalUrl,
            rank: parsed.rank ?? null,
            score: parsed.score ?? null,
            ratingChange: parsed.ratingChange ?? null,
            oldRating: parsed.oldRating ?? null,
            newRating: parsed.newRating ?? null,
            attendedAt: parsed.attendedAt ? new Date(parsed.attendedAt) : null,
            completeness: parsed.provenance.completeness,
            extractionStrategy: parsed.provenance.extractionStrategy,
            sourceUrl: parsed.provenance.sourceUrl,
            schemaVersion: parsed.provenance.schemaVersion,
          },
        })
      }
    })
  }

  async listSubmissions(authUserId: string, provider?: ProviderKey) {
    const userId = await this.userId(authUserId)
    if (userId === null) return []
    const records = await this.prisma.providerSubmission.findMany({
      where: {
        userId,
        ...(provider === undefined
          ? {}
          : { provider: ProviderKeySchema.parse(provider) }),
      },
      orderBy: { occurredAt: 'desc' },
    })
    return records.map(submissionFromRecord)
  }

  async listSolvedProblems(authUserId: string, provider?: ProviderKey) {
    const userId = await this.userId(authUserId)
    if (userId === null) return []
    const records = await this.prisma.providerSolvedObservation.findMany({
      where: {
        userId,
        ...(provider === undefined
          ? {}
          : { provider: ProviderKeySchema.parse(provider) }),
      },
      orderBy: { lastObservedAt: 'desc' },
    })
    return records.map(solvedFromRecord)
  }

  async listRatingChanges(authUserId: string, provider?: ProviderKey) {
    const userId = await this.userId(authUserId)
    if (userId === null) return []
    const records = await this.prisma.providerRatingChange.findMany({
      where: {
        userId,
        ...(provider === undefined
          ? {}
          : { provider: ProviderKeySchema.parse(provider) }),
      },
      orderBy: { occurredAt: 'desc' },
    })
    return records.map(ratingFromRecord)
  }

  async listContestParticipations(authUserId: string, provider?: ProviderKey) {
    const userId = await this.userId(authUserId)
    if (userId === null) return []
    const records = await this.prisma.contestParticipation.findMany({
      where: {
        userId,
        ...(provider === undefined
          ? {}
          : { provider: ProviderKeySchema.parse(provider) }),
      },
      orderBy: { attendedAt: 'desc' },
    })
    return records.map(participationFromRecord)
  }

  async deleteByAuthUserId(authUserId: string, provider: ProviderKey) {
    const userId = await this.userId(authUserId)
    if (userId === null) return
    const validatedProvider = ProviderKeySchema.parse(provider)
    await this.prisma.$transaction([
      this.prisma.providerSubmission.deleteMany({
        where: { userId, provider: validatedProvider },
      }),
      this.prisma.providerSolvedObservation.deleteMany({
        where: { userId, provider: validatedProvider },
      }),
      this.prisma.providerRatingChange.deleteMany({
        where: { userId, provider: validatedProvider },
      }),
      this.prisma.contestParticipation.deleteMany({
        where: { userId, provider: validatedProvider },
      }),
    ])
  }
}
