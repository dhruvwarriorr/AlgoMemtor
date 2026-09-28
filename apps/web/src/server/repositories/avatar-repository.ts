import { z } from 'zod'

import type { PrismaClient } from '../generated/prisma/client'

export const AVATAR_MAX_BYTES = 256 * 1024
export const avatarMimeTypes = [
  'image/webp',
  'image/jpeg',
  'image/png',
] as const
export type AvatarMimeType = (typeof avatarMimeTypes)[number]

export type StoredAvatar = {
  mimeType: AvatarMimeType
  data: Buffer
  updatedAt: Date
}

export interface AvatarRepository {
  findByAuthUserId(authUserId: string): Promise<StoredAvatar | null>
  saveByAuthUserId(
    authUserId: string,
    avatar: { mimeType: AvatarMimeType; data: Buffer },
  ): Promise<StoredAvatar>
  deleteByAuthUserId(authUserId: string): Promise<void>
}

const authUserIdSchema = z.uuid()

// The declared type is not trusted: the bytes must start with the matching
// image signature, so a renamed script or HTML file is rejected.
export function detectAvatarMimeType(data: Buffer): AvatarMimeType | null {
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return 'image/png'
  }
  if (
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  ) {
    return 'image/jpeg'
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

export class InMemoryAvatarRepository implements AvatarRepository {
  private readonly avatars = new Map<string, StoredAvatar>()

  async findByAuthUserId(authUserId: string) {
    return this.avatars.get(authUserIdSchema.parse(authUserId)) ?? null
  }

  async saveByAuthUserId(
    authUserId: string,
    avatar: { mimeType: AvatarMimeType; data: Buffer },
  ) {
    const stored = {
      ...avatar,
      data: Buffer.from(avatar.data),
      updatedAt: new Date(),
    }
    this.avatars.set(authUserIdSchema.parse(authUserId), stored)
    return stored
  }

  async deleteByAuthUserId(authUserId: string) {
    this.avatars.delete(authUserIdSchema.parse(authUserId))
  }
}

export class PrismaAvatarRepository implements AvatarRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByAuthUserId(authUserId: string) {
    const record = await this.prisma.userAvatar.findFirst({
      where: { user: { authUserId: authUserIdSchema.parse(authUserId) } },
    })
    if (record === null) return null
    const mimeType = avatarMimeTypes.find((type) => type === record.mimeType)
    if (mimeType === undefined) return null
    return {
      mimeType,
      data: Buffer.from(record.data),
      updatedAt: record.updatedAt,
    }
  }

  async saveByAuthUserId(
    authUserId: string,
    avatar: { mimeType: AvatarMimeType; data: Buffer },
  ) {
    const ownerId = authUserIdSchema.parse(authUserId)
    const record = await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.coreUser.upsert({
        where: { authUserId: ownerId },
        create: { authUserId: ownerId },
        update: {},
        select: { id: true },
      })
      const bytes = new Uint8Array(avatar.data)
      return transaction.userAvatar.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          mimeType: avatar.mimeType,
          data: bytes,
          byteSize: bytes.byteLength,
        },
        update: {
          mimeType: avatar.mimeType,
          data: bytes,
          byteSize: bytes.byteLength,
        },
      })
    })
    return {
      mimeType: avatar.mimeType,
      data: Buffer.from(record.data),
      updatedAt: record.updatedAt,
    }
  }

  async deleteByAuthUserId(authUserId: string) {
    await this.prisma.userAvatar.deleteMany({
      where: { user: { authUserId: authUserIdSchema.parse(authUserId) } },
    })
  }
}
