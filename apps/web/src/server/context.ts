import 'server-only'

import { createHash, randomInt, randomUUID } from 'node:crypto'

import {
  ConnectorTokenSchema,
  LearnerMemorySchema,
  LinkableProviderSchema,
  type ExternalProblemSummary,
  type RecommendationFeedResponse,
  type RecommendationSteering,
} from '@algomemtor/shared-contracts'
import { after } from 'next/server'
import type { z } from 'zod'

import {
  createSupabaseJwtVerifier,
  readSupabaseJwtConfig,
  type SupabaseJwtVerifier,
} from './auth/supabase-jwt'
import { readAiRecommendationConfig } from './config/ai-config'
import { readUnifiedProviderConfig } from './config/provider-config'
import { createPrismaClient, readDatabaseConfig } from './database/prisma'
import {
  HttpAiCoachClient,
  UnavailableAiCoachClient,
  type AiCoachClient,
} from './integrations/ai/ai-coach-client'
import {
  AiMemoryClientError,
  HttpAiMemoryClient,
  UnavailableAiMemoryClient,
  type AiMemoryClient,
  type AiMemoryRecord,
} from './integrations/ai/ai-memory-client'
import {
  HttpAiMentorClient,
  UnavailableAiMentorClient,
  type AiMentorClient,
} from './integrations/ai/ai-mentor-client'
import {
  HttpAiRecommendationClient,
  UnavailableAiRecommendationClient,
  type AiRecommendationClient,
} from './integrations/ai/ai-recommendation-client'
import {
  HttpAiRoadmapNoteClient,
  UnavailableAiRoadmapNoteClient,
  type AiRoadmapNoteClient,
} from './integrations/ai/ai-roadmap-note-client'
import { CodeChefContestProvider } from './integrations/codechef/codechef-contest-provider'
import { CodeChefProvider } from './integrations/codechef/codechef-provider'
import { CodeforcesContestProvider } from './integrations/codeforces/codeforces-contest-provider'
import { CodeforcesProvider } from './integrations/codeforces/codeforces-provider'
import { CsesProvider } from './integrations/cses/cses-provider'
import { LeetCodeContestProvider } from './integrations/leetcode/leetcode-contest-provider'
import { LeetCodeProvider } from './integrations/leetcode/leetcode-provider'
import { CodeChefActivityFetcher } from './integrations/provider-accounts/codechef-activity'
import { CodeChefProfileFetcher } from './integrations/provider-accounts/codechef-profile'
import { CodeChefPublicStatsFetcher } from './integrations/provider-accounts/codechef-public-stats'
import { CodeforcesProfileFetcher } from './integrations/provider-accounts/codeforces-profile'
import { CodeforcesPublicStatsFetcher } from './integrations/provider-accounts/codeforces-public-stats'
import { LeetCodeActivityFetcher } from './integrations/provider-accounts/leetcode-activity'
import { LeetCodeProfileFetcher } from './integrations/provider-accounts/leetcode-profile'
import { LeetCodePublicStatsFetcher } from './integrations/provider-accounts/leetcode-public-stats'
import {
  CodeChefOwnershipChecker,
  CodeforcesOwnershipChecker,
  LeetCodeOwnershipChecker,
  type ProviderOwnershipChecker,
} from './integrations/provider-accounts/provider-ownership'
import type { ProviderActivityDataFetcher } from './integrations/provider-accounts/provider-public-stats'
import type { ContestProvider } from './integrations/providers/contest-provider'
import type { ProblemProvider } from './integrations/providers/problem-provider'
import { MemoryWorker } from './memory-worker'
import { PrismaAvatarRepository } from './repositories/avatar-repository'
import { PrismaBookmarkRepository } from './repositories/bookmark-repository'
import { PrismaCoachRepository } from './repositories/coach-repository'
import { PrismaConnectorTokenRepository } from './repositories/connector-token-repository'
import { PrismaExternalContestCacheRepository } from './repositories/external-contest-cache-repository'
import { PrismaExternalProblemCacheRepository } from './repositories/external-problem-cache-repository'
import { PrismaLearnerActivityRepository } from './repositories/learner-activity-repository'
import { PrismaLearnerProfileRepository } from './repositories/learner-profile-repository'
import { PrismaMentorRepository } from './repositories/mentor-repository'
import { PrismaProblemActionRepository } from './repositories/problem-action-repository'
import { PrismaProblemContentCacheRepository } from './repositories/problem-content-cache-repository'
import { PrismaProgressRepository } from './repositories/progress-repository'
import { PrismaProviderAccountRepository } from './repositories/provider-account-repository'
import { PrismaProviderDataRepository } from './repositories/provider-data-repository'
import { PrismaProviderProfileRepository } from './repositories/provider-profile-repository'
import { PrismaProviderSyncRepository } from './repositories/provider-sync-repository'
import { PrismaRecommendationRepository } from './repositories/recommendation-repository'
import {
  PrismaRecommendationSteeringRepository,
  type RecommendationSteeringRecord,
} from './repositories/recommendation-steering-repository'
import {
  AiUsageLimiter,
  PrismaAiUsageStore,
  readAiUsageLimitConfig,
} from './services/ai-usage-limiter'
import { CoachLiveRefreshService } from './services/coach-live-refresh-service'
import { CoachService } from './services/coach-service'
import { ConnectorService } from './services/connector-service'
import { ContestCatalogService } from './services/contest-catalog-service'
import { JobPump } from './services/job-pump'
import { LearnerActivityService } from './services/learner-activity-service'
import { MentorService } from './services/mentor-service'
import { ProblemCatalogService } from './services/problem-catalog-service'
import {
  ProgressOutboxUnavailableError,
  ProgressService,
} from './services/progress-service'
import { ProviderAccountStatsService } from './services/provider-account-stats-service'
import { ProviderActivityService } from './services/provider-activity-service'
import { ProviderProfileService } from './services/provider-profile-service'
import { ProviderSyncService } from './services/provider-sync-service'
import { ProviderSyncWorker } from './services/provider-sync-worker'
import { RecommendationService } from './services/recommendation-service'
import { RequestGate } from './utils/request-gate'
import { dedupeConcurrentReads } from './utils/dedupe-reads'
import { structuredLogger } from './utils/structured-logger'

