import { randomUUID } from 'node:crypto'

import {
  ProblemHelpSessionSchema,
  ProblemHelpTurnSchema,
  type ProblemHelpBugCategory,
  type ProblemHelpDoubtType,
  type ProblemHelpProblem,
  type ProblemHelpSession,
  type ProblemHelpSource,
  type ProblemHelpStage,
  type ProblemHelpTurn,
  type ProblemHelpTurnKind,
  type ProviderKey,
} from '@algomemtor/shared-contracts'
import { z } from 'zod'

import type { PrismaClient } from '../generated/prisma/client.js'

const authUserIdSchema = z.uuid()
const providerKeys = new Set<string>([
  'codeforces',
  'codechef',
  'leetcode',
  'cses',
])
const isProviderKey = (value: string): value is ProviderKey =>
  providerKeys.has(value)

// ---------------------------------------------------------------------------
// Learner activity used by upsolve, contest analysis and progress reports.
// ---------------------------------------------------------------------------

export type ActivitySubmission = {
  provider: ProviderKey
  // Stable problem key: the LeetCode slug, otherwise the provider ID.
  problemKey: string
  externalId: string
  title?: string
  canonicalUrl: string
  verdict: string
  isAccepted: boolean
  occurredAt: Date
}

export type ActivitySolved = {
  provider: ProviderKey
  problemKey: string
  canonicalUrl: string
  occurredAt?: Date
  topics: string[]
}

export type ActivityParticipation = {
  provider: ProviderKey
  contestId: string
  contestName?: string
  canonicalUrl: string
  rank?: number
  ratingChange?: number
  oldRating?: number
  newRating?: number
  attendedAt?: Date
  completeness: string
  // rated: on the rating history. unrated: submitted live without a rating
  // change (e.g. Div. 3 above its limit). practice: worked on the contest's
  // problems shortly after it ended.
  mode?: ContestParticipationMode
  // For practice: the learner's own sitting on the contest, which stands in
  // for the contest window (problems solved in it are not upsolves).
  session?: { start: Date; end: Date }
}

export type ContestParticipationMode = 'rated' | 'unrated' | 'practice'

export type ActivityRatingChange = {
  provider: ProviderKey
  contestId?: string
  contestName?: string
  occurredAt: Date
  newRating: number
  delta: number
}

export type ManualStatus = {
  status: 'unsolved' | 'attempted' | 'solved'
  source: 'manual' | 'provider_verified'
  occurredAt: Date
}

export type LearnerActivity = {
  submissions: ActivitySubmission[]
  solved: ActivitySolved[]
  participations: ActivityParticipation[]
  ratingChanges: ActivityRatingChange[]
  // Latest learner status per `${provider}:${problemKey}`.
  statuses: Map<string, ManualStatus>
  linkedProviders: ProviderKey[]
}

export type CatalogContest = {
  provider: ProviderKey
  externalId: string
  name: string
  canonicalUrl: string
  startsAt?: Date
  endsAt?: Date
  durationSeconds?: number
}

export type ProblemMeta = {
  provider: ProviderKey
  externalId: string
  problemKey: string
  title: string
  canonicalUrl: string
  rating?: number
  tags: string[]
  topics: string[]
  // Contest position label (Q1, P2) for contest problem lists.
  position?: string
}

export const problemKeyFor = (
  provider: string,
  externalId: string,
  canonicalUrl?: string,
) => {
  if (provider === 'leetcode' && canonicalUrl !== undefined) {
    const slug = /\/problems\/([a-z0-9-]+)/i.exec(canonicalUrl)?.[1]
    if (slug !== undefined) return slug.toLowerCase()
  }
  return provider === 'leetcode' ? externalId.toLowerCase() : externalId
}

// Learner-set upsolve states: skipped, or marked solved by the learner.
export type UpsolveState = 'skipped' | 'solved'

export const problemRef = (provider: string, key: string) =>
  `${provider}:${key}`

// ---------------------------------------------------------------------------
// Owned mentor data.
// ---------------------------------------------------------------------------

export type NewHelpSession = {
  problem: ProblemHelpProblem
  language: string
  doubtType: ProblemHelpDoubtType
  attemptSummary: string
  source: ProblemHelpSource
  stage: ProblemHelpStage
  hintLevel: number
  bugCategory?: ProblemHelpBugCategory
}

