import { randomUUID } from 'node:crypto'

import type { PrismaClient } from '../generated/prisma/client'

export type ConnectorTokenRecord = {
  id: string
  authUserId: string
  label: string
  createdAt: Date
  lastUsedAt: Date | null
}

// A learner may keep a few paired browsers; older tokens must be revoked
// before another is issued.
export const MAX_ACTIVE_CONNECTOR_TOKENS = 5

export class ConnectorTokenLimitError extends Error {
  readonly code = 'CONNECTOR_TOKEN_LIMIT'

  constructor() {
    super('Revoke an existing connector before creating another.')
    this.name = 'ConnectorTokenLimitError'
  }
}

export interface ConnectorTokenRepository {
  create(
    authUserId: string,
    label: string,
    tokenHash: string,
  ): Promise<ConnectorTokenRecord>
  listActive(authUserId: string): Promise<ConnectorTokenRecord[]>
  revoke(authUserId: string, id: string, revokedAt: Date): Promise<boolean>
  findActiveByHash(tokenHash: string): Promise<ConnectorTokenRecord | null>
  touch(id: string, usedAt: Date): Promise<void>
}

type StoredToken = ConnectorTokenRecord & {
  tokenHash: string
  revokedAt: Date | null
}

const publicRecord = ({
  tokenHash: _hash,
  revokedAt: _revoked,
  ...record
}: StoredToken): ConnectorTokenRecord => record

export class InMemoryConnectorTokenRepository implements ConnectorTokenRepository {
  private readonly tokens = new Map<string, StoredToken>()

  constructor(private readonly now: () => Date = () => new Date()) {}

  async create(authUserId: string, label: string, tokenHash: string) {
    if (
      (await this.listActive(authUserId)).length >= MAX_ACTIVE_CONNECTOR_TOKENS
    )
      throw new ConnectorTokenLimitError()
    const token: StoredToken = {
      id: randomUUID(),
      authUserId,
      label,
      tokenHash,
      createdAt: this.now(),
      lastUsedAt: null,
      revokedAt: null,
    }
    this.tokens.set(token.id, token)
    return publicRecord(token)
  }

  async listActive(authUserId: string) {
    return [...this.tokens.values()]
      .filter((token) => token.authUserId === authUserId && !token.revokedAt)
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      )
      .map(publicRecord)
  }

  async revoke(authUserId: string, id: string, revokedAt: Date) {
    const token = this.tokens.get(id)
    if (token?.authUserId !== authUserId || token.revokedAt !== null)
      return false
    this.tokens.set(id, { ...token, revokedAt })
    return true
  }

  async findActiveByHash(tokenHash: string) {
    const token = [...this.tokens.values()].find(
      (candidate) =>
        candidate.tokenHash === tokenHash && candidate.revokedAt === null,
    )
    return token === undefined ? null : publicRecord(token)
  }

  async touch(id: string, usedAt: Date) {
    const token = this.tokens.get(id)
    if (token !== undefined)
      this.tokens.set(id, { ...token, lastUsedAt: usedAt })
  }
}

export class PrismaConnectorTokenRepository implements ConnectorTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(authUserId: string, label: string, tokenHash: string) {
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.coreUser.upsert({
        where: { authUserId },
        create: { authUserId },
        update: {},
        select: { id: true },
      })
      const active = await transaction.connectorToken.count({
        where: { userId: user.id, revokedAt: null },
      })
      if (active >= MAX_ACTIVE_CONNECTOR_TOKENS)
        throw new ConnectorTokenLimitError()
      const record = await transaction.connectorToken.create({
        data: { userId: user.id, label, tokenHash },
      })
      return {
        id: record.id,
        authUserId,
        label: record.label,
        createdAt: record.createdAt,
        lastUsedAt: record.lastUsedAt,
      }
    })
  }

  async listActive(authUserId: string) {
    const records = await this.prisma.connectorToken.findMany({
      where: { user: { authUserId }, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    })
    return records.map((record) => ({
      id: record.id,
      authUserId,
      label: record.label,
      createdAt: record.createdAt,
      lastUsedAt: record.lastUsedAt,
    }))
  }

  async revoke(authUserId: string, id: string, revokedAt: Date) {
    const result = await this.prisma.connectorToken.updateMany({
      where: { id, user: { authUserId }, revokedAt: null },
      data: { revokedAt },
    })
    return result.count === 1
  }

  async findActiveByHash(tokenHash: string) {
    const record = await this.prisma.connectorToken.findFirst({
      where: { tokenHash, revokedAt: null },
      include: { user: { select: { authUserId: true } } },
    })
    return record === null
      ? null
      : {
          id: record.id,
          authUserId: record.user.authUserId,
          label: record.label,
          createdAt: record.createdAt,
          lastUsedAt: record.lastUsedAt,
        }
  }

  async touch(id: string, usedAt: Date) {
    await this.prisma.connectorToken.updateMany({
      where: { id },
      data: { lastUsedAt: usedAt },
    })
  }
}