// Everything the route handlers share: repositories, services and the
// learner-facing helpers the old Express app kept in its closure. One
// instance per server process; see `getServerContext` below.

// Unambiguous characters only (no 0/O or 1/I), so a code copied by hand into
// a profile field still matches.
const VERIFICATION_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const VERIFICATION_TTL_MS = 30 * 60 * 1000

export const createVerificationCode = () =>
  `AM-${Array.from(
    { length: 8 },
    () => VERIFICATION_ALPHABET[randomInt(VERIFICATION_ALPHABET.length)],
  ).join('')}`

export const latestLearnerStatuses = (
  actions: readonly {
    provider: string
    externalId: string
    actionType: string
    learnerStatus?: 'unsolved' | 'attempted' | 'solved' | undefined
    evidenceSource?: 'manual' | 'provider_verified' | undefined
    occurredAt: Date
    id: string
  }[],
) => {
  const statuses = new Map<string, 'unsolved' | 'attempted' | 'solved'>()
  const grouped = new Map<string, (typeof actions)[number][]>()
  for (const action of actions
    .filter((item) => item.actionType === 'status_changed')
    .sort(
      (left, right) =>
        left.occurredAt.getTime() - right.occurredAt.getTime() ||
        left.id.localeCompare(right.id),
    )) {
    if (action.learnerStatus === undefined) continue
    const key = `${action.provider}:${action.externalId}`
    const values = grouped.get(key) ?? []
    values.push(action)
    grouped.set(key, values)
  }
  for (const [key, values] of grouped) {
    const manual = values.filter((item) => item.evidenceSource === 'manual')
    const latest = manual.at(-1) ?? values.at(-1)
    if (latest?.learnerStatus !== undefined)
      statuses.set(key, latest.learnerStatus)
  }
  return statuses
}

export const serializeConnectorToken = (token: {
  id: string
  label: string
  createdAt: Date
  lastUsedAt: Date | null
}) =>
  ConnectorTokenSchema.parse({
    id: token.id,
    label: token.label,
    createdAt: token.createdAt.toISOString(),
    ...(token.lastUsedAt === null
      ? {}
      : { lastUsedAt: token.lastUsedAt.toISOString() }),
  })

export const steeringView = (
  record: RecommendationSteeringRecord,
): RecommendationSteering => ({
  id: record.id,
  text: record.text,
  directives: record.directives,
  applied: record.applied,
  savedToMemory: record.memoryId !== undefined,
  createdAt: record.createdAt.toISOString(),
})

const errorCode = (error: unknown, fallback: string) =>
  error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : fallback