export type HelpSessionPatch = {
  stage?: ProblemHelpStage
  hintLevel?: number
  bugCategory?: ProblemHelpBugCategory
  solutionRevealedAt?: Date
  completedAt?: Date
}

export type NewHelpTurn = {
  role: 'learner' | 'mentor'
  kind: ProblemHelpTurnKind
  hintLevel?: number
  content: string
}

export type HelpSessionDetail = {
  session: ProblemHelpSession
  turns: ProblemHelpTurn[]
}

export type StoredReport = {
  payload: unknown
  sourceHash: string
  generatedAt: Date
}

export interface MentorRepository {
  loadActivity(authUserId: string): Promise<LearnerActivity>
  listContests(
    providers: readonly ProviderKey[],
    from: Date,
    to: Date,
  ): Promise<CatalogContest[]>
  listContestProblems(
    provider: ProviderKey,
    contestId: string,
  ): Promise<ProblemMeta[]>
  problemMetadata(
    refs: readonly { provider: ProviderKey; problemKey: string }[],
  ): Promise<Map<string, ProblemMeta>>
  findLeetCodeIdBySlug(slug: string): Promise<string | null>

  createHelpSession(
    authUserId: string,
    input: NewHelpSession,
    turns: readonly NewHelpTurn[],
  ): Promise<HelpSessionDetail>
  getHelpSession(
    authUserId: string,
    id: string,
  ): Promise<HelpSessionDetail | null>
  listHelpSessions(
    authUserId: string,
    limit: number,
  ): Promise<ProblemHelpSession[]>
  findActiveHelpSession(
    authUserId: string,
    provider: ProviderKey,
    externalId: string,
  ): Promise<ProblemHelpSession | null>
  // 'stale' when the stored version no longer matches.
  updateHelpSession(
    authUserId: string,
    id: string,
    expectedVersion: number,
    patch: HelpSessionPatch,
    turns: readonly NewHelpTurn[],
  ): Promise<HelpSessionDetail | 'stale' | null>

  getReport(
    authUserId: string,
    kind: string,
    key: string,
  ): Promise<StoredReport | null>
  listReports(
    authUserId: string,
    kind: string,
    limit: number,
  ): Promise<(StoredReport & { key: string })[]>
  saveReport(
    authUserId: string,
    kind: string,
    key: string,
    sourceHash: string,
    payload: unknown,
  ): Promise<void>

  listUpsolveStates(authUserId: string): Promise<Map<string, UpsolveState>>
  setUpsolveState(
    authUserId: string,
    provider: ProviderKey,
    externalId: string,
    state: UpsolveState | null,
  ): Promise<void>
}

type SessionRow = {
  id: string
  platform: string
  provider: string | null
  externalId: string | null
  problemTitle: string
  canonicalUrl: string | null
  topics: string[]
  language: string
  doubtType: string
  attemptSummary: string
  source: string
  stage: string
  hintLevel: number
  bugCategory: string | null
  version: number
  solutionRevealedAt: Date | null
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
  rating?: number | null
}

const sessionFromRow = (row: SessionRow): ProblemHelpSession =>
  ProblemHelpSessionSchema.parse({
    id: row.id,
    problem: {
      platform: row.platform,
      ...(row.provider === null ? {} : { provider: row.provider }),
      ...(row.externalId === null ? {} : { externalId: row.externalId }),
      title: row.problemTitle,
      ...(row.canonicalUrl === null ? {} : { canonicalUrl: row.canonicalUrl }),
      topics: row.topics.slice(0, 12),
    },
    language: row.language,
    doubtType: row.doubtType,
    attemptSummary: row.attemptSummary,
    source: row.source,
    stage: row.stage,
    hintLevel: row.hintLevel,
    ...(row.bugCategory === null ? {} : { bugCategory: row.bugCategory }),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.solutionRevealedAt === null
      ? {}
      : { solutionRevealedAt: row.solutionRevealedAt.toISOString() }),
    ...(row.completedAt === null
      ? {}
      : { completedAt: row.completedAt.toISOString() }),
  })

