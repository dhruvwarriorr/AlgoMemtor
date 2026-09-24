import { randomUUID } from 'node:crypto'

import {
  RecommendationSteeringDirectivesSchema,
  type RecommendationSteeringDirectives,
} from '@algomemtor/shared-contracts'
import { z } from 'zod'

import type { PrismaClient } from '../generated/prisma/client.js'

// Only the newest instructions steer recommendations; older ones are
// retired automatically so the list stays readable and bounded.
export const MAX_ACTIVE_STEERING = 20

export type RecommendationSteeringRecord = {
  id: string
  text: string
  directives: RecommendationSteeringDirectives
  applied: string[]
  memoryId?: string
  createdAt: Date
}

export type NewRecommendationSteering = {
  text: string
  directives: RecommendationSteeringDirectives
  applied: string[]
}

export interface RecommendationSteeringRepository {
  listActive(authUserId: string): Promise<RecommendationSteeringRecord[]>
  create(
    authUserId: string,
    input: NewRecommendationSteering,
  ): Promise<RecommendationSteeringRecord>
  setMemoryId(authUserId: string, id: string, memoryId: string): Promise<void>
  // Returns the removed record, or null when it is not the learner's.
  remove(
    authUserId: string,
    id: string,
  ): Promise<RecommendationSteeringRecord | null>
}

const authUserIdSchema = z.uuid()
const appliedSchema = z.array(z.string().trim().min(1).max(160)).max(16)

type StoredSteering = RecommendationSteeringRecord & {
  authUserId: string
  removedAt?: Date
}

export class InMemoryRecommendationSteeringRepository implements RecommendationSteeringRepository {
  private readonly rows: StoredSteering[] = []

  async listActive(authUserId: string) {
    const owner = authUserIdSchema.parse(authUserId)
    return this.rows
      .filter((row) => row.authUserId === owner && row.removedAt === undefined)
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      )
      .map(({ authUserId: _owner, removedAt: _removed, ...record }) => record)
  }

  async create(authUserId: string, input: NewRecommendationSteering) {
    const owner = authUserIdSchema.parse(authUserId)
    const record: StoredSteering = {
      id: randomUUID(),
      authUserId: owner,
      text: input.text,
      directives: RecommendationSteeringDirectivesSchema.parse(
        input.directives,
      ),
      applied: appliedSchema.parse(input.applied),
      createdAt: new Date(),
    }
    this.rows.push(record)
    const active = this.rows
      .filter((row) => row.authUserId === owner && row.removedAt === undefined)
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      )
    active.slice(MAX_ACTIVE_STEERING).forEach((row) => {
      row.removedAt = new Date()
    })
    const { authUserId: _owner, ...created } = record
    return created
  }

  async setMemoryId(authUserId: string, id: string, memoryId: string) {
    const owner = authUserIdSchema.parse(authUserId)
    const row = this.rows.find(
      (candidate) => candidate.id === id && candidate.authUserId === owner,
    )
    if (row !== undefined) row.memoryId = memoryId
  }

  async remove(authUserId: string, id: string) {
    const owner = authUserIdSchema.parse(authUserId)
    const row = this.rows.find(
      (candidate) =>
        candidate.id === id &&
        candidate.authUserId === owner &&
        candidate.removedAt === undefined,
    )
    if (row === undefined) return null
    row.removedAt = new Date()
    const { authUserId: _owner, removedAt: _removed, ...record } = row
    return record
  }
}

const fromRecord = (record: {
  id: string
  text: string
  directives: unknown
  applied: unknown
  memoryId: string | null
  createdAt: Date
}): RecommendationSteeringRecord | null => {
  const directives = RecommendationSteeringDirectivesSchema.safeParse(
    record.directives,
  )
  const applied = appliedSchema.safeParse(record.applied)
  // A row written by an older directive format is skipped, not fatal.
  if (!directives.success || !applied.success) return null
  return {
    id: record.id,
    text: record.text,
    directives: directives.data,
    applied: applied.data,
    ...(record.memoryId === null ? {} : { memoryId: record.memoryId }),
    createdAt: record.createdAt,
  }
}

export class PrismaRecommendationSteeringRepository implements RecommendationSteeringRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listActive(authUserId: string) {
    const records = await this.prisma.recommendationSteering.findMany({
      where: {
        user: { authUserId: authUserIdSchema.parse(authUserId) },
        removedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ACTIVE_STEERING,
    })
    return records.flatMap((record) => {
      const parsed = fromRecord(record)
      return parsed === null ? [] : [parsed]
    })
  }

  async create(authUserId: string, input: NewRecommendationSteering) {
    const owner = authUserIdSchema.parse(authUserId)
    const directives = RecommendationSteeringDirectivesSchema.parse(
      input.directives,
    )
    const applied = appliedSchema.parse(input.applied)
    const record = await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.coreUser.upsert({
        where: { authUserId: owner },
        create: { authUserId: owner },
        update: {},
        select: { id: true },
      })
      const created = await transaction.recommendationSteering.create({
        data: { userId: user.id, text: input.text, directives, applied },
      })
      const overflow = await transaction.recommendationSteering.findMany({
        where: { userId: user.id, removedAt: null },
        orderBy: { createdAt: 'desc' },
        skip: MAX_ACTIVE_STEERING,
        select: { id: true },
      })
      if (overflow.length > 0) {
        await transaction.recommendationSteering.updateMany({
          where: { id: { in: overflow.map((row) => row.id) } },
          data: { removedAt: new Date() },
        })
      }
      return created
    })
    const parsed = fromRecord(record)
    if (parsed === null) {
      throw new Error('The saved recommendation instruction is invalid.')
    }
    return parsed
  }

  async setMemoryId(authUserId: string, id: string, memoryId: string) {
    await this.prisma.recommendationSteering.updateMany({
      where: {
        id: z.uuid().parse(id),
        user: { authUserId: authUserIdSchema.parse(authUserId) },
      },
      data: { memoryId: z.uuid().parse(memoryId) },
    })
  }

  async remove(authUserId: string, id: string) {
    const parsedId = z.uuid().safeParse(id)
    if (!parsedId.success) return null
    const owner = authUserIdSchema.parse(authUserId)
    const existing = await this.prisma.recommendationSteering.findFirst({
      where: {
        id: parsedId.data,
        user: { authUserId: owner },
        removedAt: null,
      },
    })
    if (existing === null) return null
    await this.prisma.recommendationSteering.update({
      where: { id: existing.id },
      data: { removedAt: new Date() },
    })
    return fromRecord(existing)
  }
}
