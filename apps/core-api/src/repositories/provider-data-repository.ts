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

export type SolvedProblemTags = {
  providerTags: string[]
  topics: string[]
}

// A problem the provider published without tags is looked up again only after
// this interval, so it cannot block enrichment of the rest of the backlog.
const TAG_RECHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

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
  // Solved problems on one linked account that still have no tags and were
  // not looked up recently, most recent solves first.
  listUntaggedSolvedIds(
    authUserId: string,
    providerAccountId: string,
    limit: number,
    now?: Date,
  ): Promise<string[]>
  // Record a tag lookup. Every listed ID counts as checked; an entry with
  // tags also replaces the stored tags.
  saveSolvedTags(
    authUserId: string,
    providerAccountId: string,
    checkedIds: readonly string[],
    tags: ReadonlyMap<string, SolvedProblemTags>,
    now?: Date,
  ): Promise<void>
  // Remove public-feed rows (event IDs starting `recent:`) that describe the
  // same submission as a connector row, matched by problem and time.
  deleteSupersededPublicSubmissions(
    authUserId: string,
    providerAccountId: string,
    submissions: readonly { externalId: string; occurredAt: string }[],
  ): Promise<void>
  countSolvedProblems(
    authUserId: string,
    providerAccountId: string,
  ): Promise<number>
  deleteByAuthUserId(authUserId: string, provider: ProviderKey): Promise<void>
}

// Public LeetCode submissions carry no submission ID, so their event IDs are
// synthesized; a connector row for the same submission replaces them.
const PUBLIC_FEED_EVENT_PREFIX = 'recent:'

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
  runtimeMs: number | null
  memoryKb: number | null
  passedTestCount: number | null
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
    ...(record.runtimeMs === null ? {} : { runtimeMs: record.runtimeMs }),
    ...(record.memoryKb === null ? {} : { memoryKb: record.memoryKb }),
    ...(record.passedTestCount === null
      ? {}
      : { passedTestCount: record.passedTestCount }),
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
  providerTags: string[]
  normalizedTopics: string[]
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
    ...(record.providerTags.length === 0
      ? {}
      : { providerTags: record.providerTags }),
    ...(record.normalizedTopics.length === 0
      ? {}
      : { topics: record.normalizedTopics }),
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

// Merge a newly fetched observation into a stored one. A later sync may see
// only a recent window of submissions, so it must not replace the earliest
// accepted time or erase tags that an earlier lookup found.
const mergeSolvedProblem = (
  existing: ProviderSolvedProblem,
  incoming: ProviderSolvedProblem,
): ProviderSolvedProblem => {
  const keepExistingSolve =
    existing.occurredAt !== null &&
    (incoming.occurredAt === null || existing.occurredAt <= incoming.occurredAt)
  const {
    sourceSubmissionId: _incomingSubmission,
    providerTags: _incomingTags,
    topics: _incomingTopics,
    ...rest
  } = incoming
  const sourceSubmissionId = keepExistingSolve
    ? (existing.sourceSubmissionId ?? incoming.sourceSubmissionId)
    : (incoming.sourceSubmissionId ?? existing.sourceSubmissionId)
  const providerTags =
    (incoming.providerTags ?? []).length > 0
      ? incoming.providerTags
      : existing.providerTags
  const topics =
    (incoming.topics ?? []).length > 0 ? incoming.topics : existing.topics
  return {
    ...rest,
    occurredAt: keepExistingSolve ? existing.occurredAt : incoming.occurredAt,
    firstObservedAt:
      existing.firstObservedAt < incoming.firstObservedAt
        ? existing.firstObservedAt
        : incoming.firstObservedAt,
    ...(sourceSubmissionId === undefined ? {} : { sourceSubmissionId }),
    ...(providerTags === undefined || providerTags.length === 0
      ? {}
      : { providerTags }),
    ...(topics === undefined || topics.length === 0 ? {} : { topics }),
  }
}

export class InMemoryProviderDataRepository implements ProviderDataRepository {
  private readonly submissions = new Map<string, ProviderSubmission>()
  private readonly solvedProblems = new Map<string, ProviderSolvedProblem>()
  private readonly ratingChanges = new Map<string, ProviderRatingChange>()
  private readonly participations = new Map<string, ContestParticipation>()
  private readonly tagsCheckedAt = new Map<string, Date>()

