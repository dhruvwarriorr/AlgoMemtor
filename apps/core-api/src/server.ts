import 'dotenv/config'

import { createApp } from './app.js'
import {
  createSupabaseJwtVerifier,
  readSupabaseJwtConfig,
} from './auth/supabase-jwt.js'
import { readAiRecommendationConfig } from './config/ai-config.js'
import { readCodeforcesProviderConfig } from './config/provider-config.js'
import { createPrismaClient, readDatabaseConfig } from './database/prisma.js'
import { CodeforcesProvider } from './integrations/codeforces/codeforces-provider.js'
import {
  HttpAiRecommendationClient,
  UnavailableAiRecommendationClient,
} from './integrations/ai/ai-recommendation-client.js'
import {
  HttpAiMemoryClient,
  UnavailableAiMemoryClient,
} from './integrations/ai/ai-memory-client.js'
import { CodeChefPublicStatsFetcher } from './integrations/provider-accounts/codechef-public-stats.js'
import { CodeforcesPublicStatsFetcher } from './integrations/provider-accounts/codeforces-public-stats.js'
import { LeetCodePublicStatsFetcher } from './integrations/provider-accounts/leetcode-public-stats.js'
import { PrismaLearnerProfileRepository } from './repositories/learner-profile-repository.js'
import { PrismaProblemActionRepository } from './repositories/problem-action-repository.js'
import { PrismaBookmarkRepository } from './repositories/bookmark-repository.js'
import { PrismaProgressRepository } from './repositories/progress-repository.js'
import { PrismaExternalProblemCacheRepository } from './repositories/external-problem-cache-repository.js'
import { PrismaProviderAccountRepository } from './repositories/provider-account-repository.js'
import { PrismaRecommendationRepository } from './repositories/recommendation-repository.js'
import { RequestGate } from './utils/request-gate.js'
import { structuredLogger } from './utils/structured-logger.js'

const port = Number(process.env.PORT ?? 3001)
const jwtVerifier = createSupabaseJwtVerifier(readSupabaseJwtConfig())
const prisma = createPrismaClient(readDatabaseConfig())
const codeforcesConfig = readCodeforcesProviderConfig()
const aiConfig = readAiRecommendationConfig()
const codeforcesRequestGate = new RequestGate({
  minIntervalMs: codeforcesConfig.minRequestIntervalMs,
})
const problemMetadataCache = new PrismaExternalProblemCacheRepository(prisma)

await prisma.$connect()

const app = createApp({
  aiRecommendationClient: aiConfig.configured
    ? new HttpAiRecommendationClient(aiConfig)
    : new UnavailableAiRecommendationClient(),
  aiMemoryClient: aiConfig.configured
    ? new HttpAiMemoryClient(aiConfig)
    : new UnavailableAiMemoryClient(),
  jwtVerifier,
  problemProvider: new CodeforcesProvider({
    ...codeforcesConfig,
    requestGate: codeforcesRequestGate,
    metadataCache: problemMetadataCache,
    logger: structuredLogger,
  }),
  learnerProfileRepository: new PrismaLearnerProfileRepository(prisma),
  problemActionRepository: new PrismaProblemActionRepository(prisma),
  progressRepository: new PrismaProgressRepository(prisma),
  bookmarkRepository: new PrismaBookmarkRepository(prisma),
  recommendationRepository: new PrismaRecommendationRepository(prisma),
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
