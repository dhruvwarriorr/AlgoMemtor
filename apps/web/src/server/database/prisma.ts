import { PrismaPg } from '@prisma/adapter-pg'
import { attachDatabasePool } from '@vercel/functions'
import { Pool } from 'pg'
import { z } from 'zod'

import { Prisma, PrismaClient } from '../generated/prisma/client'

const DatabaseConfigSchema = z
  .object({
    DATABASE_URL: z.url(),
    // Connections per instance. A coach turn issues a dozen reads at once;
    // with fewer connections they queue, and each wait costs a full round
    // trip to the database region. The transaction pooler multiplexes these
    // client connections onto its own small server pool.
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    DATABASE_CONNECTION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(250)
      .max(60_000)
      .default(5_000),
    DATABASE_TRANSACTION_MAX_WAIT_MS: z.coerce
      .number()
      .int()
      .min(250)
      .max(60_000)
      .default(15_000),
    DATABASE_TRANSACTION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(300_000)
      .default(60_000),
  })
  .passthrough()

export type DatabaseConfig = {
  url: string
  poolMax: number
  connectionTimeoutMs: number
  transactionMaxWaitMs: number
  transactionTimeoutMs: number
}

export function readDatabaseConfig(
  environment: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  const config = DatabaseConfigSchema.parse(environment)

  return {
    url: config.DATABASE_URL,
    poolMax: config.DATABASE_POOL_MAX,
    connectionTimeoutMs: config.DATABASE_CONNECTION_TIMEOUT_MS,
    transactionMaxWaitMs: config.DATABASE_TRANSACTION_MAX_WAIT_MS,
    transactionTimeoutMs: config.DATABASE_TRANSACTION_TIMEOUT_MS,
  }
}

export function createPrismaClient(config: DatabaseConfig) {
  const pool = new Pool({
    connectionString: config.url,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    idleTimeoutMillis: 10_000,
    max: config.poolMax,
  })
  // On Vercel, closes idle connections before a function instance is
  // suspended, so they do not linger on the Supabase pooler. Elsewhere it
  // does nothing.
  attachDatabasePool(pool)
  const adapter = new PrismaPg(pool)

  const client = new PrismaClient({
    adapter,
    transactionOptions: {
      maxWait: config.transactionMaxWaitMs,
      timeout: config.transactionTimeoutMs,
    },
  })
  // The extended client behaves exactly like PrismaClient; only the user ID
  // lookups below are answered from memory.
  return client.$extends(userIdCache()) as unknown as PrismaClient
}

// Nearly every repository call first maps the Supabase auth user ID to the
// core user ID (`coreUser.findUnique` or an ensure-exists `upsert`), a full
// round trip to the database before the real query. The mapping only
// changes when a learner's data is reset (the row is deleted and later
// recreated), so it is remembered briefly: deletes in this instance clear it
// at once, and other instances drop it within USER_ID_TTL_MS.
const USER_ID_TTL_MS = 30_000
const USER_ID_CACHE_LIMIT = 5_000

type UserIdArgs = {
  where?: unknown
  select?: unknown
  update?: unknown
}

const selectsOnlyId = (select: unknown) =>
  typeof select === 'object' &&
  select !== null &&
  Object.keys(select).length === 1 &&
  (select as { id?: unknown }).id === true

const authUserIdOnly = (where: unknown) => {
  if (typeof where !== 'object' || where === null) return undefined
  const keys = Object.keys(where)
  const value = (where as { authUserId?: unknown }).authUserId
  return keys.length === 1 && typeof value === 'string' ? value : undefined
}

function userIdCache() {
  const cache = new Map<string, { id: string; expiresAt: number }>()
  const cached = (authUserId: string) => {
    const entry = cache.get(authUserId)
    if (entry === undefined) return undefined
    if (entry.expiresAt > Date.now()) return entry.id
    cache.delete(authUserId)
    return undefined
  }
  const remember = (authUserId: string, result: unknown) => {
    const id = (result as { id?: unknown } | null)?.id
    if (typeof id !== 'string') return
    if (cache.size >= USER_ID_CACHE_LIMIT) cache.clear()
    cache.set(authUserId, { id, expiresAt: Date.now() + USER_ID_TTL_MS })
  }
  // A cacheable call: the ID alone, looked up by auth user ID alone (and,
  // for upsert, an empty update, which only ensures the row exists).
  const key = (args: UserIdArgs, upsert: boolean) =>
    selectsOnlyId(args.select) &&
    (!upsert ||
      (typeof args.update === 'object' &&
        args.update !== null &&
        Object.keys(args.update).length === 0))
      ? authUserIdOnly(args.where)
      : undefined

  return Prisma.defineExtension({
    name: 'algomemtor-user-id-cache',
    query: {
      coreUser: {
        async findUnique({ args, query }) {
          const authUserId = key(args, false)
          if (authUserId === undefined) return query(args)
          const id = cached(authUserId)
          if (id !== undefined) return { id }
          const result = await query(args)
          remember(authUserId, result)
          return result
        },
        async upsert({ args, query }) {
          const authUserId = key(args, true)
          if (authUserId === undefined) return query(args)
          const id = cached(authUserId)
          if (id !== undefined) return { id }
          const result = await query(args)
          remember(authUserId, result)
          return result
        },
        async delete({ args, query }) {
          cache.clear()
          return query(args)
        },
        async deleteMany({ args, query }) {
          cache.clear()
          return query(args)
        },
      },
    },
  })
}

export type CorePrismaClient = ReturnType<typeof createPrismaClient>