const turnFromRow = (row: {
  id: string
  role: string
  kind: string
  hintLevel: number | null
  content: string
  createdAt: Date
}): ProblemHelpTurn =>
  ProblemHelpTurnSchema.parse({
    id: row.id,
    role: row.role,
    kind: row.kind,
    ...(row.hintLevel === null ? {} : { hintLevel: row.hintLevel }),
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  })

const numericRating = (value: unknown) => {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN
  return Number.isInteger(number) && number > 0 && number <= 5_000
    ? number
    : undefined
}

// ---------------------------------------------------------------------------
// Prisma implementation.
// ---------------------------------------------------------------------------

export class PrismaMentorRepository implements MentorRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async userId(authUserId: string) {
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId: authUserIdSchema.parse(authUserId) },
      select: { id: true },
    })
    return user?.id ?? null
  }

  private async ensureUserId(authUserId: string) {
    const owner = authUserIdSchema.parse(authUserId)
    const user = await this.prisma.coreUser.upsert({
      where: { authUserId: owner },
      update: {},
      create: { authUserId: owner },
      select: { id: true },
    })
    return user.id
  }

  async loadActivity(authUserId: string): Promise<LearnerActivity> {
    const userId = await this.userId(authUserId)
    if (userId === null) {
      return {
        submissions: [],
        solved: [],
        participations: [],
        ratingChanges: [],
        statuses: new Map(),
        linkedProviders: [],
      }
    }
    const [submissions, solved, participations, ratings, actions, accounts] =
      await Promise.all([
        this.prisma.providerSubmission.findMany({
          where: { userId, occurredAt: { not: null } },
          orderBy: { occurredAt: 'asc' },
          select: {
            provider: true,
            externalId: true,
            problemTitle: true,
            canonicalUrl: true,
            verdict: true,
            isAccepted: true,
            occurredAt: true,
          },
        }),
        this.prisma.providerSolvedObservation.findMany({
          where: { userId },
          select: {
            provider: true,
            externalId: true,
            canonicalUrl: true,
            occurredAt: true,
            normalizedTopics: true,
          },
        }),
        this.prisma.contestParticipation.findMany({
          where: { userId },
          orderBy: { attendedAt: 'desc' },
        }),
        this.prisma.providerRatingChange.findMany({
          where: { userId },
          orderBy: { occurredAt: 'asc' },
          select: {
            provider: true,
            contestId: true,
            contestName: true,
            occurredAt: true,
            newRating: true,
            delta: true,
          },
        }),
        this.prisma.problemAction.findMany({
          where: { userId, actionType: 'status_changed' },
          orderBy: { occurredAt: 'asc' },
          select: {
            provider: true,
            externalId: true,
            learnerStatus: true,
            evidenceSource: true,
            occurredAt: true,
          },
        }),
        this.prisma.providerAccount.findMany({
          where: { userId, disconnectedAt: null },
          select: { provider: true },
        }),
      ])
    const leetcodeIds = [
      ...new Set(
        actions
          .filter((action) => action.provider === 'leetcode')
          .map((action) => action.externalId),
      ),
    ]
    const leetcodeUrls =
      leetcodeIds.length === 0
        ? []
        : await this.prisma.externalProblemCache.findMany({
            where: { provider: 'leetcode', externalId: { in: leetcodeIds } },
            select: { externalId: true, canonicalUrl: true },
          })
    const leetcodeUrlById = new Map(
      leetcodeUrls.map((row) => [row.externalId, row.canonicalUrl]),
    )
    const statuses = new Map<string, ManualStatus>()
    for (const action of actions) {
      const status = action.learnerStatus
      if (
        !isProviderKey(action.provider) ||
        (status !== 'solved' && status !== 'attempted' && status !== 'unsolved')
      ) {
        continue
      }
      const key = problemKeyFor(
        action.provider,
        action.externalId,
        action.provider === 'leetcode'
          ? leetcodeUrlById.get(action.externalId)
          : undefined,
      )
      statuses.set(problemRef(action.provider, key), {
        status,
        source:
          action.evidenceSource === 'provider_verified'
            ? 'provider_verified'
            : 'manual',
        occurredAt: action.occurredAt,
      })
    }
    return {
      submissions: submissions.flatMap((row) =>
        isProviderKey(row.provider) && row.occurredAt !== null
          ? [
              {
                provider: row.provider,
                problemKey: problemKeyFor(
                  row.provider,
                  row.externalId,
                  row.canonicalUrl,
                ),
                externalId: row.externalId,
                ...(row.problemTitle === null
                  ? {}
                  : { title: row.problemTitle }),
                canonicalUrl: row.canonicalUrl,
                verdict: row.verdict,
                isAccepted: row.isAccepted,
                occurredAt: row.occurredAt,
              },
            ]
          : [],
      ),
      solved: solved.flatMap((row) =>
        isProviderKey(row.provider)
          ? [
              {
                provider: row.provider,
                problemKey: problemKeyFor(
                  row.provider,
                  row.externalId,
                  row.canonicalUrl,
                ),
                canonicalUrl: row.canonicalUrl,
                ...(row.occurredAt === null
                  ? {}
                  : { occurredAt: row.occurredAt }),
                topics: row.normalizedTopics,
              },
            ]
          : [],
      ),
      participations: participations.flatMap((row) =>
        isProviderKey(row.provider)
          ? [
              {
                provider: row.provider,
                contestId: row.contestId,
                ...(row.contestName === null
                  ? {}
                  : { contestName: row.contestName }),
                canonicalUrl: row.canonicalUrl,
                ...(row.rank === null ? {} : { rank: row.rank }),
                ...(row.ratingChange === null
                  ? {}
                  : { ratingChange: row.ratingChange }),
                ...(row.oldRating === null ? {} : { oldRating: row.oldRating }),
                ...(row.newRating === null ? {} : { newRating: row.newRating }),
                ...(row.attendedAt === null
                  ? {}
                  : { attendedAt: row.attendedAt }),
                completeness: row.completeness,
              },
            ]
          : [],
      ),
      ratingChanges: ratings.flatMap((row) =>
        isProviderKey(row.provider)
          ? [
              {
                provider: row.provider,
                ...(row.contestId === null ? {} : { contestId: row.contestId }),
                ...(row.contestName === null
                  ? {}
                  : { contestName: row.contestName }),
                occurredAt: row.occurredAt,
                newRating: row.newRating,
                delta: row.delta,
              },
            ]
          : [],
      ),
      statuses,
      linkedProviders: [
        ...new Set(accounts.map((row) => row.provider).filter(isProviderKey)),
      ],
    }
  }

  async listContests(providers: readonly ProviderKey[], from: Date, to: Date) {
    if (providers.length === 0) return []
    const rows = await this.prisma.externalContest.findMany({
      where: {
        provider: { in: [...providers] },
        startsAt: { gte: from, lte: to },
      },
      orderBy: { startsAt: 'asc' },
      take: 2_000,
    })
    return rows.flatMap((row) =>
      isProviderKey(row.provider)
        ? [
            {
              provider: row.provider,
              externalId: row.externalId,
              name: row.name,
              canonicalUrl: row.canonicalUrl,
              ...(row.startsAt === null ? {} : { startsAt: row.startsAt }),
              ...(row.endsAt === null ? {} : { endsAt: row.endsAt }),
              ...(row.durationSeconds === null
                ? {}
                : { durationSeconds: row.durationSeconds }),
            },
          ]
        : [],
    )
  }

  private metaFromRow(row: {
    provider: string
    externalId: string
    title: string
    canonicalUrl: string
    providerDifficulty: unknown
    providerTags: string[]
    normalizedTopics: string[]
  }): ProblemMeta | null {
    if (!isProviderKey(row.provider)) return null
    const rating = numericRating(row.providerDifficulty)
    return {
      provider: row.provider,
      externalId: row.externalId,
      problemKey: problemKeyFor(row.provider, row.externalId, row.canonicalUrl),
      title: row.title,
      canonicalUrl: row.canonicalUrl,
      ...(rating === undefined ? {} : { rating }),
      tags: row.providerTags.slice(0, 12),
      topics: row.normalizedTopics.slice(0, 12),
    }
  }

  async listContestProblems(provider: ProviderKey, contestId: string) {
    if (provider !== 'codeforces' || !/^\d{1,6}$/.test(contestId)) return []
    const rows = await this.prisma.externalProblemCache.findMany({
      where: { provider, externalId: { startsWith: contestId } },
      select: {
        provider: true,
        externalId: true,
        title: true,
        canonicalUrl: true,
        providerDifficulty: true,
        providerTags: true,
        normalizedTopics: true,
      },
    })
    const pattern = new RegExp(`^${contestId}[A-Z][0-9]?$`)
    return rows
      .filter((row) => pattern.test(row.externalId))
      .flatMap((row) => {
        const meta = this.metaFromRow(row)
        return meta === null ? [] : [meta]
      })
      .sort((left, right) =>
        left.externalId.localeCompare(right.externalId, 'en', {
          numeric: true,
        }),
      )
  }

  async problemMetadata(
    refs: readonly { provider: ProviderKey; problemKey: string }[],
  ) {
    const result = new Map<string, ProblemMeta>()
    const byProvider = new Map<ProviderKey, Set<string>>()
    for (const ref of refs) {
      const values = byProvider.get(ref.provider) ?? new Set<string>()
      values.add(ref.problemKey)
      byProvider.set(ref.provider, values)
    }
    const select = {
      provider: true,
      externalId: true,
      title: true,
      canonicalUrl: true,
      providerDifficulty: true,
      providerTags: true,
      normalizedTopics: true,
    } as const
    await Promise.all(
      [...byProvider].map(async ([provider, keys]) => {
        const values = [...keys].slice(0, 2_000)
        // LeetCode submissions carry slugs while the catalog uses numeric
        // IDs; accept either.
        const slugs = values.filter((value) => !/^\d+$/.test(value))
        const rows =
          provider === 'leetcode'
            ? await this.prisma.externalProblemCache.findMany({
                where: {
                  provider,
                  OR: [
                    { externalId: { in: values } },
                    {
                      canonicalUrl: {
                        in: slugs.map(
                          (slug) => `https://leetcode.com/problems/${slug}/`,
                        ),
                      },
                    },
                  ],
                },
                select,
              })
            : await this.prisma.externalProblemCache.findMany({
                where: { provider, externalId: { in: values } },
                select,
              })
        for (const row of rows) {
          const meta = this.metaFromRow(row)
          if (meta !== null) {
            result.set(problemRef(meta.provider, meta.problemKey), meta)
          }
        }
      }),
    )
    return result
  }

  async findLeetCodeIdBySlug(slug: string) {
    const row = await this.prisma.externalProblemCache.findFirst({
      where: {
        provider: 'leetcode',
        canonicalUrl: `https://leetcode.com/problems/${slug.toLowerCase()}/`,
      },
      select: { externalId: true },
    })
    return row?.externalId ?? null
  }

  private async sessionDetail(userId: string, id: string) {
    const row = await this.prisma.problemHelpSession.findFirst({
      where: { id, userId },
      include: { turns: { orderBy: { createdAt: 'asc' }, take: 200 } },
    })
    if (row === null) return null
    return {
      session: sessionFromRow(row),
      turns: row.turns.map(turnFromRow),
    }
  }

  async createHelpSession(
    authUserId: string,
    input: NewHelpSession,
    turns: readonly NewHelpTurn[],
  ) {
    const userId = await this.ensureUserId(authUserId)
    const created = await this.prisma.$transaction(async (transaction) => {
      const session = await transaction.problemHelpSession.create({
        data: {
          userId,
          platform: input.problem.platform,
          provider: input.problem.provider ?? null,
          externalId: input.problem.externalId ?? null,
          problemTitle: input.problem.title,
          canonicalUrl: input.problem.canonicalUrl ?? null,
          topics: input.problem.topics,
          language: input.language,
          doubtType: input.doubtType,
          attemptSummary: input.attemptSummary,
          source: input.source,
          stage: input.stage,
          hintLevel: input.hintLevel,
          bugCategory: input.bugCategory ?? null,
        },
      })
      const start = Date.now()
      for (const [index, turn] of turns.entries()) {
        await transaction.problemHelpTurn.create({
          data: {
            sessionId: session.id,
            role: turn.role,
            kind: turn.kind,
            hintLevel: turn.hintLevel ?? null,
            content: turn.content,
            // Keep insertion order stable within one transaction.
            createdAt: new Date(start + index),
          },
        })
      }
      return session.id
    })
    const detail = await this.sessionDetail(userId, created)
    if (detail === null) throw new Error('The help session was not saved.')
    return detail
  }

  async getHelpSession(authUserId: string, id: string) {
    if (!z.uuid().safeParse(id).success) return null
    const userId = await this.userId(authUserId)
    return userId === null ? null : this.sessionDetail(userId, id)
  }

  async listHelpSessions(authUserId: string, limit: number) {
    const userId = await this.userId(authUserId)
    if (userId === null) return []
    const rows = await this.prisma.problemHelpSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    })
    return rows.map(sessionFromRow)
  }

  async findActiveHelpSession(
    authUserId: string,
    provider: ProviderKey,
    externalId: string,
  ) {
    const userId = await this.userId(authUserId)
    if (userId === null) return null
    const row = await this.prisma.problemHelpSession.findFirst({
      where: { userId, provider, externalId, completedAt: null },
      orderBy: { updatedAt: 'desc' },
    })
    return row === null ? null : sessionFromRow(row)
  }

  async updateHelpSession(
    authUserId: string,
    id: string,
    expectedVersion: number,
    patch: HelpSessionPatch,
    turns: readonly NewHelpTurn[],
  ) {
    if (!z.uuid().safeParse(id).success) return null
    const userId = await this.userId(authUserId)
    if (userId === null) return null
    const outcome = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.problemHelpSession.updateMany({
        where: { id, userId, version: expectedVersion },
        data: {
          ...(patch.stage === undefined ? {} : { stage: patch.stage }),
          ...(patch.hintLevel === undefined
            ? {}
            : { hintLevel: patch.hintLevel }),
          ...(patch.bugCategory === undefined
            ? {}
            : { bugCategory: patch.bugCategory }),
          ...(patch.solutionRevealedAt === undefined
            ? {}
            : { solutionRevealedAt: patch.solutionRevealedAt }),
          ...(patch.completedAt === undefined
            ? {}
            : { completedAt: patch.completedAt }),
          version: { increment: 1 },
        },
      })
      if (updated.count === 0) {
        const exists = await transaction.problemHelpSession.findFirst({
          where: { id, userId },
          select: { id: true },
        })
        return exists === null ? 'missing' : 'stale'
      }
      const start = Date.now()
      for (const [index, turn] of turns.entries()) {
        await transaction.problemHelpTurn.create({
          data: {
            sessionId: id,
            role: turn.role,
            kind: turn.kind,
            hintLevel: turn.hintLevel ?? null,
            content: turn.content,
            createdAt: new Date(start + index),
          },
        })
      }
      return 'updated'
    })
    if (outcome === 'missing') return null
    if (outcome === 'stale') return 'stale'
    return this.sessionDetail(userId, id)
  }

  async getReport(authUserId: string, kind: string, key: string) {
    const userId = await this.userId(authUserId)
    if (userId === null) return null
    const row = await this.prisma.mentorReport.findUnique({
      where: { userId_kind_reportKey: { userId, kind, reportKey: key } },
    })
    return row === null
      ? null
      : {
          payload: row.payload,
          sourceHash: row.sourceHash,
          generatedAt: row.generatedAt,
        }
  }

  async listReports(authUserId: string, kind: string, limit: number) {
    const userId = await this.userId(authUserId)
    if (userId === null) return []
    const rows = await this.prisma.mentorReport.findMany({
      where: { userId, kind },
      orderBy: { generatedAt: 'desc' },
      take: limit,
    })
    return rows.map((row) => ({
      key: row.reportKey,
      payload: row.payload,
      sourceHash: row.sourceHash,
      generatedAt: row.generatedAt,
    }))
  }

  async saveReport(
    authUserId: string,
    kind: string,
    key: string,
    sourceHash: string,
    payload: unknown,
  ) {
    const userId = await this.ensureUserId(authUserId)
    const json = JSON.parse(JSON.stringify(payload)) as object
    await this.prisma.mentorReport.upsert({
      where: { userId_kind_reportKey: { userId, kind, reportKey: key } },
      create: { userId, kind, reportKey: key, sourceHash, payload: json },
      update: { sourceHash, payload: json, generatedAt: this.now() },
    })
  }

  async listUpsolveStates(authUserId: string) {
    const userId = await this.userId(authUserId)
    const states = new Map<string, UpsolveState>()
    if (userId === null) return states
    const rows = await this.prisma.upsolveItemState.findMany({
      where: { userId, state: { in: ['skipped', 'solved'] } },
    })
    for (const row of rows) {
      states.set(
        problemRef(row.provider, row.externalId),
        row.state === 'solved' ? 'solved' : 'skipped',
      )
    }
    return states
  }

  async setUpsolveState(
    authUserId: string,
    provider: ProviderKey,
    externalId: string,
    state: UpsolveState | null,
  ) {
    const userId = await this.ensureUserId(authUserId)
    if (state === null) {
      await this.prisma.upsolveItemState.deleteMany({
        where: { userId, provider, externalId },
      })
      return
    }
    await this.prisma.upsolveItemState.upsert({
      where: {
        userId_provider_externalId: { userId, provider, externalId },
      },
      create: { userId, provider, externalId, state },
      update: { state },
    })
  }
}

