import { randomUUID } from 'node:crypto'

import {
  NormalizedDifficultySchema,
  ProviderKeySchema,
} from '@algomemtor/shared-contracts'
import { z } from 'zod'

import { Prisma, type PrismaClient } from '../generated/prisma/client.js'

const authUserIdSchema = z.uuid()
const identifierSchema = z.uuid()
const externalIdSchema = z.string().trim().min(1).max(128).regex(/^\S+$/)
const topicSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export const RecommendationRequestCriteriaSchema = z
  .object({
    provider: ProviderKeySchema.optional(),
    topics: z
      .array(topicSchema)
      .max(25)
      .refine((topics) => new Set(topics).size === topics.length)
      .optional(),
    difficulty: NormalizedDifficultySchema.optional(),
    minRating: z.number().finite().nonnegative().optional(),
    maxRating: z.number().finite().nonnegative().optional(),
    pageSize: z.number().int().positive().max(100).optional(),
    profileSignature: z.string().trim().min(1).max(128).optional(),
  })
  .strict()
  .refine(
    ({ maxRating, minRating }) =>
      minRating === undefined ||
      maxRating === undefined ||
      minRating <= maxRating,
    { message: 'Minimum rating must not exceed maximum rating.' },
  )

export type RecommendationRequestCriteria = z.infer<
  typeof RecommendationRequestCriteriaSchema
>

export const RankingModeSchema = z.enum(['deterministic', 'ai'])
export type RankingMode = z.infer<typeof RankingModeSchema>

const recommendationItemInputSchema = z
  .object({
    provider: ProviderKeySchema,
    externalId: externalIdSchema,
    position: z.number().int().positive(),
    score: z.number().finite().nonnegative().optional(),
    reason: z.string().trim().min(1).max(512),
  })
  .strict()

const saveRecommendationBatchInputSchema = z
  .object({
    requestCriteria: RecommendationRequestCriteriaSchema,
    rankingMode: RankingModeSchema,
    rankingVersion: z.string().trim().min(1).max(64).optional(),
    items: z.array(recommendationItemInputSchema).min(1).max(100),
  })
  .strict()
  .superRefine(({ items }, context) => {
    const positions = new Set<number>()
    const identities = new Set<string>()

    items.forEach((item, index) => {
      const identity = `${item.provider}:${item.externalId}`

      if (positions.has(item.position)) {
        context.addIssue({
          code: 'custom',
          message: 'Recommendation positions must be unique within a batch.',
          path: ['items', index, 'position'],
        })
      }

      if (identities.has(identity)) {
        context.addIssue({
          code: 'custom',
          message: 'A problem can appear only once in a recommendation batch.',
          path: ['items', index, 'externalId'],
        })
      }

      positions.add(item.position)
      identities.add(identity)
    })
  })

export type SaveRecommendationBatchInput = z.infer<
  typeof saveRecommendationBatchInputSchema
>

const recommendationItemRecordSchema = recommendationItemInputSchema.extend({
  id: identifierSchema,
  createdAt: z.date(),
})

export type RecommendationItemRecord = z.infer<
  typeof recommendationItemRecordSchema
>

const recommendationBatchRecordSchema = z
  .object({
    id: identifierSchema,
    requestCriteria: RecommendationRequestCriteriaSchema,
    rankingMode: RankingModeSchema,
    rankingVersion: z.string().trim().min(1).max(64).optional(),
    createdAt: z.date(),
    items: z.array(recommendationItemRecordSchema),
  })
  .strict()

export type RecommendationBatchRecord = z.infer<
  typeof recommendationBatchRecordSchema
>

export const RecommendationUsefulnessSchema = z.enum(['useful', 'not_useful'])
export type RecommendationUsefulness = z.infer<
  typeof RecommendationUsefulnessSchema
>

export const RecommendationDifficultyFeedbackSchema = z.enum([
  'too_easy',
  'about_right',
  'too_hard',
])
export type RecommendationDifficultyFeedback = z.infer<
  typeof RecommendationDifficultyFeedbackSchema
>

