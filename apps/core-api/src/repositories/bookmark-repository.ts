import {
  ProviderKeySchema,
  type ProviderKey,
} from '@algomemtor/shared-contracts'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import type { PrismaClient } from '../generated/prisma/client.js'

const authUserIdSchema = z.uuid()
const identifierSchema = z.uuid()
const externalIdSchema = z.string().trim().min(1).max(128).regex(/^\S+$/)

const bookmarkInputSchema = z
  .object({
    provider: ProviderKeySchema,
    externalId: externalIdSchema,
  })
  .strict()

const bookmarkRecordSchema = z
  .object({
    id: identifierSchema,
    provider: ProviderKeySchema,
    externalId: externalIdSchema,
    createdAt: z.date(),
  })
  .strict()

const bookmarkDatabaseRecordSchema = z
  .object({
    id: identifierSchema,
    userId: identifierSchema,
    provider: ProviderKeySchema,
    externalId: externalIdSchema,
    createdAt: z.date(),
  })
  .strict()

export type SaveBookmarkInput = z.infer<typeof bookmarkInputSchema>

export type BookmarkRecord = z.infer<typeof bookmarkRecordSchema>

export interface BookmarkRepository {
  listByAuthUserId(authUserId: string): Promise<BookmarkRecord[]>
  saveByAuthUserId(
    authUserId: string,
    input: SaveBookmarkInput,
  ): Promise<BookmarkRecord>
  deleteByAuthUserId(
    authUserId: string,
    provider: ProviderKey,
    externalId: string,
  ): Promise<boolean>
}

const parseAuthUserId = (authUserId: string) =>
  authUserIdSchema.parse(authUserId)

const parseBookmarkInput = (input: SaveBookmarkInput) =>
  bookmarkInputSchema.parse(input)

const publicBookmarkFromRecord = (
  record: unknown,
  ownerId?: string,
): BookmarkRecord => {
  const parsed = bookmarkDatabaseRecordSchema.parse(record)

  if (ownerId !== undefined && parsed.userId !== ownerId) {
    throw new Error('The bookmark is not owned by this learner.')
  }

  return bookmarkRecordSchema.parse({
    id: parsed.id,
    provider: parsed.provider,
    externalId: parsed.externalId,
    createdAt: parsed.createdAt,
  })
}

const publicBookmarkFromValue = (record: BookmarkRecord): BookmarkRecord =>
  bookmarkRecordSchema.parse(record)

export class InMemoryBookmarkRepository implements BookmarkRepository {
  private readonly bookmarksByAuthUserId = new Map<
    string,
    Map<string, BookmarkRecord>
  >()

  constructor(private readonly now: () => Date = () => new Date()) {}

  async listByAuthUserId(authUserId: string) {
    const ownerId = parseAuthUserId(authUserId)
    const bookmarks = this.bookmarksByAuthUserId.get(ownerId)

    return [...(bookmarks?.values() ?? [])]
      .sort(
        (left, right) =>
          right.createdAt.getTime() - left.createdAt.getTime() ||
          right.id.localeCompare(left.id),
      )
      .map(publicBookmarkFromValue)
  }

  async saveByAuthUserId(authUserId: string, input: SaveBookmarkInput) {
    const ownerId = parseAuthUserId(authUserId)
    const parsedInput = parseBookmarkInput(input)
    const bookmarks =
      this.bookmarksByAuthUserId.get(ownerId) ??
      new Map<string, BookmarkRecord>()
    const key = `${parsedInput.provider}\u0000${parsedInput.externalId}`
    const existing = bookmarks.get(key)

    if (existing !== undefined) {
      return publicBookmarkFromValue(existing)
    }

    const record = bookmarkRecordSchema.parse({
      id: randomUUID(),
      provider: parsedInput.provider,
      externalId: parsedInput.externalId,
      createdAt: this.now(),
    })

    bookmarks.set(key, record)
    this.bookmarksByAuthUserId.set(ownerId, bookmarks)

    return publicBookmarkFromValue(record)
  }

  async deleteByAuthUserId(
    authUserId: string,
    provider: ProviderKey,
    externalId: string,
  ) {
    const ownerId = parseAuthUserId(authUserId)
    const validatedProvider = ProviderKeySchema.parse(provider)
    const validatedExternalId = externalIdSchema.parse(externalId)
    const bookmarks = this.bookmarksByAuthUserId.get(ownerId)

    if (bookmarks === undefined) {
      return false
    }

    const key = `${validatedProvider}\u0000${validatedExternalId}`
    const deleted = bookmarks.delete(key)

    if (bookmarks.size === 0) {
      this.bookmarksByAuthUserId.delete(ownerId)
    }

    return deleted
  }
}

export class PrismaBookmarkRepository implements BookmarkRepository {
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

    const records = await this.prisma.bookmark.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    })

    return records.map((record) => publicBookmarkFromRecord(record, user.id))
  }

  async saveByAuthUserId(authUserId: string, input: SaveBookmarkInput) {
    const ownerId = parseAuthUserId(authUserId)
    const parsedInput = parseBookmarkInput(input)
    const result = await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.coreUser.upsert({
        where: { authUserId: ownerId },
        create: { authUserId: ownerId },
        update: {},
        select: { id: true },
      })

      const record = await transaction.bookmark.upsert({
        where: {
          userId_provider_externalId: {
            userId: user.id,
            provider: parsedInput.provider,
            externalId: parsedInput.externalId,
          },
        },
        create: {
          userId: user.id,
          provider: parsedInput.provider,
          externalId: parsedInput.externalId,
        },
        update: {},
      })

      return { ownerId: user.id, record }
    })

    return publicBookmarkFromRecord(result.record, result.ownerId)
  }

  async deleteByAuthUserId(
    authUserId: string,
    provider: ProviderKey,
    externalId: string,
  ) {
    const ownerId = parseAuthUserId(authUserId)
    const validatedProvider = ProviderKeySchema.parse(provider)
    const validatedExternalId = externalIdSchema.parse(externalId)

    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.coreUser.findUnique({
        where: { authUserId: ownerId },
        select: { id: true },
      })

      if (user === null) {
        return false
      }

      const result = await transaction.bookmark.deleteMany({
        where: {
          userId: user.id,
          provider: validatedProvider,
          externalId: validatedExternalId,
        },
      })

      return result.count > 0
    })
  }
}