// ---------------------------------------------------------------------------
// In-memory implementation for tests and mock environments.
// ---------------------------------------------------------------------------

type MemorySession = {
  owner: string
  row: SessionRow
  turns: {
    id: string
    role: string
    kind: string
    hintLevel: number | null
    content: string
    createdAt: Date
  }[]
}

export class InMemoryMentorRepository implements MentorRepository {
  private readonly activity = new Map<string, LearnerActivity>()
  private readonly sessions: MemorySession[] = []
  private readonly reports = new Map<string, StoredReport & { key: string }>()
  private readonly upsolve = new Map<string, Map<string, UpsolveState>>()
  contests: CatalogContest[] = []
  catalog: ProblemMeta[] = []

  constructor(private readonly now: () => Date = () => new Date()) {}

  setActivity(authUserId: string, activity: Partial<LearnerActivity>) {
    this.activity.set(authUserId, {
      submissions: [],
      solved: [],
      participations: [],
      ratingChanges: [],
      statuses: new Map(),
      linkedProviders: [],
      ...activity,
    })
  }

  async loadActivity(authUserId: string) {
    return (
      this.activity.get(authUserId) ?? {
        submissions: [],
        solved: [],
        participations: [],
        ratingChanges: [],
        statuses: new Map(),
        linkedProviders: [],
      }
    )
  }

