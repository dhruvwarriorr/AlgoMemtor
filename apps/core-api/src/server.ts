import 'dotenv/config'

import { createApp } from './app.js'
import {
  createSupabaseJwtVerifier,
  readSupabaseJwtConfig,
} from './auth/supabase-jwt.js'
import { readAiRecommendationConfig } from './config/ai-config.js'
import { readUnifiedProviderConfig } from './config/provider-config.js'
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
import {
  HttpAiCoachClient,
  UnavailableAiCoachClient,
} from './integrations/ai/ai-coach-client.js'
import {
  HttpAiRoadmapNoteClient,
  UnavailableAiRoadmapNoteClient,
} from './integrations/ai/ai-roadmap-note-client.js'
import {
  HttpAiMentorClient,
  UnavailableAiMentorClient,
} from './integrations/ai/ai-mentor-client.js'
import { PrismaMentorRepository } from './repositories/mentor-repository.js'
import { CodeChefPublicStatsFetcher } from './integrations/provider-accounts/codechef-public-stats.js'
import { CodeChefActivityFetcher } from './integrations/provider-accounts/codechef-activity.js'
import { LeetCodeActivityFetcher } from './integrations/provider-accounts/leetcode-activity.js'
import { CodeforcesPublicStatsFetcher } from './integrations/provider-accounts/codeforces-public-stats.js'
import { LeetCodePublicStatsFetcher } from './integrations/provider-accounts/leetcode-public-stats.js'
import { CodeChefProfileFetcher } from './integrations/provider-accounts/codechef-profile.js'
import { CodeforcesProfileFetcher } from './integrations/provider-accounts/codeforces-profile.js'
import { LeetCodeProfileFetcher } from './integrations/provider-accounts/leetcode-profile.js'
import { CodeChefProvider } from './integrations/codechef/codechef-provider.js'
import { LeetCodeProvider } from './integrations/leetcode/leetcode-provider.js'
import { CsesProvider } from './integrations/cses/cses-provider.js'
import { CodeforcesContestProvider } from './integrations/codeforces/codeforces-contest-provider.js'
import { CodeChefContestProvider } from './integrations/codechef/codechef-contest-provider.js'
import { LeetCodeContestProvider } from './integrations/leetcode/leetcode-contest-provider.js'
import { PrismaLearnerProfileRepository } from './repositories/learner-profile-repository.js'
import { PrismaProblemActionRepository } from './repositories/problem-action-repository.js'
import { PrismaBookmarkRepository } from './repositories/bookmark-repository.js'
import { PrismaProgressRepository } from './repositories/progress-repository.js'
import { PrismaExternalProblemCacheRepository } from './repositories/external-problem-cache-repository.js'
import { PrismaExternalContestCacheRepository } from './repositories/external-contest-cache-repository.js'
import { PrismaProblemContentCacheRepository } from './repositories/problem-content-cache-repository.js'
import { PrismaProviderAccountRepository } from './repositories/provider-account-repository.js'
import { PrismaConnectorTokenRepository } from './repositories/connector-token-repository.js'
import { PrismaLearnerActivityRepository } from './repositories/learner-activity-repository.js'
import { PrismaAvatarRepository } from './repositories/avatar-repository.js'
import { PrismaProviderSyncRepository } from './repositories/provider-sync-repository.js'
import { PrismaProviderProfileRepository } from './repositories/provider-profile-repository.js'
import { PrismaProviderDataRepository } from './repositories/provider-data-repository.js'
import { PrismaCoachRepository } from './repositories/coach-repository.js'
import { PrismaRecommendationRepository } from './repositories/recommendation-repository.js'
import { PrismaRecommendationSteeringRepository } from './repositories/recommendation-steering-repository.js'
import {
  AiUsageLimiter,
  PrismaAiUsageStore,
  readAiUsageLimitConfig,
} from './services/ai-usage-limiter.js'
import { RequestGate } from './utils/request-gate.js'
import { structuredLogger } from './utils/structured-logger.js'

