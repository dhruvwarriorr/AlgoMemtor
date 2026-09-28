import {
  LearnerProblemStatusSchema,
  ProviderKeySchema,
  type LearnerProblemStatus,
  type ProviderKey,
} from '@algomemtor/shared-contracts'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import type { PrismaClient } from '../generated/prisma/client'

const authUserIdSchema = z.uuid()
const identifierSchema = z.uuid()
const externalIdSchema = z.string().trim().min(1).max(128).regex(/^\S+$/)

export const ProblemActionTypeSchema = z.enum([
  'impression',
  'opened',
  'bookmarked',
  'unbookmarked',
  'dismissed',
  'dismissal_restored',
  'status_changed',
])

export type ProblemActionType = z.infer<typeof ProblemActionTypeSchema>

export const LearnerStatusSchema = LearnerProblemStatusSchema

export type LearnerStatus = LearnerProblemStatus

export const EvidenceSourceSchema = z.enum(['manual', 'provider_verified'])

export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>

const validateStatusEvidence = (
  value: {
    actionType: ProblemActionType
    learnerStatus?: LearnerStatus | null | undefined
    evidenceSource?: EvidenceSource | null | undefined
  },
  context: z.RefinementCtx,
) => {
  const isStatusChange = value.actionType === 'status_changed'
  const hasStatus = value.learnerStatus != null
  const hasEvidenceSource = value.evidenceSource != null

  if (isStatusChange !== hasStatus || isStatusChange !== hasEvidenceSource) {
    context.addIssue({
      code: 'custom',
      message:
        'Status changes require a learner status and evidence source; other actions cannot include them.',
    })
  }
}

const problemActionInputSchema = z
  .object({
    provider: ProviderKeySchema,
    externalId: externalIdSchema,
    actionType: ProblemActionTypeSchema,
    learnerStatus: LearnerStatusSchema.optional(),
    evidenceSource: EvidenceSourceSchema.optional(),
    recommendationBatchId: identifierSchema.optional(),
    recommendationItemId: identifierSchema.optional(),
    sourceContext: z.string().trim().min(1).max(64).optional(),
    occurredAt: z.date().optional(),
  })
  .strict()
  .superRefine(validateStatusEvidence)

const problemActionRecordSchema = z
  .object({
    id: identifierSchema,
    provider: ProviderKeySchema,
    externalId: externalIdSchema,
    actionType: ProblemActionTypeSchema,
    learnerStatus: LearnerStatusSchema.optional(),
    evidenceSource: EvidenceSourceSchema.optional(),
    recommendationBatchId: identifierSchema.optional(),
    recommendationItemId: identifierSchema.optional(),
    sourceContext: z.string().trim().min(1).max(64).optional(),
    occurredAt: z.date(),
  })
  .strict()
  .superRefine(validateStatusEvidence)

const problemActionDatabaseRecordSchema = z
  .object({
    id: identifierSchema,
    userId: identifierSchema,
    provider: ProviderKeySchema,
    externalId: externalIdSchema,
    actionType: ProblemActionTypeSchema,
    learnerStatus: LearnerStatusSchema.nullable().optional(),
    evidenceSource: EvidenceSourceSchema.nullable().optional(),
    recommendationBatchId: identifierSchema.nullable().optional(),
    recommendationItemId: identifierSchema.nullable().optional(),
    sourceContext: z.string().trim().min(1).max(64).nullable().optional(),
    occurredAt: z.date(),
  })
  .strict()
  .superRefine(validateStatusEvidence)

export type AppendProblemActionInput = z.infer<typeof problemActionInputSchema>

export type ProblemActionRecord = z.infer<typeof problemActionRecordSchema>

export interface ProblemActionRepository {
  listByAuthUserId(authUserId: string): Promise<ProblemActionRecord[]>
  appendByAuthUserId(
    authUserId: string,
    input: AppendProblemActionInput,
  ): Promise<ProblemActionRecord>
  deleteByAuthUserId?(
    authUserId: string,
    provider: ProviderKey,
    externalId: string,
  ): Promise<void>
  deleteProviderVerifiedByAuthUserId(
    authUserId: string,
    provider: ProviderKey,
  ): Promise<void>
}

const parseAuthUserId = (authUserId: string) =>
  authUserIdSchema.parse(authUserId)