  async listContests(providers: readonly ProviderKey[], from: Date, to: Date) {
    return this.contests.filter(
      (contest) =>
        providers.includes(contest.provider) &&
        contest.startsAt !== undefined &&
        contest.startsAt >= from &&
        contest.startsAt <= to,
    )
  }

  async listContestProblems(provider: ProviderKey, contestId: string) {
    const pattern = new RegExp(`^${contestId}[A-Z][0-9]?$`)
    return this.catalog.filter(
      (item) => item.provider === provider && pattern.test(item.externalId),
    )
  }

  async problemMetadata(
    refs: readonly { provider: ProviderKey; problemKey: string }[],
  ) {
    const wanted = new Set(
      refs.map((ref) => problemRef(ref.provider, ref.problemKey)),
    )
    return new Map(
      this.catalog
        .filter(
          (item) =>
            wanted.has(problemRef(item.provider, item.problemKey)) ||
            wanted.has(problemRef(item.provider, item.externalId)),
        )
        .map((item) => [problemRef(item.provider, item.problemKey), item]),
    )
  }

  async findLeetCodeIdBySlug(slug: string) {
    return (
      this.catalog.find(
        (item) => item.provider === 'leetcode' && item.problemKey === slug,
      )?.externalId ?? null
    )
  }

  private detail(entry: MemorySession): HelpSessionDetail {
    return {
      session: sessionFromRow(entry.row),
      turns: entry.turns.map(turnFromRow),
    }
  }