const saveRecommendationFeedbackInputSchema = z
  .object({
    usefulness: RecommendationUsefulnessSchema.optional(),
    perceivedDifficulty: RecommendationDifficultyFeedbackSchema.optional(),
    notes: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict()
  .refine(
    ({ perceivedDifficulty, usefulness }) =>
      usefulness !== undefined || perceivedDifficulty !== undefined,
    { message: 'Recommendation feedback requires a feedback dimension.' },
  )

export type SaveRecommendationFeedbackInput = z.infer<
  typeof saveRecommendationFeedbackInputSchema
>

const recommendationFeedbackRecordSchema = z
  .object({
    id: identifierSchema,
    recommendationItemId: identifierSchema,
    usefulness: RecommendationUsefulnessSchema.optional(),
    perceivedDifficulty: RecommendationDifficultyFeedbackSchema.optional(),
    notes: z.string().trim().min(1).max(1_000).optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict()

export type RecommendationFeedbackRecord = z.infer<
  typeof recommendationFeedbackRecordSchema
>

export class RecommendationOwnershipError extends Error {
  constructor() {
    super('The recommendation item is not owned by this learner.')
    this.name = 'RecommendationOwnershipError'
  }
}

export interface RecommendationRepository {
  saveBatchByAuthUserId(
    authUserId: string,
    input: SaveRecommendationBatchInput,
  ): Promise<RecommendationBatchRecord>
  listBatchesByAuthUserId(
    authUserId: string,
  ): Promise<RecommendationBatchRecord[]>
  findItemByAuthUserId(
    authUserId: string,
    recommendationItemId: string,
  ): Promise<RecommendationItemOwnershipRecord | null>
  saveFeedbackByAuthUserId(
    authUserId: string,
    recommendationItemId: string,
    input: SaveRecommendationFeedbackInput,
  ): Promise<RecommendationFeedbackRecord>
  listFeedbackByAuthUserId(
    authUserId: string,
  ): Promise<RecommendationFeedbackRecord[]>
}

export type RecommendationItemOwnershipRecord = {
  id: string
  batchId: string
  provider: 'codeforces'
  externalId: string
}

const requestCriteriaToDatabase = (
  criteria: RecommendationRequestCriteria,
): Prisma.InputJsonObject => ({
  ...(criteria.provider === undefined ? {} : { provider: criteria.provider }),
  ...(criteria.topics === undefined ? {} : { topics: criteria.topics }),
  ...(criteria.difficulty === undefined
    ? {}
    : { difficulty: criteria.difficulty }),
  ...(criteria.minRating === undefined
    ? {}
    : { minRating: criteria.minRating }),
  ...(criteria.maxRating === undefined
    ? {}
    : { maxRating: criteria.maxRating }),
  ...(criteria.pageSize === undefined ? {} : { pageSize: criteria.pageSize }),
  ...(criteria.profileSignature === undefined
    ? {}
    : { profileSignature: criteria.profileSignature }),
})

const recommendationBatchFromDatabase = (record: {
  id: string
  requestCriteria: Prisma.JsonValue
  rankingMode: string
  rankingVersion: string | null
  createdAt: Date
  items: Array<{
    id: string
    provider: string
    externalId: string
    position: number
    score: number | null
    reason: string
    createdAt: Date
  }>
}) =>
  recommendationBatchRecordSchema.parse({
    id: record.id,
    requestCriteria: RecommendationRequestCriteriaSchema.parse(
      record.requestCriteria,
    ),
    rankingMode: record.rankingMode,
    ...(record.rankingVersion === null
      ? {}
      : { rankingVersion: record.rankingVersion }),
    createdAt: record.createdAt,
    items: record.items.map((item) => ({
      id: item.id,
      provider: item.provider,
      externalId: item.externalId,
      position: item.position,
      ...(item.score === null ? {} : { score: item.score }),
      reason: item.reason,
      createdAt: item.createdAt,
    })),
  })

const recommendationFeedbackFromDatabase = (record: {
  id: string
  recommendationItemId: string
  usefulness: string | null
  perceivedDifficulty: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}) =>
  recommendationFeedbackRecordSchema.parse({
    id: record.id,
    recommendationItemId: record.recommendationItemId,
    ...(record.usefulness === null ? {} : { usefulness: record.usefulness }),
    ...(record.perceivedDifficulty === null
      ? {}
      : { perceivedDifficulty: record.perceivedDifficulty }),
    ...(record.notes === null ? {} : { notes: record.notes }),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  })

export class InMemoryRecommendationRepository implements RecommendationRepository {
  private readonly batchesByAuthUserId = new Map<
    string,
    RecommendationBatchRecord[]
  >()
  private readonly feedbackByAuthUserId = new Map<
    string,
    Map<string, RecommendationFeedbackRecord>
  >()

  constructor(private readonly now: () => Date = () => new Date()) {}

  async saveBatchByAuthUserId(
    authUserId: string,
    input: SaveRecommendationBatchInput,
  ) {
    const ownerId = authUserIdSchema.parse(authUserId)
    const parsed = saveRecommendationBatchInputSchema.parse(input)
    const createdAt = this.now()
    const batch = recommendationBatchRecordSchema.parse({
      id: randomUUID(),
      requestCriteria: parsed.requestCriteria,
      rankingMode: parsed.rankingMode,
      ...(parsed.rankingVersion === undefined
        ? {}
        : { rankingVersion: parsed.rankingVersion }),
      createdAt,
      items: parsed.items.map((item) => ({
        ...item,
        id: randomUUID(),
        createdAt,
      })),
    })
    const batches = this.batchesByAuthUserId.get(ownerId) ?? []

    batches.push(batch)
    this.batchesByAuthUserId.set(ownerId, batches)
    return recommendationBatchRecordSchema.parse(batch)
  }

  async listBatchesByAuthUserId(authUserId: string) {
    const ownerId = authUserIdSchema.parse(authUserId)
    const batches = this.batchesByAuthUserId.get(ownerId) ?? []

    return batches
      .slice()
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      )
      .map((batch) => recommendationBatchRecordSchema.parse(batch))
  }

  async findItemByAuthUserId(authUserId: string, recommendationItemId: string) {
    const ownerId = authUserIdSchema.parse(authUserId)
    const itemId = identifierSchema.parse(recommendationItemId)
    const item = (this.batchesByAuthUserId.get(ownerId) ?? [])
      .flatMap((batch) =>
        batch.items.map((candidate) => ({ batch, candidate })),
      )
      .find(({ candidate }) => candidate.id === itemId)

    return item === undefined
      ? null
      : {
          id: item.candidate.id,
          batchId: item.batch.id,
          provider: item.candidate.provider,
          externalId: item.candidate.externalId,
        }
  }

  async saveFeedbackByAuthUserId(
    authUserId: string,
    recommendationItemId: string,
    input: SaveRecommendationFeedbackInput,
  ) {
    const ownerId = authUserIdSchema.parse(authUserId)
    const itemId = identifierSchema.parse(recommendationItemId)
    const parsed = saveRecommendationFeedbackInputSchema.parse(input)
    const ownsItem = (this.batchesByAuthUserId.get(ownerId) ?? []).some(
      (batch) => batch.items.some((item) => item.id === itemId),
    )

    if (!ownsItem) {
      throw new RecommendationOwnershipError()
    }

    const feedbackByItem =
      this.feedbackByAuthUserId.get(ownerId) ??
      new Map<string, RecommendationFeedbackRecord>()
    const existing = feedbackByItem.get(itemId)
    const now = this.now()
    const feedback = recommendationFeedbackRecordSchema.parse({
      id: existing?.id ?? randomUUID(),
      recommendationItemId: itemId,
      ...(parsed.usefulness === undefined
        ? existing?.usefulness === undefined
          ? {}
          : { usefulness: existing.usefulness }
        : { usefulness: parsed.usefulness }),
      ...(parsed.perceivedDifficulty === undefined
        ? existing?.perceivedDifficulty === undefined
          ? {}
          : { perceivedDifficulty: existing.perceivedDifficulty }
        : { perceivedDifficulty: parsed.perceivedDifficulty }),
      ...(parsed.notes === undefined
        ? existing?.notes === undefined
          ? {}
          : { notes: existing.notes }
        : { notes: parsed.notes }),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })

    feedbackByItem.set(itemId, feedback)
    this.feedbackByAuthUserId.set(ownerId, feedbackByItem)
    return recommendationFeedbackRecordSchema.parse(feedback)
  }

  async listFeedbackByAuthUserId(authUserId: string) {
    const ownerId = authUserIdSchema.parse(authUserId)

    return [...(this.feedbackByAuthUserId.get(ownerId)?.values() ?? [])]
      .sort(
        (left, right) =>
          right.createdAt.getTime() - left.createdAt.getTime() ||
          right.id.localeCompare(left.id),
      )
      .map((feedback) => recommendationFeedbackRecordSchema.parse(feedback))
  }
}

export class PrismaRecommendationRepository implements RecommendationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async saveBatchByAuthUserId(
    authUserId: string,
    input: SaveRecommendationBatchInput,
  ) {
    const ownerId = authUserIdSchema.parse(authUserId)
    const parsed = saveRecommendationBatchInputSchema.parse(input)
    const record = await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.coreUser.upsert({
        where: { authUserId: ownerId },
        create: { authUserId: ownerId },
        update: {},
        select: { id: true },
      })

      return transaction.recommendationBatch.create({
        data: {
          userId: user.id,
          requestCriteria: requestCriteriaToDatabase(parsed.requestCriteria),
          rankingMode: parsed.rankingMode,
          ...(parsed.rankingVersion === undefined
            ? {}
            : { rankingVersion: parsed.rankingVersion }),
          items: {
            create: parsed.items.map((item) => ({
              provider: item.provider,
              externalId: item.externalId,
              position: item.position,
              ...(item.score === undefined ? {} : { score: item.score }),
              reason: item.reason,
            })),
          },
        },
        include: { items: { orderBy: { position: 'asc' } } },
      })
    })

    return recommendationBatchFromDatabase(record)
  }

  async listBatchesByAuthUserId(authUserId: string) {
    const ownerId = authUserIdSchema.parse(authUserId)
    const records = await this.prisma.recommendationBatch.findMany({
      where: { user: { authUserId: ownerId } },
      orderBy: { createdAt: 'desc' },
      include: { items: { orderBy: { position: 'asc' } } },
    })

    return records.map(recommendationBatchFromDatabase)
  }

  async findItemByAuthUserId(authUserId: string, recommendationItemId: string) {
    const ownerId = authUserIdSchema.parse(authUserId)
    const itemId = identifierSchema.parse(recommendationItemId)
    const item = await this.prisma.recommendationItem.findFirst({
      where: {
        id: itemId,
        batch: { user: { authUserId: ownerId } },
      },
      select: {
        id: true,
        batchId: true,
        provider: true,
        externalId: true,
      },
    })

    if (item === null) {
      return null
    }

    return {
      id: item.id,
      batchId: item.batchId,
      provider: ProviderKeySchema.parse(item.provider),
      externalId: item.externalId,
    }
  }

  async saveFeedbackByAuthUserId(
    authUserId: string,
    recommendationItemId: string,
    input: SaveRecommendationFeedbackInput,
  ) {
    const ownerId = authUserIdSchema.parse(authUserId)
    const itemId = identifierSchema.parse(recommendationItemId)
    const parsed = saveRecommendationFeedbackInputSchema.parse(input)
    const record = await this.prisma.$transaction(async (transaction) => {
      const item = await transaction.recommendationItem.findFirst({
        where: {
          id: itemId,
          batch: { user: { authUserId: ownerId } },
        },
        select: { id: true, batch: { select: { userId: true } } },
      })

      if (item === null) {
        throw new RecommendationOwnershipError()
      }

      const existing = await transaction.recommendationFeedback.findUnique({
        where: {
          userId_recommendationItemId: {
            userId: item.batch.userId,
            recommendationItemId: item.id,
          },
        },
        select: {
          usefulness: true,
          perceivedDifficulty: true,
          notes: true,
        },
      })

      return transaction.recommendationFeedback.upsert({
        where: {
          userId_recommendationItemId: {
            userId: item.batch.userId,
            recommendationItemId: item.id,
          },
        },
        create: {
          userId: item.batch.userId,
          recommendationItemId: item.id,
          usefulness: parsed.usefulness ?? null,
          perceivedDifficulty: parsed.perceivedDifficulty ?? null,
          notes: parsed.notes ?? null,
        },
        update: {
          usefulness: parsed.usefulness ?? existing?.usefulness ?? null,
          perceivedDifficulty:
            parsed.perceivedDifficulty ?? existing?.perceivedDifficulty ?? null,
          notes: parsed.notes ?? existing?.notes ?? null,
        },
      })
    })

    return recommendationFeedbackFromDatabase(record)
  }

  async listFeedbackByAuthUserId(authUserId: string) {
    const ownerId = authUserIdSchema.parse(authUserId)
    const records = await this.prisma.recommendationFeedback.findMany({
      where: { user: { authUserId: ownerId } },
      orderBy: { createdAt: 'desc' },
    })

    return records.map(recommendationFeedbackFromDatabase)
  }
}