function createServerContext() {
  const logger = structuredLogger
  const env = process.env
  const memoryGenerationEnabled = env.MEMORY_GENERATION_ENABLED !== 'false'
  const progressEnabled = env.PROGRESS_ENABLED !== 'false'
  const memoryManagementEnabled =
    env.MEMORY_GENERATION_ENABLED !== 'false' ||
    env.MEMORY_RAG_ENABLED !== 'false'
  // A visit re-syncs linked accounts last synced longer ago than this.
  const activeSyncStaleMinutes = Number(
    env.PROVIDER_ACTIVE_SYNC_STALE_MINUTES ?? 60,
  )
  const activeSessionSyncStaleMs = Number.isFinite(activeSyncStaleMinutes)
    ? Math.max(5, activeSyncStaleMinutes) * 60_000
    : 60 * 60 * 1000

  const jwtVerifier: SupabaseJwtVerifier = createSupabaseJwtVerifier(
    readSupabaseJwtConfig(),
  )
  const prisma = createPrismaClient(readDatabaseConfig())
  const providerConfig = readUnifiedProviderConfig()
  const codeforcesConfig = providerConfig.codeforces
  const aiConfig = readAiRecommendationConfig()
  const internalServiceToken = env.INTERNAL_SERVICE_TOKEN?.trim() ?? ''

  // --- Providers ------------------------------------------------------------

  const codeforcesRequestGate = new RequestGate({
    minIntervalMs: codeforcesConfig.minRequestIntervalMs,
  })
  const codechefRequestGate = new RequestGate({
    minIntervalMs: providerConfig.codechef.minRequestIntervalMs,
  })
  const leetcodeRequestGate = new RequestGate({
    minIntervalMs: providerConfig.leetcode.minRequestIntervalMs,
  })
  const csesRequestGate = new RequestGate({ minIntervalMs: 1000 })
  const codechefUsersUrl = `${providerConfig.codechef.baseUrl.replace(/\/+$/, '')}/users/`

  const problemMetadataCache = new PrismaExternalProblemCacheRepository(prisma)
  const contestCache = new PrismaExternalContestCacheRepository(prisma)
  const contentCache = new PrismaProblemContentCacheRepository(prisma)

  const codeforcesPublicStatsFetcher = new CodeforcesPublicStatsFetcher({
    baseUrl: codeforcesConfig.baseUrl,
    timeoutMs: codeforcesConfig.timeoutMs,
    maxAttempts: codeforcesConfig.maxAttempts,
    requestGate: codeforcesRequestGate,
  })
  const codeforcesProvider = new CodeforcesProvider({
    ...codeforcesConfig,
    cacheTtlMs: providerConfig.catalogCacheTtlMs,
    contentCacheTtlMs: providerConfig.contentCacheTtlMs,
    requestGate: codeforcesRequestGate,
    metadataCache: problemMetadataCache,
    contentCache,
    logger,
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
  const providers: readonly ProblemProvider[] = [
    ...(providerConfig.enabled.codeforces && codeforcesConfig.catalogEnabled
      ? [codeforcesProvider]
      : []),
    ...(providerConfig.enabled.codechef &&
    providerConfig.codechef.catalogEnabled
      ? [codechefProvider]
      : []),
    ...(providerConfig.enabled.leetcode &&
    providerConfig.leetcode.catalogEnabled
      ? [leetcodeProvider]
      : []),
    new CsesProvider({
      cacheTtlMs: providerConfig.catalogCacheTtlMs,
      requestGate: csesRequestGate,
    }),
  ]
  // The recommendation and progress services default to Codeforces.
  const provider = codeforcesProvider

  const contestProviders: readonly ContestProvider[] = [
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
    ...(providerConfig.enabled.codechef &&
    providerConfig.codechef.contestsEnabled
      ? [
          new CodeChefContestProvider({
            ...providerConfig.codechef,
            cacheTtlMs: providerConfig.contestCacheTtlMs,
            requestGate: codechefRequestGate,
            cache: contestCache,
          }),
        ]
      : []),
    ...(providerConfig.enabled.leetcode &&
    providerConfig.leetcode.contestsEnabled
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

  const providerPublicStatsFetchers = [
    ...(providerConfig.enabled.codeforces && codeforcesConfig.profileEnabled
      ? [codeforcesPublicStatsFetcher]
      : []),
    ...(providerConfig.enabled.codechef &&
    providerConfig.codechef.profileEnabled
      ? [
          new CodeChefPublicStatsFetcher({
            baseUrl: codechefUsersUrl,
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
  ]
  const providerVerifiedActivityFetchers =
    providerConfig.enabled.codeforces && codeforcesConfig.activityEnabled
      ? [codeforcesPublicStatsFetcher]
      : []
  const providerProfileFetchers = [
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
            baseUrl: codechefUsersUrl,
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
  ]
  // Fetchers queued provider syncs use for a learner's full history.
  const providerSyncActivityFetchers: readonly ProviderActivityDataFetcher[] = [
    ...(providerConfig.enabled.codeforces && codeforcesConfig.activityEnabled
      ? [codeforcesPublicStatsFetcher]
      : []),
    ...(providerConfig.enabled.codechef &&
    providerConfig.codechef.activityEnabled
      ? [
          new CodeChefActivityFetcher({
            baseUrl: codechefUsersUrl,
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
  ]
  // Small budgets: a coach live refresh should answer within a coaching turn.
  const providerActivityFetchers: readonly ProviderActivityDataFetcher[] = [
    ...(providerConfig.enabled.codeforces && codeforcesConfig.activityEnabled
      ? [
          new CodeforcesPublicStatsFetcher({
            baseUrl: codeforcesConfig.baseUrl,
            timeoutMs: codeforcesConfig.timeoutMs,
            maxAttempts: 1,
          }),
        ]
      : []),
    ...(providerConfig.enabled.codechef &&
    providerConfig.codechef.activityEnabled
      ? [
          new CodeChefActivityFetcher({
            baseUrl: codechefUsersUrl,
            timeoutMs: providerConfig.codechef.timeoutMs,
            maxAttempts: 1,
            maxPages: 3,
          }),
        ]
      : []),
    ...(providerConfig.enabled.leetcode &&
    providerConfig.leetcode.activityEnabled
      ? [
          new LeetCodeActivityFetcher({
            endpoint: providerConfig.leetcode.baseUrl,
            timeoutMs: providerConfig.leetcode.timeoutMs,
            maxAttempts: 1,
          }),
        ]
      : []),
  ]
  const providerOwnershipCheckers: readonly ProviderOwnershipChecker[] = [
    ...(providerConfig.enabled.codeforces && codeforcesConfig.profileEnabled
      ? [new CodeforcesOwnershipChecker()]
      : []),
    ...(providerConfig.enabled.codechef &&
    providerConfig.codechef.profileEnabled
      ? [new CodeChefOwnershipChecker()]
      : []),
    ...(providerConfig.enabled.leetcode &&
    providerConfig.leetcode.profileEnabled
      ? [new LeetCodeOwnershipChecker()]
      : []),
  ]

  // --- AI clients -----------------------------------------------------------

  const aiRecommendationClient: AiRecommendationClient = aiConfig.configured
    ? new HttpAiRecommendationClient(aiConfig)
    : new UnavailableAiRecommendationClient()
  const aiMemoryClient: AiMemoryClient = aiConfig.configured
    ? new HttpAiMemoryClient(aiConfig)
    : new UnavailableAiMemoryClient()
  const aiCoachClient: AiCoachClient = aiConfig.configured
    ? new HttpAiCoachClient({
        baseUrl: aiConfig.baseUrl,
        internalServiceToken: aiConfig.internalServiceToken,
        // Covers grounding plus the agent budget (FastAPI allows 140s) and a
        // cold start of the serverless AI function.
        timeoutMs: 180_000,
      })
    : new UnavailableAiCoachClient()
  const aiRoadmapNoteClient: AiRoadmapNoteClient = aiConfig.configured
    ? new HttpAiRoadmapNoteClient(aiConfig)
    : new UnavailableAiRoadmapNoteClient()
  const aiMentorClient: AiMentorClient = aiConfig.configured
    ? new HttpAiMentorClient({
        baseUrl: aiConfig.baseUrl,
        internalServiceToken: aiConfig.internalServiceToken,
        // The AI function runs at most 300s on Vercel; FastAPI enforces its
        // own shorter per-call limits.
        timeoutMs: 295_000,
      })
    : new UnavailableAiMentorClient()

  // --- Repositories and services -------------------------------------------

  const learnerProfileRepository = dedupeConcurrentReads(
    new PrismaLearnerProfileRepository(prisma),
    ['findByAuthUserId'],
  )
  const providerAccountRepository = dedupeConcurrentReads(
    new PrismaProviderAccountRepository(prisma),
    ['findAllByAuthUserId', 'findAllIncludingDisconnectedByAuthUserId'],
  )
  const providerSyncRepository = new PrismaProviderSyncRepository(prisma)
  const providerProfileRepository = dedupeConcurrentReads(
    new PrismaProviderProfileRepository(prisma),
    ['findLatestByAuthUserId'],
  )
  const providerDataRepository = dedupeConcurrentReads(
    new PrismaProviderDataRepository(prisma),
    [
      'listSubmissions',
      'listSolvedProblems',
      'listRatingChanges',
      'listContestParticipations',
    ],
  )
  const problemActionRepository = dedupeConcurrentReads(
    new PrismaProblemActionRepository(prisma),
    ['listByAuthUserId'],
  )
  const progressRepository = dedupeConcurrentReads(
    new PrismaProgressRepository(prisma),
    [
      'listReflections',
      'listTimerSessions',
      'hasPendingDeletion',
      'getConsent',
    ],
  )
  const learnerActivityRepository = new PrismaLearnerActivityRepository(prisma)
  const bookmarkRepository = dedupeConcurrentReads(
    new PrismaBookmarkRepository(prisma),
    ['listByAuthUserId'],
  )
  const avatarRepository = new PrismaAvatarRepository(prisma)
  const recommendationRepository = dedupeConcurrentReads(
    new PrismaRecommendationRepository(prisma),
    ['listFeedbackByAuthUserId', 'listBatchesByAuthUserId'],
  )
  const coachRepository = dedupeConcurrentReads(
    new PrismaCoachRepository(prisma),
    ['getRoadmap', 'listRoadmapRevisions'],
  )

  const aiUsageLimiter = new AiUsageLimiter(
    readAiUsageLimitConfig(),
    new PrismaAiUsageStore(prisma),
  )
  const catalogService = new ProblemCatalogService(providers)
  const contestCatalogService = new ContestCatalogService(contestProviders)
  const connectorService = new ConnectorService({
    accountRepository: providerAccountRepository,
    dataRepository: providerDataRepository,
    tokenRepository: new PrismaConnectorTokenRepository(prisma),
    problemMetadataCache,
    logger,
  })
  const learnerActivityService = new LearnerActivityService({
    repository: learnerActivityRepository,
    accountRepository: providerAccountRepository,
    dataRepository: providerDataRepository,
    profileRepository: providerProfileRepository,
    syncRepository: providerSyncRepository,
    problemMetadataCache,
    progressRepository,
    logger,
  })
  const coachLiveRefresh = new CoachLiveRefreshService({
    accountRepository: providerAccountRepository,
    dataRepository: providerDataRepository,
    syncRepository: providerSyncRepository,
    activityFetchers: providerActivityFetchers,
    refreshDigest: async (authUserId) =>
      (await learnerActivityService.refresh(authUserId)).digest,
    logger,
  })
  const recommendationService = new RecommendationService({
    aiRecommendationClient,
    provider,
    providers,
    learnerProfileRepository,
    problemActionRepository,
    providerDataRepository,
    coachRepository,
    progressRepository,
    recommendationRepository,
    steeringRepository: new PrismaRecommendationSteeringRepository(prisma),
    logger,
    memoryGenerationEnabled,
  })
  const providerAccountStatsService = new ProviderAccountStatsService({
    repository: providerAccountRepository,
    fetchers: providerPublicStatsFetchers,
    logger,
  })
  const providerActivityService = new ProviderActivityService({
    repository: providerAccountRepository,
    actionRepository: problemActionRepository,
    fetchers: providerVerifiedActivityFetchers,
    minRefreshIntervalMs: codeforcesConfig.activityMinRefreshIntervalMs,
    logger,
  })
  const providerSyncService = new ProviderSyncService({
    repository: providerSyncRepository,
    providerAccountRepository,
  })
  const providerProfileService = new ProviderProfileService({
    accountRepository: providerAccountRepository,
    profileRepository: providerProfileRepository,
    fetchers: providerProfileFetchers,
  })
  const progressService = new ProgressService({
    actionRepository: problemActionRepository,
    progressRepository,
    bookmarkRepository,
    recommendationRepository,
    provider,
    catalogProviders: providers,
    providerAccountRepository,
    providerDataRepository,
    learnerProfileRepository,
    logger,
    timezoneForLearner: async (authUserId) => {
      const profile =
        await learnerProfileRepository.findByAuthUserId(authUserId)
      return profile?.timezone ?? 'UTC'
    },
    memoryGenerationEnabled,
  })
  const coachService = new CoachService({
    repository: coachRepository,
    learnerProfileRepository,
    problemActionRepository,
    progressRepository,
    providerDataRepository,
    providerProfileRepository,
    bookmarkRepository,
    recommendationRepository,
    providers,
    progressService,
    aiMemoryClient,
    aiCoachClient,
    aiRoadmapNoteClient,
    logger,
    memoryGenerationEnabled,
    featureRouting: true,
    problemContent: async (provider, externalId) =>
      (await catalogService.getProblemContent(provider, externalId))?.content ??
      null,
    activityDigest: async (authUserId) => {
      const accounts =
        await providerAccountRepository.findAllByAuthUserId(authUserId)
      return accounts.length === 0
        ? null
        : learnerActivityService.get(authUserId)
    },
  })
  const mentorService = new MentorService({
    repository: new PrismaMentorRepository(prisma),
    aiMentorClient,
    aiMemoryClient,
    learnerProfile: (authUserId) =>
      learnerProfileRepository.findByAuthUserId(authUserId),
    roadmap: (authUserId) => coachService.getStoredRoadmap(authUserId),
    problemContent: async (provider, externalId) =>
      (await catalogService.getProblemContent(provider, externalId))?.content ??
      null,
    communitySolutions: (provider, externalId, language) =>
      catalogService.getCommunitySolutions(provider, externalId, language),
    contestProblems: (provider, contestCode, hint) =>
      catalogService.getContestProblems(provider, contestCode, hint),
    logger,
  })

  // No worker services poll the queues. Activity wakes a bounded drain
  // instead: the signed-in site through /api/jobs/pump, and requests that
  // just queued work. The drain runs after the response is sent, kept alive
  // by the platform (`after`), so it never delays the learner's request.
  const jobPump = new JobPump({
    memory: new MemoryWorker({
      repository: progressRepository,
      client: aiMemoryClient,
      aiCoachClient,
      coachRepository,
      learnerProfileRepository,
      recommendationRepository,
      learnerActivityRepository,
      logger,
    }),
    provider: new ProviderSyncWorker({
      activityService: learnerActivityService,
      repository: providerSyncRepository,
      providerAccountRepository,
      statsService: providerAccountStatsService,
      profileService: providerProfileService,
      dataRepository: providerDataRepository,
      activityFetchers: providerSyncActivityFetchers,
      logger,
    }),
    hasPendingOutboxJob: (scope) => progressRepository.hasPendingJob(scope),
    hasPendingProviderJob: (authUserId) =>
      providerSyncRepository.hasPendingJob(authUserId),
    logger,
  })
  const wakeJobs = (authUserId: string) => {
    after(() => jobPump.wake(authUserId))
  }
  // A wake per learner per second at most; the status read is cheap.
  const lastPumpAt = new Map<string, number>()

  // --- Learner helpers ------------------------------------------------------

  // New or removed provider data changes the summary the coach reads first;
  // a failure here must not fail the request that stored the data.
  const refreshLearnerActivity = async (authUserId: string) => {
    try {
      await learnerActivityService.refresh(authUserId)
    } catch (error) {
      logger.warn('learner_activity_refresh_failed', {
        errorCode: errorCode(error, 'LEARNER_ACTIVITY_REFRESH_FAILED'),
      })
    }
  }

  const persistMemoryInvalidation = async (authUserId: string) => {
    try {
      await progressRepository.enqueueJob({
        authUserId,
        jobType: 'recommendation_invalidation',
        evidenceType: 'memory_changed',
        idempotencyKey: `recommendation-invalidation:${authUserId}:${randomUUID()}`,
      })
    } catch {
      logger.warn('recommendation_invalidation_enqueue_failed', {
        errorCode: 'OUTBOX_UNAVAILABLE',
      })
    }
  }

  const publicLearnerMemory = (memory: AiMemoryRecord, ownerId?: string) => {
    if (ownerId !== undefined && memory.learnerId !== ownerId) {
      throw new AiMemoryClientError('AI_MEMORY_INVALID_RESPONSE')
    }
    return LearnerMemorySchema.parse({
      id: memory.id,
      category: memory.category,
      text: memory.statement,
      confidence: memory.confidence,
      status: memory.status,
      version: memory.version,
      ...(memory.supersedesMemoryId === undefined
        ? {}
        : { supersedesMemoryId: memory.supersedesMemoryId }),
      learnerCorrected: memory.learnerCorrected,
      evidenceCount: memory.evidenceIds.length,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
    })
  }

  const queueProviderHistoryMemoryDeletion = async (
    authUserId: string,
    provider: z.infer<typeof LinkableProviderSchema>,
  ): Promise<string[]> => {
    if (!memoryManagementEnabled) return []
    const [
      submissions,
      solvedProblems,
      actions,
      bookmarks,
      reflections,
      timers,
      batches,
    ] = await Promise.all([
      providerDataRepository.listSubmissions(authUserId, provider),
      providerDataRepository.listSolvedProblems(authUserId, provider),
      problemActionRepository.listByAuthUserId(authUserId),
      bookmarkRepository.listByAuthUserId(authUserId),
      progressRepository.listReflections(authUserId),
      progressRepository.listTimerSessions(authUserId),
      recommendationRepository.listBatchesByAuthUserId(authUserId),
    ])

    const externalIds = new Set<string>()
    const addReference = (candidate: {
      provider?: unknown
      externalId?: unknown
    }) => {
      if (
        candidate.provider === provider &&
        typeof candidate.externalId === 'string' &&
        candidate.externalId.length > 0
      ) {
        externalIds.add(candidate.externalId)
      }
    }

    submissions.forEach(addReference)
    solvedProblems.forEach(addReference)
    actions.forEach(addReference)
    bookmarks.forEach(addReference)
    reflections.forEach((reflection) => addReference(reflection.problem))
    timers.forEach((timer) => addReference(timer.problem))
    batches.forEach((batch) => batch.items.forEach(addReference))

    for (const externalId of externalIds) {
      const referenceDigest = createHash('sha256')
        .update(`${provider}:${externalId}`)
        .digest('hex')
        .slice(0, 32)
      try {
        await progressRepository.enqueueJob({
          authUserId,
          jobType: 'problem_data_deletion',
          evidenceType: 'provider_history_deleted',
          problemProvider: provider,
          problemExternalId: externalId,
          idempotencyKey: `delete-provider-history:${authUserId}:${provider}:${referenceDigest}`,
        })
      } catch {
        logger.warn('provider_history_memory_deletion_enqueue_failed', {
          errorCode: 'OUTBOX_UNAVAILABLE',
        })
        throw new ProgressOutboxUnavailableError()
      }
    }
    return [...externalIds]
  }

  const decorateProblemsForLearner = async (
    authUserId: string,
    problems: readonly ExternalProblemSummary[],
  ) => {
    const [actions, bookmarks] = await Promise.all([
      problemActionRepository.listByAuthUserId(authUserId),
      bookmarkRepository.listByAuthUserId(authUserId),
    ])
    const statuses = latestLearnerStatuses(actions)
    const bookmarked = new Set(
      bookmarks.map((item) => `${item.provider}:${item.externalId}`),
    )

    return problems.map((problem) => ({
      ...problem,
      learnerStatus:
        statuses.get(`${problem.provider}:${problem.externalId}`) ?? 'unsolved',
      bookmarked: bookmarked.has(`${problem.provider}:${problem.externalId}`),
    }))
  }

  const decorateRecommendationFeed = async (
    authUserId: string,
    feed: RecommendationFeedResponse,
  ): Promise<RecommendationFeedResponse> => {
    if (!progressEnabled || feed.data === null) return feed
    const decoratedProblems = await decorateProblemsForLearner(
      authUserId,
      feed.data.items.map((item) => item.problem),
    )
    return {
      ...feed,
      data: {
        ...feed.data,
        items: feed.data.items.map((item, index) => ({
          ...item,
          problem: decoratedProblems[index] ?? item.problem,
        })),
      },
    }
  }

  const recommendationFeedForLearner = async (
    authUserId: string,
    refresh: boolean,
    requestId: string,
    signal: AbortSignal,
  ) => {
    const feed = await recommendationService.getFeed(
      authUserId,
      refresh,
      requestId,
      signal,
    )
    return decorateRecommendationFeed(authUserId, feed)
  }

  const providerFreshness = () =>
    catalogService
      .getProviders()
      .data.flatMap((item) =>
        item.freshness === undefined ? [] : [item.freshness],
      )

  const providerStatsForProfile = async (authUserId: string) => {
    const [accounts, allAccounts, profileSnapshots] = await Promise.all([
      providerAccountRepository.findAllByAuthUserId(authUserId),
      providerAccountRepository.findAllIncludingDisconnectedByAuthUserId(
        authUserId,
      ),
      providerProfileService.latest(authUserId),
    ])
    const activeHandles = new Map(
      accounts.map((account) => [account.provider, account.externalHandle]),
    )
    const profiles = profileSnapshots.filter((profile) => {
      const provider = LinkableProviderSchema.safeParse(profile.provider)
      return (
        provider.success && activeHandles.get(provider.data) === profile.handle
      )
    })
    const profileByProvider = new Map(
      profiles.map((profile) => [profile.provider, profile]),
    )
    const providers = accounts.map((account) => {
      const profile = profileByProvider.get(account.provider)
      return {
        provider: account.provider,
        handle: account.externalHandle,
        ...(account.solvedCount === null && profile?.solvedCount === undefined
          ? {}
          : {
              solvedCount:
                account.solvedCount ?? profile?.solvedCount ?? undefined,
            }),
        ...(account.statsComplete === null
          ? profile?.completeness === undefined
            ? {}
            : { complete: profile.completeness === 'complete' }
          : { complete: account.statsComplete }),
        stale:
          account.statsErrorCode !== null || profile?.provenance.stale === true,
        ...(account.statsFetchedAt === null
          ? profile?.provenance.fetchedAt === undefined
            ? {}
            : { fetchedAt: profile.provenance.fetchedAt }
          : { fetchedAt: account.statsFetchedAt.toISOString() }),
        ...(profile?.rating === undefined ? {} : { rating: profile.rating }),
        ...(profile?.rank === undefined ? {} : { rank: profile.rank }),
        syncEnabled: account.syncEnabled,
      }
    })
    const solvedTotal = accounts.reduce(
      (sum, account) =>
        sum +
        (account.solvedCount ??
          profileByProvider.get(account.provider)?.solvedCount ??
          0),
      0,
    )
    const staleProviders = accounts
      .filter(
        (account) =>
          account.statsErrorCode !== null ||
          profileByProvider.get(account.provider)?.provenance.stale === true,
      )
      .map((account) => account.provider)
    const completeness =
      accounts.length === 0 ||
      accounts.some(
        (account) =>
          (account.solvedCount === null &&
            profileByProvider.get(account.provider)?.solvedCount ===
              undefined) ||
          (account.statsComplete !== true &&
            profileByProvider.get(account.provider)?.completeness !==
              'complete'),
      )
        ? 'partial'
        : 'complete'
    return {
      accounts,
      ...(allAccounts.length === accounts.length
        ? {}
        : {
            archivedAccounts: allAccounts.filter(
              (account) => !account.syncEnabled,
            ),
          }),
      providers,
      profiles,
      solvedTotal,
      staleProviders,
      completeness,
    }
  }

  return {
    logger,
    prisma,
    jwtVerifier,
    internalServiceToken,
    progressEnabled,
    memoryManagementEnabled,
    memoryGenerationEnabled,
    activeSessionSyncStaleMs,
    providers,
    problemMetadataCache,
    providerOwnershipCheckers,
    aiMemoryClient,
    aiUsageLimiter,
    avatarRepository,
    bookmarkRepository,
    learnerProfileRepository,
    problemActionRepository,
    progressRepository,
    providerAccountRepository,
    providerDataRepository,
    providerProfileRepository,
    recommendationRepository,
    catalogService,
    contestCatalogService,
    connectorService,
    learnerActivityService,
    coachLiveRefresh,
    recommendationService,
    providerAccountStatsService,
    providerActivityService,
    providerSyncService,
    providerProfileService,
    progressService,
    coachService,
    mentorService,
    jobPump,
    lastPumpAt,
    wakeJobs,
    refreshLearnerActivity,
    persistMemoryInvalidation,
    publicLearnerMemory,
    queueProviderHistoryMemoryDeletion,
    decorateProblemsForLearner,
    decorateRecommendationFeed,
    recommendationFeedForLearner,
    providerFreshness,
    providerStatsForProfile,
  }
}

export type ServerContext = ReturnType<typeof createServerContext>

// One context per process. The dev server reloads modules on every change,
// so the instance (and its database pool) is kept on globalThis there.
const globalForContext = globalThis as unknown as {
  algomemtorServerContext?: ServerContext
}

export function getServerContext(): ServerContext {
  globalForContext.algomemtorServerContext ??= createServerContext()
  return globalForContext.algomemtorServerContext
}