  async createHelpSession(
    authUserId: string,
    input: NewHelpSession,
    turns: readonly NewHelpTurn[],
  ) {
    const owner = authUserIdSchema.parse(authUserId)
    const now = this.now()
    const entry: MemorySession = {
      owner,
      row: {
        id: randomUUID(),
        platform: input.problem.platform,
        provider: input.problem.provider ?? null,
        externalId: input.problem.externalId ?? null,
        problemTitle: input.problem.title,
        canonicalUrl: input.problem.canonicalUrl ?? null,
        topics: input.problem.topics,
        language: input.language,
        doubtType: input.doubtType,
        attemptSummary: input.attemptSummary,
        source: input.source,
        stage: input.stage,
        hintLevel: input.hintLevel,
        bugCategory: input.bugCategory ?? null,
        version: 1,
        solutionRevealedAt: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      turns: turns.map((turn, index) => ({
        id: randomUUID(),
        role: turn.role,
        kind: turn.kind,
        hintLevel: turn.hintLevel ?? null,
        content: turn.content,
        createdAt: new Date(now.getTime() + index),
      })),
    }
    this.sessions.push(entry)
    return this.detail(entry)
  }

  async getHelpSession(authUserId: string, id: string) {
    const entry = this.sessions.find(
      (item) => item.row.id === id && item.owner === authUserId,
    )
    return entry === undefined ? null : this.detail(entry)
  }

  async listHelpSessions(authUserId: string, limit: number) {
    return this.sessions
      .filter((item) => item.owner === authUserId)
      .sort(
        (left, right) =>
          right.row.updatedAt.getTime() - left.row.updatedAt.getTime(),
      )
      .slice(0, limit)
      .map((item) => sessionFromRow(item.row))
  }

  async findActiveHelpSession(
    authUserId: string,
    provider: ProviderKey,
    externalId: string,
  ) {
    const entry = this.sessions.find(
      (item) =>
        item.owner === authUserId &&
        item.row.provider === provider &&
        item.row.externalId === externalId &&
        item.row.completedAt === null,
    )
    return entry === undefined ? null : sessionFromRow(entry.row)
  }

  async updateHelpSession(
    authUserId: string,
    id: string,
    expectedVersion: number,
    patch: HelpSessionPatch,
    turns: readonly NewHelpTurn[],
  ) {
    const entry = this.sessions.find(
      (item) => item.row.id === id && item.owner === authUserId,
    )
    if (entry === undefined) return null
    if (entry.row.version !== expectedVersion) return 'stale' as const
    const now = this.now()
    entry.row = {
      ...entry.row,
      ...(patch.stage === undefined ? {} : { stage: patch.stage }),
      ...(patch.hintLevel === undefined ? {} : { hintLevel: patch.hintLevel }),
      ...(patch.bugCategory === undefined
        ? {}
        : { bugCategory: patch.bugCategory }),
      ...(patch.solutionRevealedAt === undefined
        ? {}
        : { solutionRevealedAt: patch.solutionRevealedAt }),
      ...(patch.completedAt === undefined
        ? {}
        : { completedAt: patch.completedAt }),
      version: entry.row.version + 1,
      updatedAt: now,
    }
    const offset = entry.turns.length
    entry.turns.push(
      ...turns.map((turn, index) => ({
        id: randomUUID(),
        role: turn.role,
        kind: turn.kind,
        hintLevel: turn.hintLevel ?? null,
        content: turn.content,
        createdAt: new Date(now.getTime() + offset + index),
      })),
    )
    return this.detail(entry)
  }

  async getReport(authUserId: string, kind: string, key: string) {
    return this.reports.get(`${authUserId}|${kind}|${key}`) ?? null
  }

  async listReports(authUserId: string, kind: string, limit: number) {
    return [...this.reports.entries()]
      .filter(([id]) => id.startsWith(`${authUserId}|${kind}|`))
      .map(([, value]) => value)
      .sort(
        (left, right) =>
          right.generatedAt.getTime() - left.generatedAt.getTime(),
      )
      .slice(0, limit)
  }

  async saveReport(
    authUserId: string,
    kind: string,
    key: string,
    sourceHash: string,
    payload: unknown,
  ) {
    this.reports.set(`${authUserId}|${kind}|${key}`, {
      key,
      payload: JSON.parse(JSON.stringify(payload)) as unknown,
      sourceHash,
      generatedAt: this.now(),
    })
  }

  async listUpsolveStates(authUserId: string) {
    return new Map(this.upsolve.get(authUserId) ?? [])
  }

  async setUpsolveState(
    authUserId: string,
    provider: ProviderKey,
    externalId: string,
    state: UpsolveState | null,
  ) {
    const states = this.upsolve.get(authUserId) ?? new Map()
    if (state === null) states.delete(problemRef(provider, externalId))
    else states.set(problemRef(provider, externalId), state)
    this.upsolve.set(authUserId, states)
  }
}