  async saveSubmissions(
    _authUserId: string,
    _providerAccountId: string,
    values: readonly ProviderSubmission[],
  ) {
    for (const value of values) {
      const parsed = ProviderSubmissionSchema.parse(value)
      const prefix = `${_authUserId}:${_providerAccountId}:`
      if (
        parsed.eventId.startsWith(PUBLIC_FEED_EVENT_PREFIX) &&
        [...this.submissions.entries()].some(
          ([key, stored]) =>
            key.startsWith(prefix) &&
            stored.provenance.extractionStrategy ===
              'authenticated_connector' &&
            stored.externalId === parsed.externalId &&
            stored.occurredAt === parsed.occurredAt,
        )
      ) {
        continue
      }
      this.submissions.set(
        `${prefix}${parsed.provider}:${parsed.eventId}`,
        parsed,
      )
    }
  }

  async deleteSupersededPublicSubmissions(
    authUserId: string,
    providerAccountId: string,
    submissions: readonly { externalId: string; occurredAt: string }[],
  ) {
    const prefix = `${authUserId}:${providerAccountId}:`
    const keys = new Set(
      submissions.map((item) => `${item.externalId}@${item.occurredAt}`),
    )
    for (const [key, stored] of this.submissions) {
      if (
        key.startsWith(prefix) &&
        stored.eventId.startsWith(PUBLIC_FEED_EVENT_PREFIX) &&
        keys.has(`${stored.externalId}@${stored.occurredAt ?? ''}`)
      ) {
        this.submissions.delete(key)
      }
    }
  }

