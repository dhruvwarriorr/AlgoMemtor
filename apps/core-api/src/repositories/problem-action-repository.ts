import {
  LearnerProblemStatusSchema,
  ProviderKeySchema,
  type LearnerProblemStatus,
  type ProviderKey,
} from '@algomemtor/shared-contracts'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import type { PrismaClient } from '../generated/prisma/client.js'

const authUserIdSchema = z.uuid()
const identifierSchema = z.uuid()
const externalIdSchema = z.string().trim().min(1).max(128).regex(/^\S+$/)

export const ProblemActionTypeSchema = z.enum([
  'impression',
  'opened',
  'bookmarked',
  'unbookmarked',
  'dismissed',
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
    const action = problemActionFromInput(parsedInput, this.now())
    const actions = this.actionsByAuthUserId.get(ownerId) ?? []

    actions.push(action)
    this.actionsByAuthUserId.set(ownerId, actions)

    return problemActionFromValue(action)
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
          ...(parsedInput.occurredAt === undefined
            ? {}
            : { occurredAt: parsedInput.occurredAt }),
        },
      })

      return { ownerId: user.id, record }
    })

    return problemActionFromDatabase(result.record, result.ownerId)
  }
}