const port = Number(process.env.PORT ?? 3001)
// A visit re-syncs linked accounts last synced longer ago than this.
const activeSyncStaleMinutes = Number(
  process.env.PROVIDER_ACTIVE_SYNC_STALE_MINUTES ?? 60,
)
const jwtVerifier = createSupabaseJwtVerifier(readSupabaseJwtConfig())
const prisma = createPrismaClient(readDatabaseConfig())
const providerConfig = readUnifiedProviderConfig()
const codeforcesConfig = providerConfig.codeforces
const aiConfig = readAiRecommendationConfig()
const codeforcesRequestGate = new RequestGate({
  minIntervalMs: codeforcesConfig.minRequestIntervalMs,
})
const problemMetadataCache = new PrismaExternalProblemCacheRepository(prisma)
const contestCache = new PrismaExternalContestCacheRepository(prisma)
const profileRepository = new PrismaProviderProfileRepository(prisma)
const providerDataRepository = new PrismaProviderDataRepository(prisma)
const contentCache = new PrismaProblemContentCacheRepository(prisma)
const codeforcesPublicStatsFetcher = new CodeforcesPublicStatsFetcher({
  baseUrl: codeforcesConfig.baseUrl,
  timeoutMs: codeforcesConfig.timeoutMs,
  maxAttempts: codeforcesConfig.maxAttempts,
  requestGate: codeforcesRequestGate,
})

const codechefRequestGate = new RequestGate({
  minIntervalMs: providerConfig.codechef.minRequestIntervalMs,
})
const leetcodeRequestGate = new RequestGate({
  minIntervalMs: providerConfig.leetcode.minRequestIntervalMs,
})
const csesRequestGate = new RequestGate({ minIntervalMs: 1000 })
const codeforcesProvider = new CodeforcesProvider({
  ...codeforcesConfig,
  cacheTtlMs: providerConfig.catalogCacheTtlMs,
  contentCacheTtlMs: providerConfig.contentCacheTtlMs,
  requestGate: codeforcesRequestGate,
  metadataCache: problemMetadataCache,
  contentCache,
  logger: structuredLogger,
})
const codechefProvider = new CodeChefProvider({
  ...providerConfig.codechef,
  cacheTtlMs: providerConfig.catalogCacheTtlMs,
  contentCacheTtlMs: providerConfig.contentCacheTtlMs,
  requestGate: codechefRequestGate,
  metadataCache: problemMetadataCache,
  contentCache,
})
const leetcodeProvider = new LeetCodeProvider({
  ...providerConfig.leetcode,
  cacheTtlMs: providerConfig.catalogCacheTtlMs,
  contentCacheTtlMs: providerConfig.contentCacheTtlMs,
  requestGate: leetcodeRequestGate,
  metadataCache: problemMetadataCache,
  contentCache,
})
const problemProviders = [
  ...(providerConfig.enabled.codeforces && codeforcesConfig.catalogEnabled
    ? [codeforcesProvider]
    : []),
  ...(providerConfig.enabled.codechef && providerConfig.codechef.catalogEnabled
    ? [codechefProvider]
    : []),
  ...(providerConfig.enabled.leetcode && providerConfig.leetcode.catalogEnabled
    ? [leetcodeProvider]
    : []),
  new CsesProvider({
    cacheTtlMs: providerConfig.catalogCacheTtlMs,
    requestGate: csesRequestGate,
  }),
]

if (problemProviders.length === 0) {
  throw new Error('At least one provider must be enabled.')
}