const parseProblemActionInput = (input: AppendProblemActionInput) =>
  problemActionInputSchema.parse(input)

const problemActionFromDatabase = (
  record: unknown,
  ownerId?: string,
): ProblemActionRecord => {
  const parsed = problemActionDatabaseRecordSchema.parse(record)

  if (ownerId !== undefined && parsed.userId !== ownerId) {
    throw new Error('The problem action is not owned by this learner.')
  }

  return problemActionRecordSchema.parse({
    id: parsed.id,
    provider: parsed.provider,
    externalId: parsed.externalId,
    actionType: parsed.actionType,
    ...(parsed.learnerStatus === undefined || parsed.learnerStatus === null
      ? {}
      : { learnerStatus: parsed.learnerStatus }),
    ...(parsed.evidenceSource === undefined || parsed.evidenceSource === null
      ? {}
      : { evidenceSource: parsed.evidenceSource }),
    ...(parsed.recommendationBatchId === undefined ||
    parsed.recommendationBatchId === null
      ? {}
      : { recommendationBatchId: parsed.recommendationBatchId }),
    ...(parsed.recommendationItemId === undefined ||
    parsed.recommendationItemId === null
      ? {}
      : { recommendationItemId: parsed.recommendationItemId }),
    ...(parsed.sourceContext === undefined || parsed.sourceContext === null
      ? {}
      : { sourceContext: parsed.sourceContext }),
    occurredAt: parsed.occurredAt,
  })
}

const problemActionFromValue = (
  record: ProblemActionRecord,
): ProblemActionRecord => problemActionRecordSchema.parse(record)

const problemActionFromInput = (
  input: AppendProblemActionInput,
  now: Date,
): ProblemActionRecord =>
  problemActionRecordSchema.parse({
    id: randomUUID(),
    provider: input.provider,
    externalId: input.externalId,
    actionType: input.actionType,
    ...(input.learnerStatus === undefined
      ? {}
      : { learnerStatus: input.learnerStatus }),
    ...(input.evidenceSource === undefined
      ? {}
      : { evidenceSource: input.evidenceSource }),
    ...(input.recommendationBatchId === undefined
      ? {}
      : { recommendationBatchId: input.recommendationBatchId }),
    ...(input.recommendationItemId === undefined
      ? {}
      : { recommendationItemId: input.recommendationItemId }),
    ...(input.sourceContext === undefined
      ? {}
      : { sourceContext: input.sourceContext }),
    occurredAt: input.occurredAt ?? now,
  })

export class InMemoryProblemActionRepository implements ProblemActionRepository {
  private readonly actionsByAuthUserId = new Map<
    string,
    ProblemActionRecord[]
  >()

  constructor(private readonly now: () => Date = () => new Date()) {}

  async listByAuthUserId(authUserId: string) {
    const ownerId = parseAuthUserId(authUserId)
    const actions = this.actionsByAuthUserId.get(ownerId) ?? []

    return actions.map(problemActionFromValue)
  }

  async appendByAuthUserId(
    authUserId: string,
    input: AppendProblemActionInput,
  ) {
    const ownerId = parseAuthUserId(authUserId)
    const parsedInput = parseProblemActionInput(input)
    const actions = this.actionsByAuthUserId.get(ownerId) ?? []

    const existingImpression =
      parsedInput.actionType === 'impression' &&
      parsedInput.recommendationItemId !== undefined
        ? actions.find(
            (action) =>
              action.actionType === 'impression' &&
              action.recommendationItemId === parsedInput.recommendationItemId,
          )
        : undefined

    if (existingImpression !== undefined) {
      return problemActionFromValue(existingImpression)
    }

    const action = problemActionFromInput(parsedInput, this.now())

    actions.push(action)
    this.actionsByAuthUserId.set(ownerId, actions)

    return problemActionFromValue(action)
  }

  async deleteByAuthUserId(
    authUserId: string,
    provider: ProviderKey,
    externalId: string,
  ) {
    const ownerId = parseAuthUserId(authUserId)
    const actions = this.actionsByAuthUserId.get(ownerId) ?? []
    this.actionsByAuthUserId.set(
      ownerId,
      actions.filter(
        (action) =>
          action.provider !== provider || action.externalId !== externalId,
      ),
    )
  }

