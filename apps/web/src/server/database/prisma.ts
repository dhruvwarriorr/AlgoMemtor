import { PrismaPg } from '@prisma/adapter-pg'
import { attachDatabasePool } from '@vercel/functions'
import { Pool } from 'pg'
import { z } from 'zod'

import { PrismaClient } from '../generated/prisma/client'

const DatabaseConfigSchema = z
  .object({
    DATABASE_URL: z.url(),
    // Every serverless instance holds its own pool, so the default is small.
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(3),
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

  return new PrismaClient({
    adapter,
    transactionOptions: {
      maxWait: config.transactionMaxWaitMs,
      timeout: config.transactionTimeoutMs,
    },
  })
}

export type CorePrismaClient = ReturnType<typeof createPrismaClient>
