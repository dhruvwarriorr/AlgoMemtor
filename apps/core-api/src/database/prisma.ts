import { PrismaPg } from '@prisma/adapter-pg'
import { z } from 'zod'

import { PrismaClient } from '../generated/prisma/client.js'

const DatabaseConfigSchema = z
  .object({
    DATABASE_URL: z.url(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    DATABASE_CONNECTION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(250)
      .max(60_000)
      .default(5_000),
  })
  .passthrough()

export type DatabaseConfig = {
  url: string
  poolMax: number
  connectionTimeoutMs: number
}

export function readDatabaseConfig(
  environment: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  const config = DatabaseConfigSchema.parse(environment)

  return {
    url: config.DATABASE_URL,
    poolMax: config.DATABASE_POOL_MAX,
    connectionTimeoutMs: config.DATABASE_CONNECTION_TIMEOUT_MS,
  }
}

export function createPrismaClient(config: DatabaseConfig) {
  const adapter = new PrismaPg({
    connectionString: config.url,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    idleTimeoutMillis: 10_000,
    max: config.poolMax,
  })

  return new PrismaClient({ adapter })
}

export type CorePrismaClient = ReturnType<typeof createPrismaClient>
