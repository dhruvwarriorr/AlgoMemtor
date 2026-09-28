import {
  LearnerActivityDigestSchema,
  type LearnerActivityDigest,
} from '@algomemtor/shared-contracts'

import type { PrismaClient } from '../generated/prisma/client'

export type StoredLearnerActivityDigest = {
  digest: LearnerActivityDigest
  sourceHash: string
  computedAt: Date
}

export interface LearnerActivityRepository {
  getDigest(authUserId: string): Promise<StoredLearnerActivityDigest | null>
  saveDigest(
    authUserId: string,
    digest: LearnerActivityDigest,
    sourceHash: string,
  ): Promise<void>
  // Stores a change note and returns its ID, the memory evidence reference.
  addChange(authUserId: string, note: string): Promise<string | null>
  getChange(
    authUserId: string,
    id: string,
  ): Promise<{ note: string; createdAt: Date } | null>
}

export class InMemoryLearnerActivityRepository implements LearnerActivityRepository {
  private readonly digests = new Map<string, StoredLearnerActivityDigest>()
  private readonly changes = new Map<
    string,
    { authUserId: string; note: string; createdAt: Date }
  >()

  async getDigest(authUserId: string) {
    return this.digests.get(authUserId) ?? null
  }

  async saveDigest(
    authUserId: string,
    digest: LearnerActivityDigest,
    sourceHash: string,
  ) {
    this.digests.set(authUserId, {
      digest: LearnerActivityDigestSchema.parse(digest),
      sourceHash,
      computedAt: new Date(digest.computedAt),
    })
  }

  async addChange(authUserId: string, note: string) {
    const id = crypto.randomUUID()
    this.changes.set(id, { authUserId, note, createdAt: new Date() })
    return id
  }

  async getChange(authUserId: string, id: string) {
    const change = this.changes.get(id)
    return change?.authUserId === authUserId
      ? { note: change.note, createdAt: change.createdAt }
      : null
  }
}

export class PrismaLearnerActivityRepository implements LearnerActivityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private async userId(authUserId: string) {
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId },
      select: { id: true },
    })
    return user?.id ?? null
  }

  async getDigest(authUserId: string) {
    const record = await this.prisma.learnerActivityDigest.findFirst({
      where: { user: { authUserId } },
    })
    if (record === null) return null
    // A digest written by an older version is treated as missing and rebuilt.
    const digest = LearnerActivityDigestSchema.safeParse(record.digest)
    return digest.success
      ? {
          digest: digest.data,
          sourceHash: record.sourceHash,
          computedAt: record.computedAt,
        }
      : null
  }

  async saveDigest(
    authUserId: string,
    digest: LearnerActivityDigest,
    sourceHash: string,
  ) {
    const userId = await this.userId(authUserId)
    if (userId === null) return
    const parsed = LearnerActivityDigestSchema.parse(digest)
    const data = {
      version: parsed.version,
      digest: parsed,
      sourceHash,
      computedAt: new Date(parsed.computedAt),
    }
    await this.prisma.learnerActivityDigest.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    })
  }

  async addChange(authUserId: string, note: string) {
    const userId = await this.userId(authUserId)
    if (userId === null) return null
    const record = await this.prisma.learnerActivityChange.create({
      data: { userId, note: note.slice(0, 1000) },
      select: { id: true },
    })
    return record.id
  }

  async getChange(authUserId: string, id: string) {
    const record = await this.prisma.learnerActivityChange.findFirst({
      where: { id, user: { authUserId } },
      select: { note: true, createdAt: true },
    })
    return record
  }
}