  async deleteProviderVerifiedByAuthUserId(
    authUserId: string,
    provider: ProviderKey,
  ) {
    const ownerId = parseAuthUserId(authUserId)
    const actions = this.actionsByAuthUserId.get(ownerId) ?? []
    this.actionsByAuthUserId.set(
      ownerId,
      actions.filter(
        (action) =>
          action.provider !== provider ||
          action.evidenceSource !== 'provider_verified',
      ),
    )
  }
}

export class PrismaProblemActionRepository implements ProblemActionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listByAuthUserId(authUserId: string) {
    const ownerId = parseAuthUserId(authUserId)
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId: ownerId },
      select: { id: true },
    })

    if (user === null) {
      return []
    }

    const records = await this.prisma.problemAction.findMany({
      where: { userId: user.id },
      orderBy: { occurredAt: 'asc' },
    })

    return records.map((record) => problemActionFromDatabase(record, user.id))
  }

  async appendByAuthUserId(
    authUserId: string,
    input: AppendProblemActionInput,
  ) {
    const ownerId = parseAuthUserId(authUserId)
    const parsedInput = parseProblemActionInput(input)
    const result = await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.coreUser.upsert({
        where: { authUserId: ownerId },
        create: { authUserId: ownerId },
        update: {},
        select: { id: true },
      })

      if (parsedInput.recommendationBatchId !== undefined) {
        const batch = await transaction.recommendationBatch.findFirst({
          where: {
            id: parsedInput.recommendationBatchId,
            userId: user.id,
          },
          select: { id: true },
        })

        if (batch === null) {
          throw new Error(
            'The recommendation batch is not owned by this learner.',
          )
        }
      }

      if (parsedInput.recommendationItemId !== undefined) {
        const item = await transaction.recommendationItem.findFirst({
          where: {
            id: parsedInput.recommendationItemId,
            batch: { userId: user.id },
          },
          select: { id: true },
        })

        if (item === null) {
          throw new Error(
            'The recommendation item is not owned by this learner.',
          )
        }
      }

      if (
        parsedInput.actionType === 'impression' &&
        parsedInput.recommendationItemId !== undefined
      ) {
        const existing = await transaction.problemAction.findFirst({
          where: {
            userId: user.id,
            actionType: 'impression',
            recommendationItemId: parsedInput.recommendationItemId,
          },
        })

        if (existing !== null) {
          return { ownerId: user.id, record: existing }
        }
      }

      const record = await transaction.problemAction.create({
        data: {
          userId: user.id,
          provider: parsedInput.provider,
          externalId: parsedInput.externalId,
          actionType: parsedInput.actionType,
          ...(parsedInput.learnerStatus === undefined
            ? {}
            : { learnerStatus: parsedInput.learnerStatus }),
          ...(parsedInput.evidenceSource === undefined
            ? {}
            : { evidenceSource: parsedInput.evidenceSource }),
          ...(parsedInput.recommendationBatchId === undefined
            ? {}
            : { recommendationBatchId: parsedInput.recommendationBatchId }),
          ...(parsedInput.recommendationItemId === undefined
            ? {}
            : { recommendationItemId: parsedInput.recommendationItemId }),
          ...(parsedInput.sourceContext === undefined
            ? {}
            : { sourceContext: parsedInput.sourceContext }),
          ...(parsedInput.occurredAt === undefined
            ? {}
            : { occurredAt: parsedInput.occurredAt }),
        },
      })

      return { ownerId: user.id, record }
    })

    return problemActionFromDatabase(result.record, result.ownerId)
  }

  async deleteByAuthUserId(
    authUserId: string,
    provider: ProviderKey,
    externalId: string,
  ) {
    const ownerId = parseAuthUserId(authUserId)
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId: ownerId },
      select: { id: true },
    })
    if (user === null) return
    await this.prisma.problemAction.deleteMany({
      where: { userId: user.id, provider, externalId },
    })
  }

  async deleteProviderVerifiedByAuthUserId(
    authUserId: string,
    provider: ProviderKey,
  ) {
    const ownerId = parseAuthUserId(authUserId)
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId: ownerId },
      select: { id: true },
    })
    if (user === null) return
    await this.prisma.problemAction.deleteMany({
      where: { userId: user.id, provider, evidenceSource: 'provider_verified' },
    })
  }
}