const contestProviders = [
  ...(providerConfig.enabled.codeforces && codeforcesConfig.contestsEnabled
    ? [
        new CodeforcesContestProvider({
          ...codeforcesConfig,
          cacheTtlMs: providerConfig.contestCacheTtlMs,
          requestGate: codeforcesRequestGate,
          cache: contestCache,
        }),
      ]
    : []),
  ...(providerConfig.enabled.codechef && providerConfig.codechef.contestsEnabled
    ? [
        new CodeChefContestProvider({
          ...providerConfig.codechef,
          cacheTtlMs: providerConfig.contestCacheTtlMs,
          requestGate: codechefRequestGate,
          cache: contestCache,
        }),
      ]
    : []),
  ...(providerConfig.enabled.leetcode && providerConfig.leetcode.contestsEnabled
    ? [
        new LeetCodeContestProvider({
          endpoint: providerConfig.leetcode.baseUrl,
          cacheTtlMs: providerConfig.contestCacheTtlMs,
          timeoutMs: providerConfig.leetcode.timeoutMs,
          maxAttempts: providerConfig.leetcode.maxAttempts,
          minRequestIntervalMs: providerConfig.leetcode.minRequestIntervalMs,
          requestGate: leetcodeRequestGate,
          cache: contestCache,
        }),
      ]
    : []),
]

await prisma.$connect()

