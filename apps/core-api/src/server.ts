import 'dotenv/config'

import { createApp } from './app.js'
import {
  createSupabaseJwtVerifier,
  readSupabaseJwtConfig,
} from './auth/supabase-jwt.js'
import { readCodeforcesProviderConfig } from './config/provider-config.js'
import { createPrismaClient, readDatabaseConfig } from './database/prisma.js'
import { CodeforcesProvider } from './integrations/codeforces/codeforces-provider.js'
import { CodeChefPublicStatsFetcher } from './integrations/provider-accounts/codechef-public-stats.js'
import { CodeforcesPublicStatsFetcher } from './integrations/provider-accounts/codeforces-public-stats.js'
import { LeetCodePublicStatsFetcher } from './integrations/provider-accounts/leetcode-public-stats.js'
import { PrismaLearnerProfileRepository } from './repositories/learner-profile-repository.js'
import { PrismaExternalProblemCacheRepository } from './repositories/external-problem-cache-repository.js'
import { PrismaProviderAccountRepository } from './repositories/provider-account-repository.js'
import { RequestGate } from './utils/request-gate.js'
import { structuredLogger } from './utils/structured-logger.js'

const port = Number(process.env.PORT ?? 3001)
const jwtVerifier = createSupabaseJwtVerifier(readSupabaseJwtConfig())
const prisma = createPrismaClient(readDatabaseConfig())
const codeforcesConfig = readCodeforcesProviderConfig()
const codeforcesRequestGate = new RequestGate({
  minIntervalMs: codeforcesConfig.minRequestIntervalMs,
})
const problemMetadataCache = new PrismaExternalProblemCacheRepository(prisma)

await prisma.$connect()

const app = createApp({
  jwtVerifier,
  problemProvider: new CodeforcesProvider({
    ...codeforcesConfig,
    requestGate: codeforcesRequestGate,
    metadataCache: problemMetadataCache,
    logger: structuredLogger,
  }),
  learnerProfileRepository: new PrismaLearnerProfileRepository(prisma),
  providerAccountRepository: new PrismaProviderAccountRepository(prisma),
  providerPublicStatsFetchers: [
    new CodeforcesPublicStatsFetcher({
      baseUrl: codeforcesConfig.baseUrl,
      timeoutMs: codeforcesConfig.timeoutMs,
      requestGate: codeforcesRequestGate,
    }),
    new CodeChefPublicStatsFetcher(),
    new LeetCodePublicStatsFetcher(),
  ],
})

const server = app.listen(port, () => {
  console.log(`Core API listening on http://localhost:${port}`)
})

let isShuttingDown = false

async function shutdown(signal: string) {
  if (isShuttingDown) {
    return
  }

  isShuttingDown = true
  console.log(`Received ${signal}; closing the core API.`)

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  await prisma.$disconnect()
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown(signal).then(
      () => process.exit(0),
      () => process.exit(1),
    )
  })
}