  async countSolvedProblems(authUserId: string, providerAccountId: string) {
    const prefix = `${authUserId}:${providerAccountId}:`
    return [...this.solvedProblems.keys()].filter((key) =>
      key.startsWith(prefix),
    ).length
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
        existing === undefined ? parsed : mergeSolvedProblem(existing, parsed),
      )
    }
  }

  async listUntaggedSolvedIds(
    authUserId: string,
    providerAccountId: string,
    limit: number,
    now = new Date(),
  ) {
    const prefix = `${authUserId}:${providerAccountId}:`
    return [...this.solvedProblems.entries()]
      .filter(([key, value]) => {
        if (!key.startsWith(prefix) || (value.providerTags ?? []).length > 0)
          return false
        const checkedAt = this.tagsCheckedAt.get(key)
        return (
          checkedAt === undefined ||
          now.getTime() - checkedAt.getTime() >= TAG_RECHECK_INTERVAL_MS
        )
      })
      .map(([, value]) => value)
      .sort((left, right) =>
        (right.occurredAt ?? '').localeCompare(left.occurredAt ?? ''),
      )
      .slice(0, Math.max(0, limit))
      .map((value) => value.externalId)
  }

  async saveSolvedTags(
    authUserId: string,
    providerAccountId: string,
    checkedIds: readonly string[],
    tags: ReadonlyMap<string, SolvedProblemTags>,
    now = new Date(),
  ) {
    const prefix = `${authUserId}:${providerAccountId}:`
    for (const [key, value] of this.solvedProblems) {
      if (!key.startsWith(prefix) || !checkedIds.includes(value.externalId))
        continue
      this.tagsCheckedAt.set(key, now)
      const found = tags.get(value.externalId)
      if (found === undefined || found.providerTags.length === 0) continue
      this.solvedProblems.set(
        key,
        ProviderSolvedProblemSchema.parse({
          ...value,
          providerTags: found.providerTags,
          ...(found.topics.length === 0 ? {} : { topics: found.topics }),
        }),
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
        if (
          parsed.eventId.startsWith(PUBLIC_FEED_EVENT_PREFIX) &&
          parsed.occurredAt !== undefined &&
          (await transaction.providerSubmission.findFirst({
            where: {
              providerAccountId,
              externalId: parsed.externalId,
              occurredAt: new Date(parsed.occurredAt),
              extractionStrategy: 'authenticated_connector',
            },
            select: { id: true },
          })) !== null
        ) {
          continue
        }
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
            runtimeMs: parsed.runtimeMs ?? null,
            memoryKb: parsed.memoryKb ?? null,
            passedTestCount: parsed.passedTestCount ?? null,
            completeness: parsed.completeness,
            extractionStrategy: parsed.provenance.extractionStrategy,
            sourceUrl: parsed.provenance.sourceUrl,
            schemaVersion: parsed.provenance.schemaVersion,
            fetchedAt: new Date(parsed.provenance.fetchedAt),
          },
          update: {
            ...(parsed.problemTitle === undefined
              ? {}
              : { problemTitle: parsed.problemTitle }),
            verdict: parsed.verdict,
            language: parsed.language ?? null,
            occurredAt: parsed.occurredAt ? new Date(parsed.occurredAt) : null,
            isAccepted: parsed.isAccepted,
            runtimeMs: parsed.runtimeMs ?? null,
            memoryKb: parsed.memoryKb ?? null,
            passedTestCount: parsed.passedTestCount ?? null,
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
        const incoming = ProviderSolvedProblemSchema.parse(value)
        const key = {
          providerAccountId_externalId: {
            providerAccountId,
            externalId: incoming.externalId,
          },
        }
        const stored = await transaction.providerSolvedObservation.findUnique({
          where: key,
        })
        const parsed =
          stored === null
            ? incoming
            : mergeSolvedProblem(solvedFromRecord(stored), incoming)
        const fields = {
          providerEventId: parsed.sourceSubmissionId ?? null,
          canonicalUrl: parsed.canonicalUrl,
          providerTags: parsed.providerTags ?? [],
          normalizedTopics: parsed.topics ?? [],
          occurredAt: parsed.occurredAt ? new Date(parsed.occurredAt) : null,
          lastObservedAt: new Date(parsed.lastObservedAt),
          completeness: parsed.completeness,
          extractionStrategy: parsed.provenance.extractionStrategy,
          sourceUrl: parsed.provenance.sourceUrl,
          schemaVersion: parsed.provenance.schemaVersion,
        }
        if (stored === null) {
          await transaction.providerSolvedObservation.create({
            data: {
              ...fields,
              userId,
              providerAccountId,
              provider: parsed.provider,
              externalId: parsed.externalId,
              firstObservedAt: new Date(parsed.firstObservedAt),
            },
          })
        } else {
          await transaction.providerSolvedObservation.update({
            where: key,
            data: fields,
          })
        }
      }
    })
  }

  async listUntaggedSolvedIds(
    authUserId: string,
    providerAccountId: string,
    limit: number,
    now = new Date(),
  ) {
    const userId = await this.userId(authUserId)
    if (userId === null || limit <= 0) return []
    const records = await this.prisma.providerSolvedObservation.findMany({
      where: {
        userId,
        providerAccountId,
        providerTags: { isEmpty: true },
        OR: [
          { tagsCheckedAt: null },
          {
            tagsCheckedAt: {
              lt: new Date(now.getTime() - TAG_RECHECK_INTERVAL_MS),
            },
          },
        ],
      },
      orderBy: [{ occurredAt: { sort: 'desc', nulls: 'last' } }],
      take: limit,
      select: { externalId: true },
    })
    return records.map((record) => record.externalId)
  }

  async saveSolvedTags(
    authUserId: string,
    providerAccountId: string,
    checkedIds: readonly string[],
    tags: ReadonlyMap<string, SolvedProblemTags>,
    now = new Date(),
  ) {
    const userId = await this.userId(authUserId)
    if (userId === null || checkedIds.length === 0) return
    await this.prisma.$transaction(async (transaction) => {
      await transaction.providerSolvedObservation.updateMany({
        where: {
          userId,
          providerAccountId,
          externalId: { in: [...checkedIds] },
        },
        data: { tagsCheckedAt: now },
      })
      for (const [externalId, found] of tags) {
        if (!checkedIds.includes(externalId) || found.providerTags.length === 0)
          continue
        await transaction.providerSolvedObservation.updateMany({
          where: { userId, providerAccountId, externalId },
          data: {
            providerTags: found.providerTags,
            normalizedTopics: found.topics,
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

  async deleteSupersededPublicSubmissions(
    authUserId: string,
    providerAccountId: string,
    submissions: readonly { externalId: string; occurredAt: string }[],
  ) {
    const userId = await this.userId(authUserId)
    if (userId === null || submissions.length === 0) return
    await this.prisma.providerSubmission.deleteMany({
      where: {
        userId,
        providerAccountId,
        providerEventId: { startsWith: PUBLIC_FEED_EVENT_PREFIX },
        OR: submissions.map((item) => ({
          externalId: item.externalId,
          occurredAt: new Date(item.occurredAt),
        })),
      },
    })
  }

  async countSolvedProblems(authUserId: string, providerAccountId: string) {
    const userId = await this.userId(authUserId)
    if (userId === null) return 0
    return this.prisma.providerSolvedObservation.count({
      where: { userId, providerAccountId },
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