const app = createApp({
  aiRecommendationClient: aiConfig.configured
    ? new HttpAiRecommendationClient(aiConfig)
    : new UnavailableAiRecommendationClient(),
  aiMemoryClient: aiConfig.configured
    ? new HttpAiMemoryClient(aiConfig)
    : new UnavailableAiMemoryClient(),
  aiCoachClient: aiConfig.configured
    ? new HttpAiCoachClient({
        baseUrl: aiConfig.baseUrl,
        internalServiceToken: aiConfig.internalServiceToken,
        // Covers grounding plus the agent budget (FastAPI allows 140s) and a
        // cold start of the serverless AI function.
        timeoutMs: 180_000,
      })
    : new UnavailableAiCoachClient(),
  aiRoadmapNoteClient: aiConfig.configured
    ? new HttpAiRoadmapNoteClient(aiConfig)
    : new UnavailableAiRoadmapNoteClient(),
  aiMentorClient: aiConfig.configured
    ? new HttpAiMentorClient({
        baseUrl: aiConfig.baseUrl,
        internalServiceToken: aiConfig.internalServiceToken,
        // The AI function runs at most 300s on Vercel; FastAPI enforces its
        // own shorter per-call limits.
        timeoutMs: 295_000,
      })
    : new UnavailableAiMentorClient(),
  mentorRepository: new PrismaMentorRepository(prisma),
  aiUsageLimiter: new AiUsageLimiter(
    readAiUsageLimitConfig(),
    new PrismaAiUsageStore(prisma),
  ),
  jwtVerifier,
  problemProvider: codeforcesProvider,
  problemProviders,
  contestProviders,
  learnerProfileRepository: new PrismaLearnerProfileRepository(prisma),
  problemActionRepository: new PrismaProblemActionRepository(prisma),
  progressRepository: new PrismaProgressRepository(prisma),
  bookmarkRepository: new PrismaBookmarkRepository(prisma),
  avatarRepository: new PrismaAvatarRepository(prisma),
  connectorTokenRepository: new PrismaConnectorTokenRepository(prisma),
  learnerActivityRepository: new PrismaLearnerActivityRepository(prisma),
  recommendationRepository: new PrismaRecommendationRepository(prisma),
  recommendationSteeringRepository: new PrismaRecommendationSteeringRepository(
    prisma,
  ),
  providerAccountRepository: new PrismaProviderAccountRepository(prisma),
  providerSyncRepository: new PrismaProviderSyncRepository(prisma),
  providerProfileRepository: profileRepository,
  providerDataRepository,
  coachRepository: new PrismaCoachRepository(prisma),
  problemMetadataCache,
  providerPublicStatsFetchers: [
    ...(providerConfig.enabled.codeforces && codeforcesConfig.profileEnabled
      ? [codeforcesPublicStatsFetcher]
      : []),
    ...(providerConfig.enabled.codechef &&
    providerConfig.codechef.profileEnabled
      ? [
          new CodeChefPublicStatsFetcher({
            baseUrl: `${providerConfig.codechef.baseUrl.replace(/\/+$/, '')}/users/`,
            timeoutMs: providerConfig.codechef.timeoutMs,
            maxAttempts: providerConfig.codechef.maxAttempts,
            requestGate: codechefRequestGate,
          }),
        ]
      : []),
    ...(providerConfig.enabled.leetcode &&
    providerConfig.leetcode.profileEnabled
      ? [
          new LeetCodePublicStatsFetcher({
            endpoint: providerConfig.leetcode.baseUrl,
            timeoutMs: providerConfig.leetcode.timeoutMs,
            requestGate: leetcodeRequestGate,
          }),
        ]
      : []),
  ],
  providerVerifiedActivityFetchers:
    providerConfig.enabled.codeforces && codeforcesConfig.activityEnabled
      ? [codeforcesPublicStatsFetcher]
      : [],
  providerProfileFetchers: [
    ...(providerConfig.enabled.codeforces && codeforcesConfig.profileEnabled
      ? [
          new CodeforcesProfileFetcher({
            baseUrl: codeforcesConfig.baseUrl,
            timeoutMs: codeforcesConfig.timeoutMs,
            maxAttempts: codeforcesConfig.maxAttempts,
            requestGate: codeforcesRequestGate,
          }),
        ]
      : []),
    ...(providerConfig.enabled.codechef &&
    providerConfig.codechef.profileEnabled
      ? [
          new CodeChefProfileFetcher({
            baseUrl: `${providerConfig.codechef.baseUrl.replace(/\/+$/, '')}/users/`,
            timeoutMs: providerConfig.codechef.timeoutMs,
            maxAttempts: providerConfig.codechef.maxAttempts,
            requestGate: codechefRequestGate,
          }),
        ]
      : []),
    ...(providerConfig.enabled.leetcode &&
    providerConfig.leetcode.profileEnabled
      ? [
          new LeetCodeProfileFetcher({
            endpoint: providerConfig.leetcode.baseUrl,
            timeoutMs: providerConfig.leetcode.timeoutMs,
            maxAttempts: providerConfig.leetcode.maxAttempts,
            requestGate: leetcodeRequestGate,
          }),
        ]
      : []),
  ],
  providerActivityMinRefreshIntervalMs:
    codeforcesConfig.activityMinRefreshIntervalMs,
  // Queued syncs and memory jobs run in this process when activity wakes
  // them; there are no separate worker services.
  jobPumpEnabled: true,
  ...(Number.isFinite(activeSyncStaleMinutes)
    ? { activeSessionSyncStaleMs: Math.max(5, activeSyncStaleMinutes) * 60_000 }
    : {}),
  providerSyncActivityFetchers: [
    ...(providerConfig.enabled.codeforces && codeforcesConfig.activityEnabled
      ? [codeforcesPublicStatsFetcher]
      : []),
    ...(providerConfig.enabled.codechef &&
    providerConfig.codechef.activityEnabled
      ? [
          new CodeChefActivityFetcher({
            baseUrl: `${providerConfig.codechef.baseUrl.replace(/\/+$/, '')}/users/`,
            timeoutMs: providerConfig.codechef.timeoutMs,
            maxAttempts: providerConfig.codechef.maxAttempts,
            requestGate: codechefRequestGate,
          }),
        ]
      : []),
    ...(providerConfig.enabled.leetcode &&
    providerConfig.leetcode.activityEnabled
      ? [
          new LeetCodeActivityFetcher({
            endpoint: providerConfig.leetcode.baseUrl,
            timeoutMs: providerConfig.leetcode.timeoutMs,
            maxAttempts: providerConfig.leetcode.maxAttempts,
            requestGate: leetcodeRequestGate,
          }),
        ]
      : []),
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
