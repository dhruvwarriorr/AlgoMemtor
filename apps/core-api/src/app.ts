import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'

import {
  ApiErrorResponseSchema,
  AiConsentResponseSchema,
  BookmarkResponseSchema,
  BookmarkQuerySchema,
  BookmarksResponseSchema,
  DeleteAllDataRequestSchema,
  DeleteAllDataResponseSchema,
  DeleteAllDataStatusResponseSchema,
  CorrectLearnerMemoryRequestSchema,
  DisconnectProviderAccountResponseSchema,
  ExternalProblemCatalogQueryParamsSchema,
  LearnerProfileResponseSchema,
  LearnerMemoriesResponseSchema,
  LearnerMemoryActionSchema,
  LearnerMemorySchema,
  ConnectorIngestRequestSchema,
  ConnectorClaimRequestSchema,
  ConnectorClaimResponseSchema,
  ConnectorIngestResponseSchema,
  ConnectorReportRequestSchema,
  ConnectorSecretSchema,
  ConnectorSessionResponseSchema,
  ConnectorTokenSchema,
  ConnectorTokensResponseSchema,
  CreateConnectorTokenRequestSchema,
  CreateConnectorTokenResponseSchema,
  RevokeConnectorTokenResponseSchema,
  isConnectorOnlyProvider,
  LearnerActivityDigestResponseSchema,
  LinkableProviderSchema,
  ProviderKeySchema,
  LinkProviderAccountRequestSchema,
  ProviderAccountResponseSchema,
  ProviderAccountsResponseSchema,
  RecommendationFeedbackInputSchema,
  RecommendationRestorationResponseSchema,
  RefreshProviderPublicStatsRequestSchema,
  ProviderActivitySyncResponseSchema,
  ProviderSyncRequestResponseSchema,
  ProviderSyncStatusResponseSchema,
  ProviderActivityResponseSchema,
  ExternalContestsResponseSchema,
  ExternalContestsQuerySchema,
  ProblemDetailResponseSchema,
  ProviderProfileResponseSchema,
  UnifiedAnalyticsSchema,
  UnifiedProfileResponseSchema,
  SetProviderActivityConsentRequestSchema,
  ResolveTimerRequestSchema,
  SaveAiConsentRequestSchema,
  SaveBookmarkRequestSchema,
  SaveReflectionRequestSchema,
  SaveLearnerProfileRequestSchema,
  SetProblemStatusRequestSchema,
  StartTimerRequestSchema,
  ProblemReferenceSchema,
  ProgressAnalyticsResponseSchema,
  ProgressAnalyticsQuerySchema,
  ProgressHistoryQuerySchema,
  ProgressHistoryResponseSchema,
  ProgressResponseSchema,
  ProblemReflectionResponseSchema,
  ProblemTimerResponseSchema,
  CoachConversationsResponseSchema,
  CoachConversationEnvelopeSchema,
  CoachConversationResponseSchema,
  CoachPreferencesResponseSchema,
  SaveCoachPreferencesRequestSchema,
  CoachCheckInsResponseSchema,
  CoachCheckInResponseSchema,
  CoachActionProposalResponseSchema,
  CoachCheckInActionRequestSchema,
  ImprovementRoadmapResponseSchema,
  RoadmapRefreshResponseSchema,
  SetCoachTopicStatusRequestSchema,
  CoachRoadmapNoteRequestSchema,
  CoachRoadmapNoteResponseSchema,
  CreateCoachConversationRequestSchema,
  SendCoachMessageRequestSchema,
  ConfirmCoachActionRequestSchema,
  CoachResponseSchema,
  languageFamilyCounts,
  programmingLanguageFamily,
  RecommendationSteeringListResponseSchema,
  RecommendationSteeringResponseSchema,
  SaveRecommendationSteeringRequestSchema,
  type RecommendationFeedResponse,
  type RecommendationSteering,
} from '@algomemtor/shared-contracts'
import type {
  ExternalProblemSummary,
  ProviderKey,
} from '@algomemtor/shared-contracts'
import cors from 'cors'
import {
  leetcodeIdForSlug,
  linkedProblemFromContent,
  providerProblemFromUrl,
} from './services/coach-links.js'
import {
  buildAnalyticsInsights,
  learnerDayKeyFormatter,
} from './services/analytics-insights.js'
import {
  AVATAR_MAX_BYTES,
  InMemoryAvatarRepository,
  avatarMimeTypes,
  detectAvatarMimeType,
  type AvatarRepository,
} from './repositories/avatar-repository.js'
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express'
import helmet from 'helmet'
import { z } from 'zod'

import {
  AiMemoryClientError,
  UnavailableAiMemoryClient,
  type AiMemoryClient,
  type AiMemoryRecord,
  type LearnerMemoryAction,
} from './integrations/ai/ai-memory-client.js'
import {
  type AiRecommendationClient,
  UnavailableAiRecommendationClient,
} from './integrations/ai/ai-recommendation-client.js'
import {
  type AiCoachClient,
  UnavailableAiCoachClient,
} from './integrations/ai/ai-coach-client.js'
import {
  type AiRoadmapNoteClient,
  UnavailableAiRoadmapNoteClient,
} from './integrations/ai/ai-roadmap-note-client.js'
import { requireAuth } from './auth/require-auth.js'
import type {
  SupabaseJwtVerifier,
  VerifiedAccessToken,
} from './auth/supabase-jwt.js'
import {
  readCodeforcesProviderConfig,
  readUnifiedProviderConfig,
} from './config/provider-config.js'
import { ProviderError } from './errors/provider-error.js'
import { CodeforcesProvider } from './integrations/codeforces/codeforces-provider.js'
import { CodeChefProvider } from './integrations/codechef/codechef-provider.js'
import { LeetCodeProvider } from './integrations/leetcode/leetcode-provider.js'
import { CsesProvider } from './integrations/cses/cses-provider.js'
import { CodeforcesContestProvider } from './integrations/codeforces/codeforces-contest-provider.js'
import { CodeChefContestProvider } from './integrations/codechef/codechef-contest-provider.js'
import { LeetCodeContestProvider } from './integrations/leetcode/leetcode-contest-provider.js'
import { CodeChefPublicStatsFetcher } from './integrations/provider-accounts/codechef-public-stats.js'
import { CodeforcesPublicStatsFetcher } from './integrations/provider-accounts/codeforces-public-stats.js'
import { LeetCodePublicStatsFetcher } from './integrations/provider-accounts/leetcode-public-stats.js'
import { CodeChefProfileFetcher } from './integrations/provider-accounts/codechef-profile.js'
import { CodeforcesProfileFetcher } from './integrations/provider-accounts/codeforces-profile.js'
import { LeetCodeProfileFetcher } from './integrations/provider-accounts/leetcode-profile.js'
import {
  ConnectorTokenLimitError,
  InMemoryConnectorTokenRepository,
  type ConnectorTokenRepository,
} from './repositories/connector-token-repository.js'
import {
  InMemoryLearnerActivityRepository,
  type LearnerActivityRepository,
} from './repositories/learner-activity-repository.js'
import { LearnerActivityService } from './services/learner-activity-service.js'
import { CoachLiveRefreshService } from './services/coach-live-refresh-service.js'
import { CodeChefActivityFetcher } from './integrations/provider-accounts/codechef-activity.js'
import { LeetCodeActivityFetcher } from './integrations/provider-accounts/leetcode-activity.js'
import {
  ConnectorAccountMismatchError,
  ConnectorAccountUnavailableError,
  ConnectorService,
} from './services/connector-service.js'
import {
  CodeChefOwnershipChecker,
  CodeforcesOwnershipChecker,
  LeetCodeOwnershipChecker,
  type ProviderOwnershipChecker,
} from './integrations/provider-accounts/provider-ownership.js'
import {
  ProviderPublicStatsError,
  type ProviderActivityDataFetcher,
  type ProviderProfileFetcher,
  type ProviderVerifiedActivityFetcher,
  type ProviderPublicStatsFetcher,
} from './integrations/provider-accounts/provider-public-stats.js'
import type { ProblemProvider } from './integrations/providers/problem-provider.js'
import type { ContestProvider } from './integrations/providers/contest-provider.js'
import type { ProblemMetadataCache } from './integrations/providers/problem-metadata-cache.js'
import {
  InMemoryLearnerProfileRepository,
  type LearnerProfileRepository,
} from './repositories/learner-profile-repository.js'
import {
  InMemoryBookmarkRepository,
  type BookmarkRepository,
} from './repositories/bookmark-repository.js'
import {
  InMemoryProblemActionRepository,
  type ProblemActionRepository,
} from './repositories/problem-action-repository.js'
import {
  ActiveTimerError,
  InMemoryProgressRepository,
  TimerResolutionRequiredError,
  TimerNotFoundError,
  type ProgressRepository,
} from './repositories/progress-repository.js'
import {
  InMemoryRecommendationRepository,
  RecommendationOwnershipError,
  type RecommendationRepository,
} from './repositories/recommendation-repository.js'
import {
  InMemoryRecommendationSteeringRepository,
  type RecommendationSteeringRecord,
  type RecommendationSteeringRepository,
} from './repositories/recommendation-steering-repository.js'
import {
  InMemoryProviderAccountRepository,
  ProviderAccountHandleClaimedError,
  type ProviderAccountRepository,
} from './repositories/provider-account-repository.js'
import {
  InMemoryProviderSyncRepository,
  type ProviderSyncRepository,
} from './repositories/provider-sync-repository.js'
import {
  InMemoryProviderProfileRepository,
  type ProviderProfileRepository,
} from './repositories/provider-profile-repository.js'
import {
  InMemoryProviderDataRepository,
  type ProviderDataRepository,
} from './repositories/provider-data-repository.js'
import {
  InMemoryCoachRepository,
  type CoachRepository,
} from './repositories/coach-repository.js'
import { ProblemCatalogService } from './services/problem-catalog-service.js'
import { ContestCatalogService } from './services/contest-catalog-service.js'
import {
  ProgressService,
  ProgressOutboxUnavailableError,
  ProgressValidationError,
} from './services/progress-service.js'
import {
  RecommendationNotFoundError,
  RecommendationService,
} from './services/recommendation-service.js'
import {
  ProviderAccountChangedError,
  ProviderAccountNotLinkedError,
  ProviderAccountStatsService,
} from './services/provider-account-stats-service.js'
import {
  ProviderActivityChangedError,
  ProviderActivityConsentRequiredError,
  ProviderActivityCooldownError,
  ProviderActivityNotLinkedError,
  ProviderActivityService,
} from './services/provider-activity-service.js'
import {
  ProviderSyncNotLinkedError,
  ProviderSyncService,
} from './services/provider-sync-service.js'
import { ProviderProfileService } from './services/provider-profile-service.js'
import {
  CoachConsentRequiredError,
  CoachConversationNotFoundError,
  CoachCheckInNotFoundError,
  CoachMemoryUnavailableError,
  CoachUnknownTopicError,
  CoachProposalNotFoundError,
  CoachProposalStateError,
  CoachService,
  COACH_POLICY_VERSION,
} from './services/coach-service.js'
import { serializeProviderAccount } from './services/provider-account-service.js'
import {
  structuredLogger,
  type StructuredLogger,
} from './utils/structured-logger.js'
import { RequestGate } from './utils/request-gate.js'
import {
  normalizeTopic,
  normalizeTopicCounts,
} from './utils/topic-normalization.js'

export type CreateAppOptions = {
  jwtVerifier?: SupabaseJwtVerifier
  avatarRepository?: AvatarRepository
  learnerProfileRepository?: LearnerProfileRepository
  problemActionRepository?: ProblemActionRepository
  progressRepository?: ProgressRepository
  bookmarkRepository?: BookmarkRepository
  recommendationRepository?: RecommendationRepository
  providerAccountRepository?: ProviderAccountRepository
  providerSyncRepository?: ProviderSyncRepository
  providerProfileRepository?: ProviderProfileRepository
  providerDataRepository?: ProviderDataRepository
  problemMetadataCache?: ProblemMetadataCache
  providerPublicStatsFetchers?: readonly ProviderPublicStatsFetcher[]
  providerProfileFetchers?: readonly ProviderProfileFetcher[]
  providerVerifiedActivityFetchers?: readonly ProviderVerifiedActivityFetcher[]
  providerOwnershipCheckers?: readonly ProviderOwnershipChecker[]
  connectorTokenRepository?: ConnectorTokenRepository
  learnerActivityRepository?: LearnerActivityRepository
  // Fetchers the coach's live refresh uses for a learner's newest data.
  providerActivityFetchers?: readonly ProviderActivityDataFetcher[]
  providerActivityMinRefreshIntervalMs?: number
  problemProvider?: ProblemProvider
  problemProviders?: readonly ProblemProvider[]
  contestProviders?: readonly ContestProvider[]
  logger?: StructuredLogger
  aiRecommendationClient?: AiRecommendationClient
  aiMemoryClient?: AiMemoryClient
  aiCoachClient?: AiCoachClient
  aiRoadmapNoteClient?: AiRoadmapNoteClient
  coachRepository?: CoachRepository
  recommendationSteeringRepository?: RecommendationSteeringRepository
  internalServiceToken?: string
  webOrigin?: string
}

const providerStatusCode = (error: ProviderError) => {
  if (error.code === 'PROVIDER_RATE_LIMITED') {
    return 429
  }

  if (error.code === 'PROVIDER_INVALID_RESPONSE') {
    return 502
  }

  return 503
}

const providerMessage = (error: ProviderError) => {
  const providerName =
    error.provider === 'codeforces'
      ? 'Codeforces'
      : error.provider === 'codechef'
        ? 'CodeChef'
        : error.provider === 'leetcode'
          ? 'LeetCode'
          : 'CSES'

  if (error.code === 'PROVIDER_RATE_LIMITED') {
    return `${providerName} is temporarily rate limiting catalog requests.`
  }

  if (error.code === 'PROVIDER_INVALID_RESPONSE') {
    return `${providerName} returned an invalid metadata response.`
  }

  if (error.code === 'PROVIDER_BLOCKED') {
    return `${providerName} blocked this public data request; cached data may be shown.`
  }

  if (error.code === 'PROVIDER_TIMEOUT') {
    return `${providerName} took too long to respond.`
  }

  return `${providerName} is temporarily unavailable.`
}

const respondWithProviderError = (error: unknown, response: Response) => {
  if (!(error instanceof ProviderError)) {
    return false
  }

  response.status(providerStatusCode(error)).json(
    createApiError(error.code, providerMessage(error), {
      retryable: error.retryable,
      details: { provider: error.provider },
    }),
  )
  return true
}

const respondWithMemoryError = (error: unknown, response: Response) => {
  if (!(error instanceof AiMemoryClientError)) return false
  const statusCode = error.code === 'AI_MEMORY_REJECTED' ? 409 : 503
  response
    .status(statusCode)
    .json(
      createApiError(
        error.code,
        statusCode === 409
          ? 'The learner memory could not be changed in its current state.'
          : 'Learner memory is temporarily unavailable.',
        { retryable: statusCode === 503 },
      ),
    )
  return true
}

const respondWithCoachError = (error: unknown, response: Response) => {
  if (error instanceof CoachConsentRequiredError) {
    response
      .status(403)
      .json(
        createApiError(
          error.code,
          'Enable personalized AI coaching in Settings before starting a coach conversation.',
        ),
      )
    return true
  }
  if (
    error instanceof CoachConversationNotFoundError ||
    error instanceof CoachProposalNotFoundError ||
    error instanceof CoachCheckInNotFoundError
  ) {
    response.status(404).json(createApiError(error.code, error.message))
    return true
  }
  if (error instanceof CoachProposalStateError) {
    response.status(409).json(createApiError(error.code, error.message))
    return true
  }
  if (error instanceof CoachMemoryUnavailableError) {
    response
      .status(503)
      .json(createApiError(error.code, error.message, { retryable: true }))
    return true
  }
  if (error instanceof CoachUnknownTopicError) {
    response.status(400).json(createApiError(error.code, error.message))
    return true
  }
  return false
}

// CSES accounts link only through the browser connector; routes that make the
// server read a provider profile reject it as an unsupported provider.
const ServerFetchedProviderSchema = LinkableProviderSchema.exclude(['cses'])

const createApiError = (
  code: string,
  message: string,
  options: { retryable?: boolean; details?: unknown } = {},
) =>
  ApiErrorResponseSchema.parse({
    error: {
      code,
      message,
      ...(options.retryable === undefined
        ? {}
        : { retryable: options.retryable }),
      ...(options.details === undefined ? {} : { details: options.details }),
    },
  })

const pathParam = (request: Request, name: string) => {
  const value = request.params[name]

  return typeof value === 'string' ? value : undefined
}

const pathProblemReference = (request: Request) =>
  ProblemReferenceSchema.safeParse({
    provider: pathParam(request, 'provider'),
    externalId: pathParam(request, 'externalId'),
  })

const recommendationItemIdSchema = z.uuid()
const recommendationExternalIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^\S+$/)

const defaultProvider = () => {
  const config = readCodeforcesProviderConfig()

  return new CodeforcesProvider({
    ...config,
    logger: structuredLogger,
  })
}

const defaultProviders = (): readonly ProblemProvider[] => {
  const config = readUnifiedProviderConfig()
  const codeforcesRequestGate = new RequestGate({
    minIntervalMs: config.codeforces.minRequestIntervalMs,
  })
  const csesRequestGate = new RequestGate({ minIntervalMs: 1000 })
  return [
    ...(config.enabled.codeforces && config.codeforces.catalogEnabled
      ? [
          new CodeforcesProvider({
            ...config.codeforces,
            cacheTtlMs: config.catalogCacheTtlMs,
            contentCacheTtlMs: config.contentCacheTtlMs,
            requestGate: codeforcesRequestGate,
            logger: structuredLogger,
          }),
        ]
      : []),
    ...(config.enabled.codechef && config.codechef.catalogEnabled
      ? [
          new CodeChefProvider({
            ...config.codechef,
            cacheTtlMs: config.catalogCacheTtlMs,
            contentCacheTtlMs: config.contentCacheTtlMs,
          }),
        ]
      : []),
    ...(config.enabled.leetcode && config.leetcode.catalogEnabled
      ? [
          new LeetCodeProvider({
            ...config.leetcode,
            cacheTtlMs: config.catalogCacheTtlMs,
            contentCacheTtlMs: config.contentCacheTtlMs,
          }),
        ]
      : []),
    new CsesProvider({
      cacheTtlMs: config.catalogCacheTtlMs,
      requestGate: csesRequestGate,
    }),
  ]
}

const defaultContestProviders = (): readonly ContestProvider[] => {
  const config = readUnifiedProviderConfig()
  return [
    ...(config.enabled.codeforces && config.codeforces.contestsEnabled
      ? [
          new CodeforcesContestProvider({
            ...config.codeforces,
            cacheTtlMs: config.contestCacheTtlMs,
          }),
        ]
      : []),
    ...(config.enabled.codechef && config.codechef.contestsEnabled
      ? [
          new CodeChefContestProvider({
            ...config.codechef,
            cacheTtlMs: config.contestCacheTtlMs,
          }),
        ]
      : []),
    ...(config.enabled.leetcode && config.leetcode.contestsEnabled
      ? [
          new LeetCodeContestProvider({
            endpoint: config.leetcode.baseUrl,
            cacheTtlMs: config.contestCacheTtlMs,
            timeoutMs: config.leetcode.timeoutMs,
            maxAttempts: config.leetcode.maxAttempts,
            minRequestIntervalMs: config.leetcode.minRequestIntervalMs,
          }),
        ]
      : []),
  ]
}

const defaultProviderPublicStatsFetchers = () => {
  const config = readUnifiedProviderConfig()
  return [
    ...(config.enabled.codeforces && config.codeforces.profileEnabled
      ? [new CodeforcesPublicStatsFetcher()]
      : []),
    ...(config.enabled.codechef && config.codechef.profileEnabled
      ? [new CodeChefPublicStatsFetcher()]
      : []),
    ...(config.enabled.leetcode && config.leetcode.profileEnabled
      ? [new LeetCodePublicStatsFetcher()]
      : []),
  ]
}

const defaultProviderOwnershipCheckers =
  (): readonly ProviderOwnershipChecker[] => {
    const config = readUnifiedProviderConfig()
    return [
      ...(config.enabled.codeforces && config.codeforces.profileEnabled
        ? [new CodeforcesOwnershipChecker()]
        : []),
      ...(config.enabled.codechef && config.codechef.profileEnabled
        ? [new CodeChefOwnershipChecker()]
        : []),
      ...(config.enabled.leetcode && config.leetcode.profileEnabled
        ? [new LeetCodeOwnershipChecker()]
        : []),
    ]
  }

// Unambiguous characters only (no 0/O or 1/I), so a code copied by hand into
// a profile field still matches.
const VERIFICATION_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const VERIFICATION_TTL_MS = 30 * 60 * 1000

const createVerificationCode = () =>
  `AM-${Array.from(
    { length: 8 },
    () => VERIFICATION_ALPHABET[randomInt(VERIFICATION_ALPHABET.length)],
  ).join('')}`

// Small budgets: a live refresh should answer within a coaching turn.
const defaultProviderActivityFetchers =
  (): readonly ProviderActivityDataFetcher[] => {
    const config = readUnifiedProviderConfig()
    return [
      ...(config.enabled.codeforces && config.codeforces.activityEnabled
        ? [
            new CodeforcesPublicStatsFetcher({
              baseUrl: config.codeforces.baseUrl,
              timeoutMs: config.codeforces.timeoutMs,
              maxAttempts: 1,
            }),
          ]
        : []),
      ...(config.enabled.codechef && config.codechef.activityEnabled
        ? [
            new CodeChefActivityFetcher({
              baseUrl: `${config.codechef.baseUrl.replace(/\/+$/, '')}/users/`,
              timeoutMs: config.codechef.timeoutMs,
              maxAttempts: 1,
              maxPages: 3,
            }),
          ]
        : []),
      ...(config.enabled.leetcode && config.leetcode.activityEnabled
        ? [
            new LeetCodeActivityFetcher({
              endpoint: config.leetcode.baseUrl,
              timeoutMs: config.leetcode.timeoutMs,
              maxAttempts: 1,
            }),
          ]
        : []),
    ]
  }

const defaultProviderVerifiedActivityFetchers = () => {
  const config = readUnifiedProviderConfig()
  return config.enabled.codeforces && config.codeforces.activityEnabled
    ? [new CodeforcesPublicStatsFetcher()]
    : []
}

const defaultProviderProfileFetchers =
  (): readonly ProviderProfileFetcher[] => {
    const config = readUnifiedProviderConfig()
    return [
      ...(config.enabled.codeforces && config.codeforces.profileEnabled
        ? [new CodeforcesProfileFetcher()]
        : []),
      ...(config.enabled.codechef && config.codechef.profileEnabled
        ? [new CodeChefProfileFetcher()]
        : []),
      ...(config.enabled.leetcode && config.leetcode.profileEnabled
        ? [new LeetCodeProfileFetcher()]
        : []),
    ]
  }

const latestLearnerStatuses = (
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

const publicStatsStatusCode = (error: ProviderPublicStatsError) => {
  if (error.code === 'PROVIDER_ACCOUNT_NOT_FOUND') {
    return 404
  }

  if (error.code === 'PROVIDER_RATE_LIMITED') {
    return 429
  }

  if (error.code === 'PROVIDER_INVALID_RESPONSE') {
    return 502
  }

  return 503
}

const publicStatsMessage = (error: ProviderPublicStatsError) => {
  const providerName =
    error.provider === 'codeforces'
      ? 'Codeforces'
      : error.provider === 'codechef'
        ? 'CodeChef'
        : error.provider === 'leetcode'
          ? 'LeetCode'
          : 'CSES'

  if (error.code === 'PROVIDER_ACCOUNT_NOT_FOUND') {
    return `No public ${providerName} profile was found for that handle.`
  }

  if (error.code === 'PROVIDER_RATE_LIMITED') {
    return `${providerName} is temporarily rate limiting profile requests.`
  }

  if (error.code === 'PROVIDER_INVALID_RESPONSE') {
    return `${providerName} changed or returned an invalid public profile response.`
  }

  if (error.code === 'PROVIDER_BLOCKED') {
    return `${providerName} blocked this public profile request; cached data may be shown.`
  }

  if (error.code === 'PROVIDER_TIMEOUT') {
    return `${providerName} took too long to return public profile data.`
  }

  return `${providerName} public profile data is temporarily unavailable.`
}

const denyUnconfiguredAuthentication: SupabaseJwtVerifier = async () => {
  throw new Error('Supabase JWT verification is not configured.')
}

const authenticatedSubject = (response: Response) =>
  (response.locals.auth as VerifiedAccessToken).subject

const abortSignalForResponse = (request: Request, response: Response) => {
  const controller = new AbortController()
  const abort = () => {
    if (!response.writableEnded) {
      controller.abort(new Error('The client disconnected.'))
    }
  }
  request.once('aborted', abort)
  response.once('close', abort)

  return {
    signal: controller.signal,
    detach: () => {
      request.off('aborted', abort)
      response.off('close', abort)
    },
  }
}

export const createApp = (options: CreateAppOptions = {}) => {
  const logger = options.logger ?? structuredLogger
  const providers =
    options.problemProviders ??
    (options.problemProvider === undefined
      ? defaultProviders()
      : [options.problemProvider])
  const provider = options.problemProvider ?? providers[0] ?? defaultProvider()
  const jwtVerifier = options.jwtVerifier ?? denyUnconfiguredAuthentication
  const requireAuthenticated = requireAuth(jwtVerifier)
  const catalogService = new ProblemCatalogService(providers)
  const contestCatalogService = new ContestCatalogService(
    options.contestProviders ?? defaultContestProviders(),
  )
  const learnerProfileRepository =
    options.learnerProfileRepository ?? new InMemoryLearnerProfileRepository()
  const providerAccountRepository =
    options.providerAccountRepository ?? new InMemoryProviderAccountRepository()
  const providerSyncRepository =
    options.providerSyncRepository ?? new InMemoryProviderSyncRepository()
  const providerProfileRepository =
    options.providerProfileRepository ?? new InMemoryProviderProfileRepository()
  const providerDataRepository =
    options.providerDataRepository ?? new InMemoryProviderDataRepository()
  const problemMetadataCache = options.problemMetadataCache
  const connectorService = new ConnectorService({
    accountRepository: providerAccountRepository,
    dataRepository: providerDataRepository,
    tokenRepository:
      options.connectorTokenRepository ??
      new InMemoryConnectorTokenRepository(),
    ...(problemMetadataCache === undefined ? {} : { problemMetadataCache }),
    logger,
  })
  const problemActionRepository =
    options.problemActionRepository ?? new InMemoryProblemActionRepository()
  const progressRepository =
    options.progressRepository ?? new InMemoryProgressRepository()
  const learnerActivityService = new LearnerActivityService({
    repository:
      options.learnerActivityRepository ??
      new InMemoryLearnerActivityRepository(),
    accountRepository: providerAccountRepository,
    dataRepository: providerDataRepository,
    profileRepository: providerProfileRepository,
    syncRepository: providerSyncRepository,
    ...(problemMetadataCache === undefined ? {} : { problemMetadataCache }),
    progressRepository,
    logger,
  })
  const coachLiveRefresh = new CoachLiveRefreshService({
    accountRepository: providerAccountRepository,
    dataRepository: providerDataRepository,
    syncRepository: providerSyncRepository,
    activityFetchers:
      options.providerActivityFetchers ?? defaultProviderActivityFetchers(),
    refreshDigest: async (authUserId) =>
      (await learnerActivityService.refresh(authUserId)).digest,
    logger,
  })
  // New or removed provider data changes the summary the coach reads first;
  // a failure here must not fail the request that stored the data.
  const refreshLearnerActivity = async (authUserId: string) => {
    try {
      await learnerActivityService.refresh(authUserId)
    } catch (error) {
      logger.warn('learner_activity_refresh_failed', {
        errorCode:
          error instanceof Error &&
          'code' in error &&
          typeof error.code === 'string'
            ? error.code
            : 'LEARNER_ACTIVITY_REFRESH_FAILED',
      })
    }
  }
  const bookmarkRepository =
    options.bookmarkRepository ?? new InMemoryBookmarkRepository()
  const avatarRepository =
    options.avatarRepository ?? new InMemoryAvatarRepository()
  const recommendationRepository =
    options.recommendationRepository ?? new InMemoryRecommendationRepository()
  const coachRepository =
    options.coachRepository ?? new InMemoryCoachRepository()
  const recommendationService = new RecommendationService({
    aiRecommendationClient:
      options.aiRecommendationClient ?? new UnavailableAiRecommendationClient(),
    provider,
    providers,
    learnerProfileRepository,
    problemActionRepository,
    providerDataRepository,
    coachRepository,
    progressRepository,
    recommendationRepository,
    steeringRepository:
      options.recommendationSteeringRepository ??
      new InMemoryRecommendationSteeringRepository(),
    logger,
    memoryGenerationEnabled: process.env.MEMORY_GENERATION_ENABLED !== 'false',
  })
  const providerPublicStatsFetchers =
    options.providerPublicStatsFetchers ?? defaultProviderPublicStatsFetchers()
  const providerOwnershipCheckers =
    options.providerOwnershipCheckers ?? defaultProviderOwnershipCheckers()
  const providerAccountStatsService = new ProviderAccountStatsService({
    repository: providerAccountRepository,
    fetchers: providerPublicStatsFetchers,
    logger,
  })
  const providerActivityService = new ProviderActivityService({
    repository: providerAccountRepository,
    actionRepository: problemActionRepository,
    fetchers:
      options.providerVerifiedActivityFetchers ??
      (options.providerPublicStatsFetchers === undefined
        ? defaultProviderVerifiedActivityFetchers()
        : (providerPublicStatsFetchers.filter(
            (fetcher) =>
              typeof (fetcher as { fetchVerifiedActivity?: unknown })
                .fetchVerifiedActivity === 'function',
          ) as unknown as readonly ProviderVerifiedActivityFetcher[])),
    ...(options.providerActivityMinRefreshIntervalMs === undefined
      ? {}
      : {
          minRefreshIntervalMs: options.providerActivityMinRefreshIntervalMs,
        }),
    logger,
  })
  const providerSyncService = new ProviderSyncService({
    repository: providerSyncRepository,
    providerAccountRepository,
  })
  const providerProfileService = new ProviderProfileService({
    accountRepository: providerAccountRepository,
    profileRepository: providerProfileRepository,
    fetchers:
      options.providerProfileFetchers ?? defaultProviderProfileFetchers(),
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
    memoryGenerationEnabled: process.env.MEMORY_GENERATION_ENABLED !== 'false',
  })
  const aiMemoryClient =
    options.aiMemoryClient ?? new UnavailableAiMemoryClient()
  const aiCoachClient = options.aiCoachClient ?? new UnavailableAiCoachClient()
  const aiRoadmapNoteClient =
    options.aiRoadmapNoteClient ?? new UnavailableAiRoadmapNoteClient()
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
    memoryGenerationEnabled: process.env.MEMORY_GENERATION_ENABLED !== 'false',
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
  const internalServiceToken =
    options.internalServiceToken ??
    process.env.INTERNAL_SERVICE_TOKEN?.trim() ??
    ''
  const requireInternalService = (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    const supplied = request.get('x-internal-service-token')
    const configured = Buffer.from(internalServiceToken)
    const candidate = Buffer.from(supplied ?? '')
    if (configured.length === 0) {
      response
        .status(503)
        .json(
          createApiError(
            'INTERNAL_SERVICE_NOT_CONFIGURED',
            'The internal service is not configured.',
          ),
        )
      return
    }
    if (
      candidate.length !== configured.length ||
      !timingSafeEqual(candidate, configured)
    ) {
      response
        .status(401)
        .json(
          createApiError(
            'INVALID_INTERNAL_SERVICE_TOKEN',
            'The internal service token is invalid.',
          ),
        )
      return
    }
    next()
  }
  const progressEnabled = process.env.PROGRESS_ENABLED !== 'false'
  const memoryManagementEnabled =
    process.env.MEMORY_GENERATION_ENABLED !== 'false' ||
    process.env.MEMORY_RAG_ENABLED !== 'false'

  const persistMemoryInvalidation = async (authUserId: string) => {
    try {
      await progressRepository.enqueueJob({
        authUserId,
        jobType: 'recommendation_invalidation',
        evidenceType: 'memory_changed',
        idempotencyKey: `recommendation-invalidation:${authUserId}:${randomUUID()}`,
      })
    } catch (error) {
      logger.warn('recommendation_invalidation_enqueue_failed', {
        errorCode: 'OUTBOX_UNAVAILABLE',
      })
      void error
    }
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

  const providerFreshness = () =>
    catalogService
      .getProviders()
      .data.flatMap((item) =>
        item.freshness === undefined ? [] : [item.freshness],
      )

  const providerStatsForProfile = async (authUserId: string) => {
    const [accounts, allAccounts, profileSnapshots] = await Promise.all([
      providerAccountRepository.findAllByAuthUserId(authUserId),
      providerAccountRepository.findAllIncludingDisconnectedByAuthUserId ===
      undefined
        ? providerAccountRepository.findAllByAuthUserId(authUserId)
        : providerAccountRepository.findAllIncludingDisconnectedByAuthUserId(
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

  const featureNotEnabled = (response: Response) => {
    response
      .status(404)
      .json(
        createApiError(
          'PROGRESS_DISABLED',
          'Learner progress is not enabled for this environment.',
        ),
      )
  }

  const readLearnerProblemReference = (
    request: Request,
    response: Response,
  ) => {
    const result = pathProblemReference(request)
    if (result.success) return result.data
    response
      .status(400)
      .json(
        createApiError(
          'INVALID_PROBLEM_REFERENCE',
          'The provider problem reference is invalid.',
          { details: result.error.issues },
        ),
      )
    return null
  }
  const app = express()

  app.use(helmet())
  // The browser connector calls these token-authenticated routes from its
  // extension origin (chrome-extension:// or moz-extension://). They accept
  // only a connector token, never cookies or a Supabase session.
  app.use(
    [
      '/api/connector/session',
      '/api/connector/ingest',
      '/api/connector/report',
      '/api/connector/claim',
    ],
    cors({
      origin: /^(chrome-extension|moz-extension):\/\/[a-z0-9-]+$/i,
      methods: ['GET', 'POST'],
      allowedHeaders: ['authorization', 'content-type'],
      credentials: false,
    }),
  )
  app.use(
    cors({
      origin:
        options.webOrigin ?? process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    }),
  )

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
  app.use(
    '/api/coach/conversations/:conversationId/messages',
    express.json({ limit: '12mb' }),
  )
  app.use(express.json({ limit: '1mb' }))
  app.use((request, response, next) => {
    const suppliedRequestId = request.header('x-request-id')
    const requestId =
      suppliedRequestId !== undefined &&
      /^[A-Za-z0-9_-]{1,100}$/.test(suppliedRequestId)
        ? suppliedRequestId
        : randomUUID()

    response.locals.requestId = requestId
    response.setHeader('x-request-id', requestId)
    next()
  })

  // Connector upload routes authenticate with a connector token instead of a
  // Supabase session (see `requireConnector`).
  const connectorTokenPaths = new Set([
    '/connector/session',
    '/connector/ingest',
    '/connector/report',
    '/connector/claim',
  ])
  app.use('/api', (request, response, next) => {
    if (connectorTokenPaths.has(request.path)) {
      next()
      return
    }
    requireAuthenticated(request, response, next)
  })
  app.use('/api', async (request, response, next) => {
    if (connectorTokenPaths.has(request.path)) {
      next()
      return
    }
    if (request.path === '/me/data' || request.path === '/me/data/status') {
      next()
      return
    }
    const hasPendingDeletion = await progressRepository.hasPendingDeletion?.(
      authenticatedSubject(response),
    )
    if (hasPendingDeletion === true) {
      response
        .status(409)
        .json(
          createApiError(
            'LEARNER_DATA_DELETION_PENDING',
            'Learner data is temporarily hidden while deletion finishes.',
            { retryable: true },
          ),
        )
      return
    }
    next()
  })

  app.get('/health', (_request, response) => {
    response.json({
      status: 'ok',
      service: 'core-api',
      providers: providers.map((item) => item.getHealth()),
    })
  })

  // Called by the AI service's coach when stored data is not enough to answer.
  app.post(
    '/internal/coach/live-refresh',
    requireInternalService,
    async (request, response) => {
      const input = z
        .object({ learnerId: z.uuid(), provider: LinkableProviderSchema })
        .strict()
        .safeParse(request.body ?? {})
      if (!input.success) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_COACH_LIVE_REFRESH',
              'The coach live refresh request is invalid.',
            ),
          )
        return
      }
      if (await progressRepository.hasPendingDeletion?.(input.data.learnerId)) {
        response
          .status(409)
          .json(
            createApiError(
              'LEARNER_DATA_DELETION_PENDING',
              'Learner data is temporarily hidden while deletion finishes.',
              { retryable: true },
            ),
          )
        return
      }
      response.json({
        data: await coachLiveRefresh.refresh(
          input.data.learnerId,
          input.data.provider,
        ),
      })
    },
  )

  // The coach agent opens a platform problem the learner mentioned (by link
  // or ID) through the same provider adapters as the problem detail page.
  app.post(
    '/internal/coach/problem-content',
    requireInternalService,
    async (request, response) => {
      const input = z
        .union([
          z.object({ url: z.string().trim().min(8).max(2_048) }).strict(),
          z
            .object({
              provider: ProviderKeySchema,
              externalId: z.string().trim().min(1).max(128),
            })
            .strict(),
        ])
        .safeParse(request.body ?? {})
      if (!input.success) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_COACH_PROBLEM_REFERENCE',
              'Send a platform problem link or a provider and problem ID.',
            ),
          )
        return
      }
      let provider: ProviderKey | undefined
      let externalId: string | undefined
      if ('url' in input.data) {
        const reference = providerProblemFromUrl(input.data.url)
        provider = reference?.provider
        externalId = reference?.externalId
        if (reference?.leetcodeSlug !== undefined) {
          externalId = leetcodeIdForSlug(
            reference.leetcodeSlug,
            (
              await Promise.all(
                providers
                  .filter((item) => item.key === 'leetcode')
                  .map((item) =>
                    item.search({}).then(
                      (result) => result.problems,
                      () => [],
                    ),
                  ),
              )
            ).flat(),
          )
        }
      } else {
        provider = input.data.provider
        externalId = input.data.externalId
      }
      if (provider === undefined || externalId === undefined) {
        response
          .status(404)
          .json(
            createApiError(
              'COACH_PROBLEM_NOT_FOUND',
              'That link is not a known platform problem.',
            ),
          )
        return
      }
      try {
        const result = await catalogService.getProblemContent(
          provider,
          externalId,
          response.locals.requestId as string,
        )
        if (result?.content === null || result?.content === undefined) {
          response
            .status(404)
            .json(
              createApiError(
                'COACH_PROBLEM_NOT_FOUND',
                'That problem statement is not available.',
              ),
            )
          return
        }
        response.json({ data: linkedProblemFromContent(result.content) })
      } catch (error) {
        if (!respondWithProviderError(error, response)) throw error
      }
    },
  )

  app.post(
    '/internal/coach/check-ins/refresh',
    requireInternalService,
    async (request, response) => {
      const input = z
        .object({ learnerId: z.uuid() })
        .strict()
        .safeParse(request.body ?? {})
      if (!input.success) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_COACH_CHECK_IN_REFRESH',
              'The coach check-in refresh request is invalid.',
            ),
          )
        return
      }
      if (await progressRepository.hasPendingDeletion?.(input.data.learnerId)) {
        response
          .status(409)
          .json(
            createApiError(
              'LEARNER_DATA_DELETION_PENDING',
              'Learner data is temporarily hidden while deletion finishes.',
              { retryable: true },
            ),
          )
        return
      }
      try {
        const created = await coachService.refreshCheckIns(input.data.learnerId)
        response.json({ created: created.length })
      } catch (error) {
        if (!respondWithCoachError(error, response)) throw error
      }
    },
  )

  app.get('/api/providers', requireAuthenticated, (_request, response) => {
    response.json(catalogService.getProviders())
  })

  app.get('/api/me', requireAuthenticated, (_request, response) => {
    response.json({
      user: {
        id: authenticatedSubject(response),
      },
    })
  })

  // Learner profile picture. The browser uploads a small, already-resized
  // image; the server re-checks the size and the real file signature.
  app.get(
    '/api/me/avatar',
    requireAuthenticated,
    async (_request, response) => {
      const avatar = await avatarRepository.findByAuthUserId(
        authenticatedSubject(response),
      )
      if (avatar === null) {
        response
          .status(404)
          .json(
            createApiError('AVATAR_NOT_FOUND', 'No profile picture is set.'),
          )
        return
      }
      response.setHeader('Content-Type', avatar.mimeType)
      response.setHeader('Cache-Control', 'private, no-cache')
      response.setHeader('X-Content-Type-Options', 'nosniff')
      response.setHeader('Last-Modified', avatar.updatedAt.toUTCString())
      response.send(avatar.data)
    },
  )

  app.put(
    '/api/me/avatar',
    requireAuthenticated,
    express.raw({ type: [...avatarMimeTypes], limit: AVATAR_MAX_BYTES }),
    async (request, response) => {
      const body: unknown = request.body
      const data = Buffer.isBuffer(body) ? body : null
      const detected = data === null ? null : detectAvatarMimeType(data)
      if (
        data === null ||
        data.length === 0 ||
        detected === null ||
        detected !== request.header('content-type')?.split(';')[0]?.trim()
      ) {
        response
          .status(415)
          .json(
            createApiError(
              'AVATAR_INVALID_IMAGE',
              'Upload a WebP, JPEG or PNG image.',
            ),
          )
        return
      }
      const saved = await avatarRepository.saveByAuthUserId(
        authenticatedSubject(response),
        { mimeType: detected, data },
      )
      response.json({
        data: {
          mimeType: saved.mimeType,
          byteSize: saved.data.length,
          updatedAt: saved.updatedAt.toISOString(),
        },
      })
    },
  )

  app.delete(
    '/api/me/avatar',
    requireAuthenticated,
    async (_request, response) => {
      await avatarRepository.deleteByAuthUserId(authenticatedSubject(response))
      response.status(204).end()
    },
  )

  app.get(
    '/api/learner-profile',
    requireAuthenticated,
    async (_request, response) => {
      const profile = await learnerProfileRepository.findByAuthUserId(
        authenticatedSubject(response),
      )

      response.json(LearnerProfileResponseSchema.parse({ data: profile }))
    },
  )

  app.put(
    '/api/learner-profile',
    requireAuthenticated,
    async (request, response) => {
      const profileResult = SaveLearnerProfileRequestSchema.safeParse(
        request.body,
      )

      if (!profileResult.success) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_LEARNER_PROFILE',
              'The learner profile is invalid.',
              { details: profileResult.error.issues },
            ),
          )
        return
      }

      const authUserId = authenticatedSubject(response)
      const previousProfile =
        await learnerProfileRepository.findByAuthUserId(authUserId)
      const profile = await learnerProfileRepository.upsertByAuthUserId(
        authUserId,
        profileResult.data,
      )
      if (
        (profile.recommendationPreference !== undefined ||
          previousProfile !== null) &&
        process.env.MEMORY_GENERATION_ENABLED !== 'false'
      ) {
        try {
          const preferenceHash = createHash('sha256')
            .update(profile.recommendationPreference ?? 'empty')
            .digest('hex')
            .slice(0, 32)
          const profileChangeId = randomUUID().replaceAll('-', '')
          await progressRepository.enqueueJob({
            authUserId,
            jobType: 'memory_generation',
            evidenceType: 'profile_preference',
            evidenceId: randomUUID(),
            idempotencyKey: `memory:profile_preference:${authUserId}:${preferenceHash}:${profileChangeId}`,
          })
        } catch {
          logger.warn('memory_outbox_enqueue_failed', {
            evidenceType: 'profile_preference',
            errorCode: 'OUTBOX_UNAVAILABLE',
          })
          throw new ProgressOutboxUnavailableError()
        }
      }

      response.json(LearnerProfileResponseSchema.parse({ data: profile }))
    },
  )

  app.get(
    '/api/provider-accounts',
    requireAuthenticated,
    async (_request, response) => {
      const accounts = await providerAccountRepository.findAllByAuthUserId(
        authenticatedSubject(response),
      )

      response.json(
        ProviderAccountsResponseSchema.parse({
          data: accounts.map(serializeProviderAccount),
        }),
      )
    },
  )

  app.put(
    '/api/provider-accounts/:provider',
    requireAuthenticated,
    async (request, response) => {
      const providerResult = ServerFetchedProviderSchema.safeParse(
        request.params.provider,
      )
      const accountResult = LinkProviderAccountRequestSchema.safeParse(
        request.body,
      )

      if (isConnectorOnlyProvider(String(request.params.provider))) {
        response
          .status(400)
          .json(
            createApiError(
              'CONNECTOR_ONLY_PROVIDER',
              'Connect this provider with the AlgoMemtor browser connector.',
            ),
          )
        return
      }

      if (!providerResult.success) {
        response
          .status(400)
          .json(
            createApiError(
              'UNSUPPORTED_LINK_PROVIDER',
              'That provider cannot be linked.',
            ),
          )
        return
      }

      if (!accountResult.success) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_PROVIDER_ACCOUNT',
              'The provider account link is invalid or consent is missing.',
              { details: accountResult.error.issues },
            ),
          )
        return
      }

      const authUserId = authenticatedSubject(response)
      let account
      try {
        account = await providerAccountRepository.upsertByAuthUserId(
          authUserId,
          providerResult.data,
          accountResult.data.handle,
        )
      } catch (error) {
        if (error instanceof ProviderAccountHandleClaimedError) {
          response
            .status(409)
            .json(
              createApiError(
                'PROVIDER_HANDLE_ALREADY_LINKED',
                'That public provider handle is already linked to another learner.',
              ),
            )
          return
        }
        throw error
      }

      try {
        await providerSyncService.requestInitialSync(
          authUserId,
          providerResult.data,
        )
      } catch (error) {
        logger.warn('provider_initial_sync_enqueue_failed', {
          provider: providerResult.data,
          errorCode:
            error instanceof Error &&
            'code' in error &&
            typeof error.code === 'string'
              ? error.code
              : 'PROVIDER_SYNC_ENQUEUE_FAILED',
        })
      }

      response.json(
        ProviderAccountResponseSchema.parse({
          data: serializeProviderAccount(account),
        }),
      )
    },
  )

  app.post(
    '/api/provider-accounts/:provider/verification',
    requireAuthenticated,
    async (request, response) => {
      const providerResult = ServerFetchedProviderSchema.safeParse(
        request.params.provider,
      )
      if (!providerResult.success) {
        response
          .status(400)
          .json(
            createApiError(
              'UNSUPPORTED_LINK_PROVIDER',
              'That provider cannot be verified.',
            ),
          )
        return
      }
      const authUserId = authenticatedSubject(response)
      const account =
        await providerAccountRepository.findByAuthUserIdAndProvider(
          authUserId,
          providerResult.data,
        )
      if (account === null) {
        response
          .status(404)
          .json(
            createApiError(
              'PROVIDER_ACCOUNT_NOT_LINKED',
              'Link this provider account before verifying it.',
            ),
          )
        return
      }
      if (account.verificationStatus === 'verified') {
        response.json(
          ProviderAccountResponseSchema.parse({
            data: serializeProviderAccount(account),
          }),
        )
        return
      }
      const updated = await providerAccountRepository.startVerification(
        authUserId,
        providerResult.data,
        account.externalHandle,
        {
          code: createVerificationCode(),
          expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
        },
      )
      if (updated === null) {
        response
          .status(409)
          .json(
            createApiError(
              'PROVIDER_ACCOUNT_CHANGED',
              'The linked handle changed. Refresh and try again.',
            ),
          )
        return
      }
      response.json(
        ProviderAccountResponseSchema.parse({
          data: serializeProviderAccount(updated),
        }),
      )
    },
  )

  app.post(
    '/api/provider-accounts/:provider/verification/check',
    requireAuthenticated,
    async (request, response) => {
      const providerResult = ServerFetchedProviderSchema.safeParse(
        request.params.provider,
      )
      if (!providerResult.success) {
        response
          .status(400)
          .json(
            createApiError(
              'UNSUPPORTED_LINK_PROVIDER',
              'That provider cannot be verified.',
            ),
          )
        return
      }
      const provider = providerResult.data
      const authUserId = authenticatedSubject(response)
      const account =
        await providerAccountRepository.findByAuthUserIdAndProvider(
          authUserId,
          provider,
        )
      if (account === null) {
        response
          .status(404)
          .json(
            createApiError(
              'PROVIDER_ACCOUNT_NOT_LINKED',
              'Link this provider account before verifying it.',
            ),
          )
        return
      }
      if (account.verificationStatus === 'verified') {
        response.json(
          ProviderAccountResponseSchema.parse({
            data: serializeProviderAccount(account),
          }),
        )
        return
      }
      const challenge = account.verificationChallenge
      const now = new Date()
      if (challenge === null || challenge.expiresAt <= now) {
        response
          .status(409)
          .json(
            createApiError(
              'PROVIDER_VERIFICATION_EXPIRED',
              'This verification code has expired. Start again to get a new code.',
            ),
          )
        return
      }
      const checker = providerOwnershipCheckers.find(
        (candidate) => candidate.provider === provider,
      )
      if (checker === undefined) {
        response
          .status(503)
          .json(
            createApiError(
              'PROVIDER_VERIFICATION_UNAVAILABLE',
              'Ownership verification is not available for this provider.',
              { retryable: false },
            ),
          )
        return
      }
      let found: boolean
      try {
        found = await checker.profileContainsCode(
          account.externalHandle,
          challenge.code,
        )
      } catch (error) {
        logger.warn('provider_verification_check_failed', {
          provider,
          errorCode:
            error instanceof ProviderError
              ? error.code
              : 'PROVIDER_UNAVAILABLE',
        })
        response
          .status(503)
          .json(
            createApiError(
              'PROVIDER_VERIFICATION_UNAVAILABLE',
              'The provider profile could not be read right now. Try again in a minute.',
              { retryable: true },
            ),
          )
        return
      }
      logger.info('provider_verification_checked', { provider, found })
      if (!found) {
        response
          .status(422)
          .json(
            createApiError(
              'PROVIDER_VERIFICATION_CODE_NOT_FOUND',
              'The code is not on your public profile yet. Save the profile change, wait a minute, then check again.',
              { retryable: true },
            ),
          )
        return
      }
      const verified = await providerAccountRepository.completeVerification(
        authUserId,
        provider,
        account.externalHandle,
        challenge.code,
        now,
      )
      if (verified === null) {
        response
          .status(409)
          .json(
            createApiError(
              'PROVIDER_VERIFICATION_EXPIRED',
              'This verification code has expired. Start again to get a new code.',
            ),
          )
        return
      }
      response.json(
        ProviderAccountResponseSchema.parse({
          data: serializeProviderAccount(verified),
        }),
      )
    },
  )

  app.get(
    '/api/me/activity-digest',
    requireAuthenticated,
    async (_request, response) => {
      const authUserId = authenticatedSubject(response)
      const accounts =
        await providerAccountRepository.findAllByAuthUserId(authUserId)
      response.json(
        LearnerActivityDigestResponseSchema.parse({
          data:
            accounts.length === 0
              ? null
              : await learnerActivityService.get(authUserId),
        }),
      )
    },
  )

  const serializeConnectorToken = (token: {
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

  app.get(
    '/api/connector/tokens',
    requireAuthenticated,
    async (_request, response) => {
      const tokens = await connectorService.listTokens(
        authenticatedSubject(response),
      )
      response.json(
        ConnectorTokensResponseSchema.parse({
          data: tokens.map(serializeConnectorToken),
        }),
      )
    },
  )

  app.post(
    '/api/connector/tokens',
    requireAuthenticated,
    async (request, response) => {
      const body = CreateConnectorTokenRequestSchema.safeParse(request.body)
      if (!body.success) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_CONNECTOR_TOKEN_REQUEST',
              'Give the connector a short name.',
              { details: body.error.issues },
            ),
          )
        return
      }
      try {
        const { token, secret } = await connectorService.createToken(
          authenticatedSubject(response),
          body.data.label,
        )
        response.status(201).json(
          CreateConnectorTokenResponseSchema.parse({
            data: { token: serializeConnectorToken(token), secret },
          }),
        )
      } catch (error) {
        if (error instanceof ConnectorTokenLimitError) {
          response.status(409).json(createApiError(error.code, error.message))
          return
        }
        throw error
      }
    },
  )

  app.delete(
    '/api/connector/tokens/:id',
    requireAuthenticated,
    async (request, response) => {
      const id = String(request.params.id)
      const revoked =
        /^[0-9a-f-]{36}$/i.test(id) &&
        (await connectorService.revokeToken(authenticatedSubject(response), id))
      if (!revoked) {
        response
          .status(404)
          .json(
            createApiError(
              'CONNECTOR_TOKEN_NOT_FOUND',
              'That connector is not active.',
            ),
          )
        return
      }
      response.json(RevokeConnectorTokenResponseSchema.parse({ data: { id } }))
    },
  )

  // Browser-connector routes authenticate with a connector token instead of a
  // Supabase session. The token can only read its own link state and upload.
  const requireConnector: express.RequestHandler = (
    request,
    response,
    next,
  ) => {
    const header = request.get('authorization') ?? ''
    const secret = ConnectorSecretSchema.safeParse(
      /^Bearer\s+(\S+)$/i.exec(header)?.[1],
    )
    const reject = () => {
      response
        .status(401)
        .set('WWW-Authenticate', 'Bearer')
        .json(
          createApiError(
            'CONNECTOR_UNAUTHORIZED',
            'This connector is not paired or was revoked. Pair it again from your AlgoMemtor profile.',
          ),
        )
    }
    if (!secret.success) {
      reject()
      return
    }
    connectorService.authenticate(secret.data).then(
      async (token) => {
        if (token === null) {
          reject()
          return
        }
        if (
          (await progressRepository.hasPendingDeletion?.(token.authUserId)) ===
          true
        ) {
          response
            .status(409)
            .json(
              createApiError(
                'LEARNER_DATA_DELETION_PENDING',
                'Learner data is temporarily hidden while deletion finishes.',
                { retryable: true },
              ),
            )
          return
        }
        response.locals.connectorToken = token
        next()
      },
      (error: unknown) => {
        next(error)
      },
    )
  }

  const connectorToken = (response: express.Response) => {
    const token: unknown = response.locals.connectorToken
    if (
      typeof token !== 'object' ||
      token === null ||
      !('authUserId' in token) ||
      typeof token.authUserId !== 'string' ||
      !('label' in token) ||
      typeof token.label !== 'string'
    ) {
      throw new Error('Connector authentication did not run.')
    }
    return { authUserId: token.authUserId, label: token.label }
  }

  app.get(
    '/api/connector/session',
    requireConnector,
    async (_request, response) => {
      const token = connectorToken(response)
      response.json(
        ConnectorSessionResponseSchema.parse({
          data: {
            tokenLabel: token.label,
            accounts: await connectorService.linkedAccounts(token.authUserId),
          },
        }),
      )
    },
  )

  app.post(
    '/api/connector/claim',
    requireConnector,
    async (request, response) => {
      const body = ConnectorClaimRequestSchema.safeParse(request.body)
      if (!body.success) {
        response
          .status(400)
          .json(
            createApiError('INVALID_CONNECTOR_CLAIM', 'The claim is invalid.'),
          )
        return
      }
      const authUserId = connectorToken(response).authUserId
      try {
        const { account, newlyLinked } = await connectorService.claim(
          authUserId,
          body.data,
        )
        let syncQueued = true
        if (newlyLinked) {
          await providerSyncService.requestInitialSync(
            authUserId,
            body.data.provider,
          )
        } else {
          if (account.publicStatsConsentAt === null) {
            await providerAccountRepository.grantPublicStatsConsent(
              authUserId,
              body.data.provider,
              account.externalHandle,
              new Date(),
            )
          }
          const sync = await providerSyncService.requestManualSync(
            authUserId,
            body.data.provider,
          )
          syncQueued = sync.data.accepted
        }
        response.json(
          ConnectorClaimResponseSchema.parse({
            data: {
              provider: body.data.provider,
              handle: account.externalHandle,
              verified: account.verificationStatus === 'verified',
              syncQueued,
            },
          }),
        )
      } catch (error) {
        if (
          error instanceof ConnectorAccountMismatchError ||
          error instanceof ConnectorAccountUnavailableError
        ) {
          response.status(409).json(createApiError(error.code, error.message))
          return
        }
        if (error instanceof ProviderAccountHandleClaimedError) {
          response
            .status(409)
            .json(
              createApiError(
                'PROVIDER_HANDLE_ALREADY_LINKED',
                'That account is already linked to another AlgoMemtor learner.',
              ),
            )
          return
        }
        throw error
      }
    },
  )

  app.post('/api/connector/report', requireConnector, (request, response) => {
    const body = ConnectorReportRequestSchema.safeParse(request.body)
    if (!body.success) {
      response
        .status(400)
        .json(
          createApiError('INVALID_CONNECTOR_REPORT', 'The report is invalid.'),
        )
      return
    }
    const log = body.data.status === 'synced' ? logger.info : logger.warn
    log.call(logger, 'connector_sync_reported', {
      provider: body.data.provider,
      status: body.data.status,
      detail: body.data.message.replace(/[^\w .,:;()/'-]/g, '').slice(0, 300),
    })
    response.status(204).end()
  })

  app.post(
    '/api/connector/ingest',
    requireConnector,
    async (request, response) => {
      const body = ConnectorIngestRequestSchema.safeParse(request.body)
      if (!body.success) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_CONNECTOR_UPLOAD',
              'The connector upload is invalid.',
              { details: body.error.issues.slice(0, 20) },
            ),
          )
        return
      }
      try {
        const authUserId = connectorToken(response).authUserId
        const result = await connectorService.ingest(authUserId, body.data)
        await refreshLearnerActivity(authUserId)
        response.json(ConnectorIngestResponseSchema.parse({ data: result }))
      } catch (error) {
        if (
          error instanceof ConnectorAccountMismatchError ||
          error instanceof ConnectorAccountUnavailableError
        ) {
          response.status(409).json(createApiError(error.code, error.message))
          return
        }
        if (error instanceof ProviderAccountHandleClaimedError) {
          response
            .status(409)
            .json(
              createApiError(
                'PROVIDER_HANDLE_ALREADY_LINKED',
                'That account is already linked to another AlgoMemtor learner.',
              ),
            )
          return
        }
        throw error
      }
    },
  )

  app.delete(
    '/api/provider-accounts/:provider',
    requireAuthenticated,
    async (request, response) => {
      const providerResult = LinkableProviderSchema.safeParse(
        request.params.provider,
      )

      if (!providerResult.success) {
        response
          .status(400)
          .json(
            createApiError(
              'UNSUPPORTED_LINK_PROVIDER',
              'That provider cannot be disconnected.',
            ),
          )
        return
      }

      if (providerAccountRepository.disconnectByAuthUserId !== undefined) {
        await providerAccountRepository.disconnectByAuthUserId(
          authenticatedSubject(response),
          providerResult.data,
        )
      } else {
        await providerAccountRepository.deleteByAuthUserId(
          authenticatedSubject(response),
          providerResult.data,
        )
      }
      response.json(
        DisconnectProviderAccountResponseSchema.parse({
          data: { provider: providerResult.data },
        }),
      )
    },
  )

  app.post(
    '/api/provider-accounts/:provider/sync',
    requireAuthenticated,
    async (request, response) => {
      const providerResult = ServerFetchedProviderSchema.safeParse(
        request.params.provider,
      )
      if (!providerResult.success) {
        response
          .status(400)
          .json(
            createApiError(
              'UNSUPPORTED_LINK_PROVIDER',
              'That provider cannot be synchronized.',
            ),
          )
        return
      }
      try {
        const account =
          await providerAccountRepository.findByAuthUserIdAndProvider(
            authenticatedSubject(response),
            providerResult.data,
          )
        if (account !== null && account.publicStatsConsentAt === null) {
          await providerAccountRepository.grantPublicStatsConsent(
            authenticatedSubject(response),
            providerResult.data,
            account.externalHandle,
            new Date(),
          )
        }
        const result = await providerSyncService.requestManualSync(
          authenticatedSubject(response),
          providerResult.data,
        )
        response
          .status(202)
          .json(ProviderSyncRequestResponseSchema.parse(result))
      } catch (error) {
        if (error instanceof ProviderSyncNotLinkedError) {
          response
            .status(404)
            .json(
              createApiError(
                'PROVIDER_ACCOUNT_NOT_LINKED',
                'Link this provider account before requesting synchronization.',
              ),
            )
          return
        }
        throw error
      }
    },
  )

  app.get(
    '/api/provider-accounts/:provider/sync-status',
    requireAuthenticated,
    async (request, response) => {
      const providerResult = LinkableProviderSchema.safeParse(
        request.params.provider,
      )
      if (!providerResult.success) {
        response
          .status(400)
          .json(
            createApiError(
              'UNSUPPORTED_LINK_PROVIDER',
              'That provider does not have a synchronization status.',
            ),
          )
        return
      }
      response.json(
        ProviderSyncStatusResponseSchema.parse(
          await providerSyncService.status(
            authenticatedSubject(response),
            providerResult.data,
          ),
        ),
      )
    },
  )

  app.delete(
    '/api/provider-accounts/:provider/history',
    requireAuthenticated,
    async (request, response) => {
      const providerResult = LinkableProviderSchema.safeParse(
        request.params.provider,
      )
      if (!providerResult.success) {
        response
          .status(400)
          .json(
            createApiError(
              'UNSUPPORTED_LINK_PROVIDER',
              'That provider does not have deletable history.',
            ),
          )
        return
      }
      const authUserId = authenticatedSubject(response)
      let deletedExternalIds: string[]
      try {
        deletedExternalIds = await queueProviderHistoryMemoryDeletion(
          authUserId,
          providerResult.data,
        )
      } catch (error) {
        if (error instanceof ProgressOutboxUnavailableError) {
          response
            .status(503)
            .json(
              createApiError(
                'OUTBOX_UNAVAILABLE',
                'Provider history deletion is temporarily unavailable. Try again shortly.',
                { retryable: true },
              ),
            )
          return
        }
        throw error
      }
      await providerSyncService.deleteHistory(authUserId, providerResult.data)
      await providerAccountRepository.deleteHistoryByAuthUserId?.(
        authUserId,
        providerResult.data,
      )
      await providerProfileRepository.deleteByAuthUserId(
        authUserId,
        providerResult.data,
      )
      await providerDataRepository.deleteByAuthUserId(
        authUserId,
        providerResult.data,
      )
      await problemActionRepository.deleteProviderVerifiedByAuthUserId?.(
        authUserId,
        providerResult.data,
      )
      for (const externalId of deletedExternalIds) {
        await recommendationRepository.deleteFeedbackByProblem?.(
          authUserId,
          providerResult.data,
          externalId,
        )
      }
      await refreshLearnerActivity(authUserId)
      response.status(204).send()
    },
  )

  app.post(
    '/api/provider-accounts/:provider/profile/refresh',
    requireAuthenticated,
    async (request, response) => {
      const providerResult = ServerFetchedProviderSchema.safeParse(
        request.params.provider,
      )
      if (!providerResult.success) {
        response
          .status(400)
          .json(
            createApiError(
              'UNSUPPORTED_LINK_PROVIDER',
              'That provider cannot supply a public profile.',
            ),
          )
        return
      }
      try {
        const profile = await providerProfileService.refresh(
          authenticatedSubject(response),
          providerResult.data,
        )
        response.json(ProviderProfileResponseSchema.parse({ data: profile }))
      } catch (error) {
        if (error instanceof ProviderPublicStatsError) {
          response.status(publicStatsStatusCode(error)).json(
            createApiError(error.code, publicStatsMessage(error), {
              retryable: error.retryable,
              details: { provider: error.provider },
            }),
          )
          return
        }
        if (error instanceof ProviderError) {
          response.status(providerStatusCode(error)).json(
            createApiError(error.code, providerMessage(error), {
              retryable: error.retryable,
              details: { provider: error.provider },
            }),
          )
          return
        }
        throw error
      }
    },
  )

  app.post(
    '/api/provider-accounts/:provider/public-stats/refresh',
    requireAuthenticated,
    async (request, response) => {
      const providerResult = ServerFetchedProviderSchema.safeParse(
        request.params.provider,
      )
      const consentResult = RefreshProviderPublicStatsRequestSchema.safeParse(
        request.body,
      )

      if (!providerResult.success) {
        response
          .status(400)
          .json(
            createApiError(
              'UNSUPPORTED_LINK_PROVIDER',
              'That provider cannot supply public solved-count data.',
            ),
          )
        return
      }

      const linkedAccount =
        await providerAccountRepository.findByAuthUserIdAndProvider(
          authenticatedSubject(response),
          providerResult.data,
        )
      const hasLongLivedConsent =
        linkedAccount !== null &&
        linkedAccount !== undefined &&
        linkedAccount.publicStatsConsentAt !== null
      const consentValue =
        request.body !== null && typeof request.body === 'object'
          ? (request.body as { consent?: unknown }).consent
          : undefined
      const explicitConsentFailure =
        consentValue !== undefined && consentValue !== true
      const consentIssues = consentResult.success
        ? []
        : consentResult.error.issues
      if (
        explicitConsentFailure ||
        (!consentResult.success && !hasLongLivedConsent)
      ) {
        response
          .status(400)
          .json(
            createApiError(
              'PUBLIC_STATS_CONSENT_REQUIRED',
              'Explicit consent is required before public solved-count data is fetched and stored.',
              { details: consentIssues },
            ),
          )
        return
      }

      try {
        const account = await providerAccountStatsService.refresh(
          authenticatedSubject(response),
          providerResult.data,
        )
        response.json(
          ProviderAccountResponseSchema.parse({
            data: serializeProviderAccount(account),
          }),
        )
      } catch (error) {
        if (error instanceof ProviderAccountNotLinkedError) {
          response
            .status(404)
            .json(
              createApiError(
                'PROVIDER_ACCOUNT_NOT_LINKED',
                'Link this provider account before refreshing its public statistics.',
              ),
            )
          return
        }

        if (error instanceof ProviderAccountChangedError) {
          response
            .status(409)
            .json(
              createApiError(
                'PROVIDER_ACCOUNT_CHANGED',
                'The linked handle changed during the refresh. Try again.',
                { retryable: true },
              ),
            )
          return
        }

        if (error instanceof ProviderPublicStatsError) {
          response.status(publicStatsStatusCode(error)).json(
            createApiError(error.code, publicStatsMessage(error), {
              retryable: error.retryable,
              details: { provider: error.provider },
            }),
          )
          return
        }

        throw error
      }
    },
  )

  app.put(
    '/api/provider-accounts/:provider/activity-consent',
    requireAuthenticated,
    async (request, response) => {
      const providerResult = ServerFetchedProviderSchema.safeParse(
        request.params.provider,
      )
      const consentResult = SetProviderActivityConsentRequestSchema.safeParse(
        request.body,
      )
      if (!providerResult.success) {
        response
          .status(400)
          .json(
            createApiError(
              'UNSUPPORTED_LINK_PROVIDER',
              'That provider cannot supply verified activity.',
            ),
          )
        return
      }
      if (providerResult.data !== 'codeforces') {
        response
          .status(400)
          .json(
            createApiError(
              'UNSUPPORTED_ACTIVITY_PROVIDER',
              'Only Codeforces public activity can be enabled in this phase.',
            ),
          )
        return
      }
      if (!consentResult.success) {
        response
          .status(400)
          .json(
            createApiError(
              'PROVIDER_ACTIVITY_CONSENT_REQUIRED',
              'The Codeforces public-activity policy must be accepted explicitly.',
              { details: consentResult.error.issues },
            ),
          )
        return
      }
      const account = await providerActivityService.setConsent(
        authenticatedSubject(response),
        providerResult.data,
        consentResult.data.enabled,
      )
      if (account === null) {
        response
          .status(404)
          .json(
            createApiError(
              'PROVIDER_ACCOUNT_NOT_LINKED',
              'Link this Codeforces account before changing activity consent.',
            ),
          )
        return
      }
      response.json(
        ProviderAccountResponseSchema.parse({
          data: serializeProviderAccount(account),
        }),
      )
    },
  )

  app.post(
    '/api/provider-accounts/:provider/activity-sync',
    requireAuthenticated,
    async (request, response) => {
      const providerResult = ServerFetchedProviderSchema.safeParse(
        request.params.provider,
      )
      if (!providerResult.success || providerResult.data !== 'codeforces') {
        response
          .status(400)
          .json(
            createApiError(
              'UNSUPPORTED_ACTIVITY_PROVIDER',
              'Only Codeforces public activity can be synchronized in this phase.',
            ),
          )
        return
      }
      try {
        const result = await providerActivityService.sync(
          authenticatedSubject(response),
          providerResult.data,
        )
        response.json(
          ProviderActivitySyncResponseSchema.parse({
            data: {
              provider: result.provider,
              discovered: result.discovered,
              added: result.added,
              confirmedSolved: result.confirmedSolved,
              complete: result.complete,
              syncedAt: result.syncedAt.toISOString(),
              nextAllowedAt: result.nextAllowedAt.toISOString(),
            },
          }),
        )
      } catch (error) {
        if (error instanceof ProviderActivityNotLinkedError) {
          response
            .status(404)
            .json(
              createApiError(
                'PROVIDER_ACCOUNT_NOT_LINKED',
                'Link this Codeforces account before synchronizing activity.',
              ),
            )
          return
        }
        if (error instanceof ProviderActivityConsentRequiredError) {
          response
            .status(400)
            .json(
              createApiError(
                'PROVIDER_ACTIVITY_CONSENT_REQUIRED',
                'Enable Codeforces public activity consent before synchronizing.',
              ),
            )
          return
        }
        if (error instanceof ProviderActivityCooldownError) {
          response.status(429).json(
            createApiError(
              'PROVIDER_ACTIVITY_COOLDOWN',
              'Codeforces activity was synchronized too recently.',
              {
                retryable: true,
                details: { retryAfter: error.retryAfter.toISOString() },
              },
            ),
          )
          return
        }
        if (error instanceof ProviderActivityChangedError) {
          response
            .status(409)
            .json(
              createApiError(
                'PROVIDER_ACCOUNT_CHANGED',
                'The linked Codeforces handle changed during synchronization. Try again.',
                { retryable: true },
              ),
            )
          return
        }
        if (error instanceof ProviderPublicStatsError) {
          response.status(publicStatsStatusCode(error)).json(
            createApiError(error.code, publicStatsMessage(error), {
              retryable: error.retryable,
              details: { provider: error.provider },
            }),
          )
          return
        }
        throw error
      }
    },
  )

  app.get(
    '/api/problems/:provider/:externalId/progress',
    requireAuthenticated,
    async (request, response) => {
      if (!progressEnabled) {
        featureNotEnabled(response)
        return
      }
      const reference = readLearnerProblemReference(request, response)
      if (reference === null) return
      response.json(
        await progressService.getProgress(
          authenticatedSubject(response),
          reference,
        ),
      )
    },
  )

  app.put(
    '/api/problems/:provider/:externalId/status',
    requireAuthenticated,
    async (request, response) => {
      if (!progressEnabled) {
        featureNotEnabled(response)
        return
      }
      const reference = readLearnerProblemReference(request, response)
      if (reference === null) return
      const input = SetProblemStatusRequestSchema.safeParse(request.body)
      if (!input.success) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_PROBLEM_STATUS',
              'The learner problem status is invalid.',
              { details: input.error.issues },
            ),
          )
        return
      }
      if (input.data.recommendationItemId !== undefined) {
        const item = await recommendationRepository.findItemByAuthUserId(
          authenticatedSubject(response),
          input.data.recommendationItemId,
        )
        if (
          item === null ||
          item.provider !== reference.provider ||
          item.externalId !== reference.externalId
        ) {
          response
            .status(404)
            .json(
              createApiError(
                'RECOMMENDATION_ITEM_NOT_FOUND',
                'The recommendation item could not be found for this learner.',
              ),
            )
          return
        }
      }
      await progressService.setStatus(
        authenticatedSubject(response),
        reference,
        input.data,
      )
      response.json(
        await progressService.getProgress(
          authenticatedSubject(response),
          reference,
        ),
      )
    },
  )

  app.delete(
    '/api/problems/:provider/:externalId/progress',
    requireAuthenticated,
    async (request, response) => {
      if (!progressEnabled) {
        featureNotEnabled(response)
        return
      }
      const reference = readLearnerProblemReference(request, response)
      if (reference === null) return
      await progressService.deleteProblem(
        authenticatedSubject(response),
        reference,
      )
      response.status(204).send()
    },
  )

  app.post(
    '/api/problems/:provider/:externalId/reflections',
    requireAuthenticated,
    async (request, response) => {
      if (!progressEnabled) {
        featureNotEnabled(response)
        return
      }
      const reference = readLearnerProblemReference(request, response)
      if (reference === null) return
      const input = SaveReflectionRequestSchema.safeParse(request.body)
      if (!input.success) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_PROBLEM_REFLECTION',
              'The problem reflection is invalid.',
              { details: input.error.issues },
            ),
          )
        return
      }
      try {
        const reflection = await progressService.saveReflection(
          authenticatedSubject(response),
          reference,
          input.data,
        )
        response.json(
          ProblemReflectionResponseSchema.parse({ data: reflection }),
        )
      } catch (error) {
        if (error instanceof ProgressValidationError) {
          response
            .status(400)
            .json(createApiError('INVALID_PROBLEM_REFLECTION', error.message))
          return
        }
        throw error
      }
    },
  )

  app.post(
    '/api/problems/:provider/:externalId/timer',
    requireAuthenticated,
    async (request, response) => {
      if (!progressEnabled) {
        featureNotEnabled(response)
        return
      }
      const reference = readLearnerProblemReference(request, response)
      if (reference === null) return
      const input = StartTimerRequestSchema.safeParse(request.body ?? {})
      if (!input.success) {
        response.status(400).json(
          createApiError(
            'INVALID_TIMER_REQUEST',
            'The timer request is invalid.',
            {
              details: input.error.issues,
            },
          ),
        )
        return
      }
      try {
        const result = await progressService.startTimer(
          authenticatedSubject(response),
          reference,
          input.data.confirmSwitch,
        )
        response.json(
          ProblemTimerResponseSchema.parse({ data: result.session }),
        )
      } catch (error) {
        if (error instanceof TimerResolutionRequiredError) {
          response
            .status(409)
            .json(
              createApiError(
                'TIMER_RESOLUTION_REQUIRED',
                'Save or discard the capped timer before starting another one.',
                { details: { activeTimer: error.activeTimer } },
              ),
            )
          return
        }
        if (error instanceof ActiveTimerError) {
          response
            .status(409)
            .json(
              createApiError(
                'TIMER_ALREADY_RUNNING',
                'Another timer is already running. Confirm to pause it and start this timer.',
                { details: { activeTimer: error.activeTimer } },
              ),
            )
          return
        }
        throw error
      }
    },
  )

  const timerAction =
    (action: 'pause' | 'resume' | 'complete' | 'discard') =>
    async (request: Request, response: Response) => {
      if (!progressEnabled) {
        featureNotEnabled(response)
        return
      }
      const sessionId = pathParam(request, 'sessionId')
      if (sessionId === undefined || !z.uuid().safeParse(sessionId).success) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_TIMER_SESSION',
              'The timer session ID is invalid.',
            ),
          )
        return
      }
      try {
        const session = await progressService.timerAction(
          authenticatedSubject(response),
          sessionId,
          action,
        )
        response.json(ProblemTimerResponseSchema.parse({ data: session }))
      } catch (error) {
        if (error instanceof ActiveTimerError) {
          response
            .status(409)
            .json(
              createApiError(
                'TIMER_ALREADY_RUNNING',
                'Another timer is already running. Pause it before resuming this timer.',
                { details: { activeTimer: error.activeTimer } },
              ),
            )
          return
        }
        if (error instanceof TimerNotFoundError) {
          response
            .status(404)
            .json(
              createApiError(
                'TIMER_NOT_FOUND',
                'The timer session could not be found.',
              ),
            )
          return
        }
        throw error
      }
    }

  app.post(
    '/api/timers/:sessionId/pause',
    requireAuthenticated,
    timerAction('pause'),
  )
  app.post(
    '/api/timers/:sessionId/resume',
    requireAuthenticated,
    timerAction('resume'),
  )
  app.post(
    '/api/timers/:sessionId/resolve',
    requireAuthenticated,
    async (request, response) => {
      const input = ResolveTimerRequestSchema.safeParse(request.body)
      if (!input.success) {
        response.status(400).json(
          createApiError(
            'INVALID_TIMER_RESOLUTION',
            'The timer resolution is invalid.',
            {
              details: input.error.issues,
            },
          ),
        )
        return
      }
      await timerAction(
        input.data.resolution === 'complete' ? 'complete' : 'discard',
      )(request, response)
    },
  )

  app.get(
    '/api/progress/history',
    requireAuthenticated,
    async (request, response) => {
      if (!progressEnabled) {
        featureNotEnabled(response)
        return
      }
      const query = ProgressHistoryQuerySchema.safeParse(request.query)
      if (!query.success) {
        response.status(400).json(
          createApiError(
            'INVALID_PROGRESS_QUERY',
            'The progress history query is invalid.',
            {
              details: query.error.issues,
            },
          ),
        )
        return
      }
      response.json(
        ProgressHistoryResponseSchema.parse(
          await progressService.history(
            authenticatedSubject(response),
            query.data,
          ),
        ),
      )
    },
  )

  app.get(
    '/api/progress/analytics',
    requireAuthenticated,
    async (request, response) => {
      if (!progressEnabled) {
        featureNotEnabled(response)
        return
      }
      const query = ProgressAnalyticsQuerySchema.safeParse(request.query)
      if (!query.success) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_PROGRESS_ANALYTICS_QUERY',
              'The progress analytics range is invalid.',
              { details: query.error.issues },
            ),
          )
        return
      }
      try {
        response.json(
          ProgressAnalyticsResponseSchema.parse(
            await progressService.analytics(
              authenticatedSubject(response),
              query.data.days,
            ),
          ),
        )
      } catch (error) {
        if (!respondWithProviderError(error, response)) throw error
      }
    },
  )

  app.get('/api/bookmarks', requireAuthenticated, async (request, response) => {
    if (!progressEnabled) {
      featureNotEnabled(response)
      return
    }
    const query = BookmarkQuerySchema.safeParse(request.query)
    if (!query.success) {
      response.status(400).json(
        createApiError(
          'INVALID_BOOKMARK_QUERY',
          'The bookmark query is invalid.',
          {
            details: query.error.issues,
          },
        ),
      )
      return
    }
    try {
      response.json(
        BookmarksResponseSchema.parse(
          await progressService.listBookmarks(
            authenticatedSubject(response),
            query.data,
          ),
        ),
      )
    } catch (error) {
      if (!respondWithProviderError(error, response)) throw error
    }
  })

  app.post(
    '/api/bookmarks',
    requireAuthenticated,
    async (request, response) => {
      if (!progressEnabled) {
        featureNotEnabled(response)
        return
      }
      const input = SaveBookmarkRequestSchema.safeParse(request.body)
      if (!input.success) {
        response.status(400).json(
          createApiError(
            'INVALID_BOOKMARK',
            'The bookmark reference is invalid.',
            {
              details: input.error.issues,
            },
          ),
        )
        return
      }
      try {
        response.json(
          BookmarkResponseSchema.parse({
            data: await progressService.saveBookmark(
              authenticatedSubject(response),
              input.data,
            ),
          }),
        )
      } catch (error) {
        if (!respondWithProviderError(error, response)) throw error
      }
    },
  )

  app.delete(
    '/api/bookmarks/:provider/:externalId',
    requireAuthenticated,
    async (request, response) => {
      if (!progressEnabled) {
        featureNotEnabled(response)
        return
      }
      const reference = readLearnerProblemReference(request, response)
      if (reference === null) return
      await progressService.removeBookmark(
        authenticatedSubject(response),
        reference,
      )
      response.status(204).send()
    },
  )

  app.post(
    '/api/recommendation-items/:itemId/impression',
    requireAuthenticated,
    async (request, response) => {
      if (!progressEnabled) {
        featureNotEnabled(response)
        return
      }
      const itemId = pathParam(request, 'itemId')
      if (
        itemId === undefined ||
        !recommendationItemIdSchema.safeParse(itemId).success
      ) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_RECOMMENDATION_ITEM',
              'The recommendation item ID is invalid.',
            ),
          )
        return
      }
      const item = await recommendationRepository.findItemByAuthUserId(
        authenticatedSubject(response),
        itemId,
      )
      if (item === null) {
        response
          .status(404)
          .json(
            createApiError(
              'RECOMMENDATION_ITEM_NOT_FOUND',
              'The recommendation item could not be found for this learner.',
            ),
          )
        return
      }
      const action = await progressService.recordAction(
        authenticatedSubject(response),
        { provider: item.provider, externalId: item.externalId },
        'impression',
        { recommendationItemId: item.id, sourceContext: 'recommendation' },
      )
      response
        .status(201)
        .json({ data: { recorded: true, actionId: action.id } })
    },
  )

  app.get(
    '/api/learner-memories',
    requireAuthenticated,
    async (_request, response) => {
      if (!progressEnabled || !memoryManagementEnabled) {
        featureNotEnabled(response)
        return
      }
      try {
        const ownerId = authenticatedSubject(response)
        const [records, pendingJobs] = await Promise.all([
          aiMemoryClient.listMemories(ownerId),
          progressRepository.pendingJobCount?.(ownerId) ?? Promise.resolve(0),
        ])
        response.json(
          LearnerMemoriesResponseSchema.parse({
            data: records.map((record) => publicLearnerMemory(record, ownerId)),
            meta: { pendingJobs },
          }),
        )
      } catch (error) {
        if (!respondWithMemoryError(error, response)) throw error
      }
    },
  )

  app.get(
    '/api/coach/conversations',
    requireAuthenticated,
    async (_request, response) => {
      try {
        response.json(
          CoachConversationsResponseSchema.parse({
            data: await coachService.listConversations(
              authenticatedSubject(response),
            ),
          }),
        )
      } catch (error) {
        if (!respondWithCoachError(error, response)) throw error
      }
    },
  )

  app.post(
    '/api/coach/conversations',
    requireAuthenticated,
    async (request, response) => {
      const input = CreateCoachConversationRequestSchema.safeParse(
        request.body ?? {},
      )
      if (!input.success) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_COACH_CONVERSATION',
              'The coaching conversation input is invalid.',
              { details: input.error.issues },
            ),
          )
        return
      }
      try {
        response.status(201).json(
          CoachConversationEnvelopeSchema.parse({
            data: await coachService.createConversation(
              authenticatedSubject(response),
              input.data,
            ),
          }),
        )
      } catch (error) {
        if (!respondWithCoachError(error, response)) throw error
      }
    },
  )

  app.get(
    '/api/coach/conversations/:conversationId',
    requireAuthenticated,
    async (request, response) => {
      const conversationId = pathParam(request, 'conversationId')
      if (
        conversationId === undefined ||
        !z.uuid().safeParse(conversationId).success
      ) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_COACH_CONVERSATION',
              'The coaching conversation ID is invalid.',
            ),
          )
        return
      }
      try {
        response.json(
          await coachService.getConversation(
            authenticatedSubject(response),
            conversationId,
          ),
        )
      } catch (error) {
        if (!respondWithCoachError(error, response)) throw error
      }
    },
  )

  app.patch(
    '/api/coach/conversations/:conversationId',
    requireAuthenticated,
    async (request, response) => {
      const conversationId = pathParam(request, 'conversationId')
      const input = z
        .object({ title: z.string().trim().min(1).max(120) })
        .strict()
        .safeParse(request.body ?? {})
      if (
        conversationId === undefined ||
        !z.uuid().safeParse(conversationId).success ||
        !input.success
      ) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_COACH_CONVERSATION',
              'The coaching conversation update is invalid.',
            ),
          )
        return
      }
      try {
        response.json(
          CoachConversationEnvelopeSchema.parse({
            data: await coachService.renameConversation(
              authenticatedSubject(response),
              conversationId,
              input.data.title,
            ),
          }),
        )
      } catch (error) {
        if (!respondWithCoachError(error, response)) throw error
      }
    },
  )

  app.delete(
    '/api/coach/conversations/:conversationId',
    requireAuthenticated,
    async (request, response) => {
      const conversationId = pathParam(request, 'conversationId')
      if (
        conversationId === undefined ||
        !z.uuid().safeParse(conversationId).success
      ) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_COACH_CONVERSATION',
              'The coaching conversation ID is invalid.',
            ),
          )
        return
      }
      try {
        await coachService.deleteConversation(
          authenticatedSubject(response),
          conversationId,
        )
        response.status(204).send()
      } catch (error) {
        if (!respondWithCoachError(error, response)) throw error
      }
    },
  )

  app.post(
    '/api/coach/conversations/:conversationId/messages',
    requireAuthenticated,
    async (request, response) => {
      const conversationId = pathParam(request, 'conversationId')
      const input = SendCoachMessageRequestSchema.safeParse(request.body ?? {})
      if (
        conversationId === undefined ||
        !z.uuid().safeParse(conversationId).success ||
        !input.success
      ) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_COACH_MESSAGE',
              'The coaching message is invalid.',
              { details: input.success ? undefined : input.error.issues },
            ),
          )
        return
      }
      try {
        response.json(
          await coachService.sendMessage(
            authenticatedSubject(response),
            conversationId,
            input.data,
          ),
        )
      } catch (error) {
        if (!respondWithCoachError(error, response)) throw error
      }
    },
  )

  app.get(
    '/api/coach/roadmap',
    requireAuthenticated,
    async (_request, response) => {
      try {
        response.json(
          ImprovementRoadmapResponseSchema.parse({
            data: await coachService.getRoadmap(authenticatedSubject(response)),
          }),
        )
      } catch (error) {
        if (!respondWithCoachError(error, response)) throw error
      }
    },
  )

  // Pull the newest data from every linked platform, then rebuild the plan.
  // Each platform refresh is bounded and rate-limited by the live refresh
  // service; one failing platform never fails the whole refresh.
  app.post(
    '/api/coach/roadmap/refresh',
    requireAuthenticated,
    async (_request, response) => {
      const userId = authenticatedSubject(response)
      try {
        if (await progressRepository.hasPendingDeletion?.(userId)) {
          response
            .status(409)
            .json(
              createApiError(
                'LEARNER_DATA_DELETION_PENDING',
                'Learner data is temporarily hidden while deletion finishes.',
                { retryable: true },
              ),
            )
          return
        }
        const accounts =
          await providerAccountRepository.findAllByAuthUserId(userId)
        const platforms = await Promise.all(
          accounts.map(async (account) => {
            try {
              const result = await coachLiveRefresh.refresh(
                userId,
                account.provider,
              )
              return {
                provider: account.provider,
                status:
                  result.status === 'not_linked'
                    ? ('unavailable' as const)
                    : result.status,
              }
            } catch {
              return {
                provider: account.provider,
                status: 'unavailable' as const,
              }
            }
          }),
        )
        const roadmap = await coachService.refreshRoadmap(userId)
        // New evidence and focus should reach the next recommendation batch.
        recommendationService.invalidateForLearner(userId)
        response.json(
          RoadmapRefreshResponseSchema.parse({
            data: roadmap,
            meta: { platforms },
          }),
        )
      } catch (error) {
        if (!respondWithCoachError(error, response)) throw error
      }
    },
  )

  app.patch(
    '/api/coach/roadmap/topics/:topic/status',
    requireAuthenticated,
    async (request, response) => {
      const topic = pathParam(request, 'topic')
      const input = SetCoachTopicStatusRequestSchema.safeParse(
        request.body ?? {},
      )
      if (topic === undefined || !input.success) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_COACH_TOPIC_STATUS',
              'The roadmap topic status is invalid.',
              { details: input.success ? undefined : input.error.issues },
            ),
          )
        return
      }
      try {
        response.json(
          ImprovementRoadmapResponseSchema.parse({
            data: await coachService.setTopicStatus(
              authenticatedSubject(response),
              topic,
              input.data.status,
            ),
          }),
        )
      } catch (error) {
        if (!respondWithCoachError(error, response)) throw error
      }
    },
  )

  app.post(
    '/api/coach/roadmap/notes',
    requireAuthenticated,
    async (request, response) => {
      const input = CoachRoadmapNoteRequestSchema.safeParse(request.body ?? {})
      if (!input.success) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_COACH_ROADMAP_NOTE',
              'The roadmap note is invalid.',
              { details: input.error.issues },
            ),
          )
        return
      }
      try {
        response.json(
          CoachRoadmapNoteResponseSchema.parse({
            data: await coachService.submitRoadmapNote(
              authenticatedSubject(response),
              input.data.note,
            ),
          }),
        )
      } catch (error) {
        if (!respondWithCoachError(error, response)) throw error
      }
    },
  )

  app.get(
    '/api/coach/preferences',
    requireAuthenticated,
    async (_request, response) => {
      response.json(
        CoachPreferencesResponseSchema.parse({
          data: await coachService.getPreferences(
            authenticatedSubject(response),
          ),
        }),
      )
    },
  )

  app.put(
    '/api/coach/preferences',
    requireAuthenticated,
    async (request, response) => {
      const input = SaveCoachPreferencesRequestSchema.safeParse(
        request.body ?? {},
      )
      if (!input.success) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_COACH_PREFERENCES',
              'The coaching preferences are invalid.',
              { details: input.error.issues },
            ),
          )
        return
      }
      response.json(
        CoachPreferencesResponseSchema.parse({
          data: await coachService.savePreferences(
            authenticatedSubject(response),
            input.data,
          ),
        }),
      )
    },
  )

  app.get(
    '/api/coach/check-ins',
    requireAuthenticated,
    async (_request, response) => {
      try {
        const data = await coachService.listCheckIns(
          authenticatedSubject(response),
        )
        response.json(
          CoachCheckInsResponseSchema.parse({
            data,
            meta: {
              unread: data.filter((item) => !item.read && !item.dismissed)
                .length,
            },
          }),
        )
      } catch (error) {
        if (!respondWithCoachError(error, response)) throw error
      }
    },
  )

  app.patch(
    '/api/coach/check-ins/:checkInId',
    requireAuthenticated,
    async (request, response) => {
      const checkInId = pathParam(request, 'checkInId')
      const input = CoachCheckInActionRequestSchema.safeParse(
        request.body ?? {},
      )
      if (
        checkInId === undefined ||
        !z.uuid().safeParse(checkInId).success ||
        !input.success
      ) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_COACH_CHECK_IN',
              'The coaching check-in update is invalid.',
            ),
          )
        return
      }
      try {
        response.json(
          CoachCheckInResponseSchema.parse({
            data: await coachService.markCheckIn(
              authenticatedSubject(response),
              checkInId,
              input.data,
            ),
          }),
        )
      } catch (error) {
        if (!respondWithCoachError(error, response)) throw error
      }
    },
  )

  app.post(
    '/api/coach/action-proposals/:proposalId/confirm',
    requireAuthenticated,
    async (request, response) => {
      const proposalId = pathParam(request, 'proposalId')
      const input = ConfirmCoachActionRequestSchema.safeParse(
        request.body ?? {},
      )
      if (
        proposalId === undefined ||
        !z.uuid().safeParse(proposalId).success ||
        !input.success
      ) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_COACH_PROPOSAL',
              'The coaching action confirmation is invalid.',
            ),
          )
        return
      }
      try {
        response.json(
          CoachActionProposalResponseSchema.parse({
            data: await coachService.confirmProposal(
              authenticatedSubject(response),
              proposalId,
            ),
          }),
        )
      } catch (error) {
        if (!respondWithCoachError(error, response)) throw error
      }
    },
  )

  app.patch(
    '/api/learner-memories/:memoryId',
    requireAuthenticated,
    async (request, response) => {
      if (!progressEnabled || !memoryManagementEnabled) {
        featureNotEnabled(response)
        return
      }
      const memoryId = pathParam(request, 'memoryId')
      if (memoryId === undefined || !z.uuid().safeParse(memoryId).success) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_MEMORY',
              'The learner memory ID is invalid.',
            ),
          )
        return
      }
      const input = CorrectLearnerMemoryRequestSchema.safeParse(request.body)
      if (!input.success) {
        response.status(400).json(
          createApiError(
            'INVALID_MEMORY_CORRECTION',
            'The learner memory correction is invalid.',
            {
              details: input.error.issues,
            },
          ),
        )
        return
      }
      try {
        const ownerId = authenticatedSubject(response)
        const result = await aiMemoryClient.correctMemory(
          ownerId,
          memoryId,
          input.data,
        )
        recommendationService.invalidateForLearner(ownerId)
        await persistMemoryInvalidation(ownerId)
        response.json({
          data:
            result.memory === undefined
              ? null
              : publicLearnerMemory(result.memory, ownerId),
        })
      } catch (error) {
        if (!respondWithMemoryError(error, response)) throw error
      }
    },
  )

  app.post(
    '/api/learner-memories/:memoryId/action',
    requireAuthenticated,
    async (request, response) => {
      if (!progressEnabled || !memoryManagementEnabled) {
        featureNotEnabled(response)
        return
      }
      const memoryId = pathParam(request, 'memoryId')
      if (memoryId === undefined || !z.uuid().safeParse(memoryId).success) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_MEMORY',
              'The learner memory ID is invalid.',
            ),
          )
        return
      }
      const input = z
        .object({ action: LearnerMemoryActionSchema })
        .strict()
        .safeParse(request.body)
      if (!input.success) {
        response.status(400).json(
          createApiError(
            'INVALID_MEMORY_ACTION',
            'The learner memory action is invalid.',
            {
              details: input.error.issues,
            },
          ),
        )
        return
      }
      try {
        const ownerId = authenticatedSubject(response)
        const result = await aiMemoryClient.actOnMemory(
          ownerId,
          memoryId,
          input.data.action as LearnerMemoryAction,
        )
        recommendationService.invalidateForLearner(ownerId)
        await persistMemoryInvalidation(ownerId)
        response.json({
          data:
            result.memory === undefined
              ? null
              : publicLearnerMemory(result.memory, ownerId),
        })
      } catch (error) {
        if (!respondWithMemoryError(error, response)) throw error
      }
    },
  )

  app.get(
    '/api/ai-consent',
    requireAuthenticated,
    async (_request, response) => {
      if (!progressEnabled) {
        featureNotEnabled(response)
        return
      }
      response.json(
        AiConsentResponseSchema.parse(
          await progressService.getConsent(authenticatedSubject(response)),
        ),
      )
    },
  )

  app.put(
    '/api/ai-consent',
    requireAuthenticated,
    async (request, response) => {
      if (!progressEnabled) {
        featureNotEnabled(response)
        return
      }
      const input = SaveAiConsentRequestSchema.safeParse(request.body)
      if (!input.success) {
        response.status(400).json(
          createApiError(
            'INVALID_AI_CONSENT',
            'The personalized AI coaching choice is invalid.',
            {
              details: input.error.issues,
            },
          ),
        )
        return
      }
      if (input.data.policyVersion !== COACH_POLICY_VERSION) {
        response
          .status(400)
          .json(
            createApiError(
              'AI_CONSENT_POLICY_VERSION_REQUIRED',
              'Review the current personalized coaching consent before enabling AI features.',
            ),
          )
        return
      }
      if (!input.data.enabled) {
        await coachService.clearDerivedConversationSummaries(
          authenticatedSubject(response),
        )
      }
      response.json(
        await progressService.saveConsent(
          authenticatedSubject(response),
          input.data.enabled,
          input.data.policyVersion,
        ),
      )
    },
  )

  app.delete(
    '/api/me/data',
    requireAuthenticated,
    async (request, response) => {
      if (!progressEnabled) {
        featureNotEnabled(response)
        return
      }
      const input = DeleteAllDataRequestSchema.safeParse(request.body)
      if (!input.success) {
        response.status(400).json(
          createApiError(
            'DELETE_CONFIRMATION_REQUIRED',
            'Type DELETE to confirm removal of AlgoMemtor data.',
            {
              details: input.error.issues,
            },
          ),
        )
        return
      }
      const job = await progressService.requestDeleteAll(
        authenticatedSubject(response),
      )
      response.status(202).json(
        DeleteAllDataResponseSchema.parse({
          data: { status: 'pending', jobId: job.id },
        }),
      )
    },
  )

  app.get(
    '/api/me/data/status',
    requireAuthenticated,
    async (_request, response) => {
      if (!progressEnabled) {
        featureNotEnabled(response)
        return
      }
      response.json(
        DeleteAllDataStatusResponseSchema.parse(
          await progressService.getDeleteStatus(authenticatedSubject(response)),
        ),
      )
    },
  )

  app.get('/api/topics', requireAuthenticated, async (_request, response) => {
    try {
      response.json(
        await catalogService.getTopics(response.locals.requestId as string),
      )
    } catch (error) {
      if (error instanceof ProviderError) {
        response.status(providerStatusCode(error)).json(
          createApiError(error.code, providerMessage(error), {
            retryable: error.retryable,
            details: { provider: error.provider },
          }),
        )
        return
      }

      throw error
    }
  })

  app.get('/api/problems', requireAuthenticated, async (request, response) => {
    const queryResult = ExternalProblemCatalogQueryParamsSchema.safeParse(
      request.query,
    )

    if (!queryResult.success) {
      response
        .status(400)
        .json(
          createApiError(
            'INVALID_QUERY_PARAMETERS',
            'The external problem catalog query parameters are invalid.',
            { details: queryResult.error.issues },
          ),
        )
      return
    }

    try {
      const learnerStatuses =
        queryResult.data.status === undefined
          ? undefined
          : latestLearnerStatuses(
              await problemActionRepository.listByAuthUserId(
                authenticatedSubject(response),
              ),
            )
      const catalog = await catalogService.getProblems(
        queryResult.data,
        response.locals.requestId as string,
        learnerStatuses,
      )
      response.json({
        ...catalog,
        data: progressEnabled
          ? await decorateProblemsForLearner(
              authenticatedSubject(response),
              catalog.data,
            )
          : catalog.data,
      })
    } catch (error) {
      if (error instanceof ProviderError) {
        logger.warn('catalog_provider_error', {
          service: 'core-api',
          route: '/api/problems',
          provider: error.provider,
          errorCode: error.code,
          retryable: error.retryable,
          requestId: response.locals.requestId as string,
        })
        response.status(providerStatusCode(error)).json(
          createApiError(error.code, providerMessage(error), {
            retryable: error.retryable,
            details: { provider: error.provider },
          }),
        )
        return
      }

      throw error
    }
  })

  app.get(
    '/api/problems/:provider/:externalId',
    requireAuthenticated,
    async (request, response) => {
      const providerResult = ProviderKeySchema.safeParse(
        pathParam(request, 'provider'),
      )
      const externalId = pathParam(request, 'externalId')
      if (!providerResult.success || externalId === undefined) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_PROBLEM_REFERENCE',
              'The provider problem reference is invalid.',
            ),
          )
        return
      }
      try {
        const summary = await catalogService.getProblem(
          providerResult.data,
          externalId,
          response.locals.requestId as string,
        )
        if (summary === null) {
          response
            .status(404)
            .json(
              createApiError(
                'PROBLEM_NOT_FOUND',
                'That problem is not available in the provider catalog.',
              ),
            )
          return
        }
        const contentResult = await catalogService.getProblemContent(
          providerResult.data,
          externalId,
          response.locals.requestId as string,
        )
        response.json(
          ProblemDetailResponseSchema.parse({
            data: {
              summary,
              content: contentResult?.content ?? null,
            },
            ...(contentResult === null || contentResult === undefined
              ? {}
              : {
                  meta: {
                    warnings: contentResult.warnings,
                    freshness: contentResult.freshness,
                  },
                }),
          }),
        )
      } catch (error) {
        if (!respondWithProviderError(error, response)) throw error
      }
    },
  )

  app.get(
    '/api/unified-profile',
    requireAuthenticated,
    async (_request, response) => {
      const profile = await providerStatsForProfile(
        authenticatedSubject(response),
      )
      response.json(
        UnifiedProfileResponseSchema.parse({
          data: {
            ...profile,
            accounts: profile.accounts.map(serializeProviderAccount),
            ...(profile.archivedAccounts === undefined
              ? {}
              : {
                  archivedAccounts: profile.archivedAccounts.map(
                    serializeProviderAccount,
                  ),
                }),
            generatedAt: new Date().toISOString(),
          },
        }),
      )
    },
  )

  app.get('/api/activity', requireAuthenticated, async (request, response) => {
    const providerResult = LinkableProviderSchema.safeParse(
      typeof request.query.provider === 'string'
        ? request.query.provider
        : undefined,
    )
    if (request.query.provider !== undefined && !providerResult.success) {
      response
        .status(400)
        .json(
          createApiError(
            'INVALID_PROVIDER_FILTER',
            'The provider filter is invalid.',
          ),
        )
      return
    }
    const provider = providerResult.success ? providerResult.data : undefined
    const authUserId = authenticatedSubject(response)
    const [
      actions,
      verified,
      submissions,
      solvedProblems,
      ratingChanges,
      participations,
    ] = await Promise.all([
      problemActionRepository.listByAuthUserId(authUserId),
      providerAccountRepository.listVerifiedActivityByAuthUserId(authUserId),
      providerDataRepository.listSubmissions(authUserId, provider),
      providerDataRepository.listSolvedProblems(authUserId, provider),
      providerDataRepository.listRatingChanges(authUserId, provider),
      providerDataRepository.listContestParticipations(authUserId, provider),
    ])
    const events = actions.flatMap((action) => {
      if (
        action.actionType !== 'status_changed' ||
        action.evidenceSource === 'provider_verified' ||
        action.learnerStatus === 'unsolved'
      ) {
        return []
      }
      if (provider !== undefined && action.provider !== provider) return []
      return [
        {
          id: action.id,
          provider: action.provider,
          eventType:
            action.learnerStatus === 'solved'
              ? ('solved' as const)
              : ('submission' as const),
          externalId: action.externalId,
          occurredAt: action.occurredAt.toISOString(),
          source: 'manual' as const,
          completeness: 'complete' as const,
        },
      ]
    })
    const observedCodeforcesSolves = new Set(
      solvedProblems
        .filter(
          (problem) =>
            problem.provider === 'codeforces' && problem.occurredAt !== null,
        )
        .map((problem) => problem.externalId),
    )
    const verifiedEvents = verified.flatMap((event) => {
      if (
        (provider !== undefined && provider !== 'codeforces') ||
        observedCodeforcesSolves.has(event.externalId)
      )
        return []
      return [
        {
          id: event.id,
          provider: 'codeforces' as const,
          eventType: 'solved' as const,
          externalId: event.externalId,
          providerEventId: event.providerEventId,
          occurredAt: event.occurredAt.toISOString(),
          source: 'provider' as const,
          completeness: 'partial' as const,
        },
      ]
    })
    const normalizedEvents = [
      ...submissions.map((submission) => ({
        id: `submission:${submission.provider}:${submission.eventId}`,
        provider: submission.provider,
        eventType: 'submission' as const,
        externalId: submission.externalId,
        providerEventId: submission.eventId,
        ...(submission.problemTitle === undefined
          ? {}
          : { title: submission.problemTitle }),
        canonicalUrl: submission.canonicalUrl,
        occurredAt: submission.occurredAt ?? null,
        verdict: submission.verdict,
        ...(submission.language === undefined
          ? {}
          : { language: submission.language }),
        source: 'provider' as const,
        completeness: submission.completeness,
      })),
      ...solvedProblems.map((solved) => ({
        id: `solved:${solved.provider}:${solved.externalId}`,
        provider: solved.provider,
        eventType: 'solved' as const,
        externalId: solved.externalId,
        canonicalUrl: solved.canonicalUrl,
        occurredAt: solved.occurredAt,
        ...(solved.providerTags === undefined
          ? {}
          : { providerTags: solved.providerTags }),
        ...(solved.topics === undefined ? {} : { topics: solved.topics }),
        source: 'provider' as const,
        completeness: solved.completeness,
      })),
      ...ratingChanges.map((change) => ({
        id: `rating:${change.provider}:${change.eventId}`,
        provider: change.provider,
        eventType: 'rating_change' as const,
        providerEventId: change.eventId,
        ...(change.contestId === undefined
          ? {}
          : { externalId: change.contestId }),
        ...(change.contestName === undefined
          ? {}
          : { title: change.contestName }),
        occurredAt: change.occurredAt,
        ratingDelta: change.delta,
        source: 'provider' as const,
        completeness: change.provenance.completeness,
      })),
      ...participations.map((participation) => ({
        id: `contest:${participation.provider}:${participation.contestId}`,
        provider: participation.provider,
        eventType: 'contest' as const,
        externalId: participation.contestId,
        ...(participation.contestName === undefined
          ? {}
          : { title: participation.contestName }),
        occurredAt: participation.attendedAt ?? null,
        ...(participation.rank === undefined
          ? {}
          : { rank: participation.rank }),
        source: 'provider' as const,
        completeness: participation.provenance.completeness,
      })),
    ]
    const data = [...events, ...verifiedEvents, ...normalizedEvents].sort(
      (left, right) =>
        (right.occurredAt ?? '').localeCompare(left.occurredAt ?? '') ||
        left.id.localeCompare(right.id),
    )
    response.json(
      ProviderActivityResponseSchema.parse({
        data,
        meta: {
          partial:
            verified.length > 0 ||
            normalizedEvents.some((event) => event.completeness !== 'complete'),
          stale: false,
          providers: providerFreshness(),
        },
      }),
    )
  })

  app.get('/api/contests', requireAuthenticated, async (request, response) => {
    const queryResult = ExternalContestsQuerySchema.safeParse(request.query)
    if (!queryResult.success) {
      response
        .status(400)
        .json(
          createApiError(
            'INVALID_CONTEST_QUERY',
            'The contest query parameters are invalid.',
            { details: queryResult.error.issues },
          ),
        )
      return
    }
    try {
      response.json(
        await contestCatalogService.getContests(
          queryResult.data,
          response.locals.requestId as string,
        ),
      )
    } catch (error) {
      if (!respondWithProviderError(error, response)) throw error
    }
  })

  app.get('/api/analytics', requireAuthenticated, async (request, response) => {
    const providerResult = LinkableProviderSchema.safeParse(
      typeof request.query.provider === 'string'
        ? request.query.provider
        : undefined,
    )
    if (request.query.provider !== undefined && !providerResult.success) {
      response
        .status(400)
        .json(
          createApiError(
            'INVALID_PROVIDER_FILTER',
            'The provider filter is invalid.',
          ),
        )
      return
    }
    const provider = providerResult.success ? providerResult.data : undefined
    const authUserId = authenticatedSubject(response)
    const [
      profile,
      allActions,
      submissions,
      solvedProblems,
      ratingChanges,
      participations,
    ] = await Promise.all([
      providerStatsForProfile(authUserId),
      problemActionRepository.listByAuthUserId(authUserId),
      providerDataRepository.listSubmissions(authUserId, provider),
      providerDataRepository.listSolvedProblems(authUserId, provider),
      providerDataRepository.listRatingChanges(authUserId, provider),
      providerDataRepository.listContestParticipations(authUserId, provider),
    ])
    // Learner actions (manual and provider-verified solves) are stored for
    // every platform; a single-platform view must never count another
    // platform's solves in its calendar, topics, or difficulty totals.
    const actions =
      provider === undefined
        ? allActions
        : allActions.filter((action) => action.provider === provider)
    const profileProviders =
      provider === undefined
        ? profile.providers
        : profile.providers.filter((item) => item.provider === provider)
    const profileSnapshots =
      provider === undefined
        ? (profile.profiles ?? [])
        : (profile.profiles ?? []).filter((item) => item.provider === provider)
    const solvedByProvider = {
      codeforces:
        profileProviders.find((item) => item.provider === 'codeforces')
          ?.solvedCount ?? 0,
      codechef:
        profileProviders.find((item) => item.provider === 'codechef')
          ?.solvedCount ?? 0,
      leetcode:
        profileProviders.find((item) => item.provider === 'leetcode')
          ?.solvedCount ?? 0,
      cses:
        profileProviders.find((item) => item.provider === 'cses')
          ?.solvedCount ?? 0,
    }
    const solvedByDifficulty = { easy: 0, medium: 0, hard: 0 }
    const solvedOverTime: Record<string, number> = {}
    const topicCounts: Record<string, number> = {}
    const languageCounts: Record<string, number> = {}
    const profileTopicProviders = new Set(
      profileSnapshots
        .filter(
          (snapshot) =>
            Object.keys(normalizeTopicCounts(snapshot.topicCounts)).length > 0,
        )
        .map((snapshot) => snapshot.provider),
    )
    const solvedReferences = [
      ...solvedProblems.map((problem) => ({
        provider: problem.provider,
        externalId: problem.externalId,
      })),
      ...actions.flatMap((action) => {
        if (
          action.actionType !== 'status_changed' ||
          action.learnerStatus !== 'solved'
        ) {
          return []
        }
        const parsedProvider = LinkableProviderSchema.safeParse(action.provider)
        return parsedProvider.success
          ? [{ provider: parsedProvider.data, externalId: action.externalId }]
          : []
      }),
    ]
    const uniqueSolvedReferences = [
      ...new Map(
        solvedReferences.map((reference) => [
          `${reference.provider}:${reference.externalId}`,
          reference,
        ]),
      ).values(),
    ]
    // Submitted-but-unsolved problems are looked up too so the Insights
    // topic-strength view can attribute failed attempts to topics.
    const lookupReferences = [
      ...new Map(
        [
          ...uniqueSolvedReferences,
          ...submissions.slice(0, 3_000).map((submission) => ({
            provider: submission.provider,
            externalId: submission.externalId,
          })),
        ].map((reference) => [
          `${reference.provider}:${reference.externalId}`,
          reference,
        ]),
      ).values(),
    ]
    let metadata: ExternalProblemSummary[] = []
    if (
      problemMetadataCache?.findByReferences !== undefined &&
      lookupReferences.length > 0
    ) {
      try {
        metadata = await problemMetadataCache.findByReferences(lookupReferences)
      } catch {
        logger.warn('provider_metadata_lookup_failed', {
          route: '/api/analytics',
        })
      }
    }
    const metadataByKey = new Map(
      metadata.map((problem) => [
        `${problem.provider}:${problem.externalId}`,
        problem,
      ]),
    )
    for (const reference of uniqueSolvedReferences) {
      const problem = metadataByKey.get(
        `${reference.provider}:${reference.externalId}`,
      )
      if (problem?.normalizedDifficulty !== undefined) {
        solvedByDifficulty[problem.normalizedDifficulty] += 1
      }
      if (profileTopicProviders.has(reference.provider)) continue
      const observation = solvedProblems.find(
        (solved) =>
          solved.provider === reference.provider &&
          solved.externalId === reference.externalId,
      )
      const topics = new Set([
        ...(problem?.topics ?? []),
        ...(observation?.topics ?? []),
      ])
      const normalizedTopics = new Set(
        [...topics].map(normalizeTopic).filter((topic) => topic !== undefined),
      )
      for (const topic of normalizedTopics) {
        topicCounts[topic] = (topicCounts[topic] ?? 0) + 1
      }
    }
    // Days are the learner's calendar days: a UTC split breaks streaks for
    // anyone solving late in the evening outside UTC.
    const learnerProfile =
      await learnerProfileRepository.findByAuthUserId(authUserId)
    const learnerTimezone = learnerProfile?.timezone ?? 'UTC'
    const dayKey = learnerDayKeyFormatter(learnerTimezone)
    const solvedDates = new Map<string, string>()
    for (const solved of solvedProblems) {
      if (solved.occurredAt !== null) {
        solvedDates.set(
          `${solved.provider}:${solved.externalId}`,
          dayKey(new Date(solved.occurredAt)),
        )
      }
    }
    for (const action of actions) {
      if (
        action.actionType !== 'status_changed' ||
        action.learnerStatus !== 'solved'
      ) {
        continue
      }
      const parsedProvider = LinkableProviderSchema.safeParse(action.provider)
      if (!parsedProvider.success) continue
      const key = `${parsedProvider.data}:${action.externalId}`
      if (!solvedDates.has(key)) {
        solvedDates.set(key, dayKey(action.occurredAt))
      }
    }
    for (const date of solvedDates.values()) {
      solvedOverTime[date] = (solvedOverTime[date] ?? 0) + 1
    }
    for (const providerProfile of profileSnapshots) {
      for (const [topic, count] of Object.entries(
        normalizeTopicCounts(providerProfile.topicCounts),
      )) {
        topicCounts[topic] = (topicCounts[topic] ?? 0) + count
      }
    }
    for (const providerProfile of profileSnapshots) {
      for (const [language, count] of Object.entries(
        languageFamilyCounts(providerProfile.languageCounts),
      )) {
        languageCounts[language] = (languageCounts[language] ?? 0) + count
      }
    }
    // Platforms without profile language totals (LeetCode and CSES via the
    // browser connector) count the language of each accepted problem.
    const snapshotLanguageProviders = new Set(
      profileSnapshots
        .filter((snapshot) => Object.keys(snapshot.languageCounts).length > 0)
        .map((snapshot) => snapshot.provider),
    )
    const acceptedLanguage = new Map<string, string>()
    for (const submission of submissions) {
      if (
        !submission.isAccepted ||
        submission.language === undefined ||
        snapshotLanguageProviders.has(submission.provider)
      ) {
        continue
      }
      acceptedLanguage.set(
        `${submission.provider}:${submission.externalId}`,
        submission.language,
      )
    }
    for (const language of acceptedLanguage.values()) {
      const family = programmingLanguageFamily(language)
      languageCounts[family] = (languageCounts[family] ?? 0) + 1
    }
    const acceptedSubmissions = submissions.filter(
      (item) => item.isAccepted,
    ).length
    const acceptanceRate =
      submissions.length === 0
        ? undefined
        : (acceptedSubmissions / submissions.length) * 100
    const staleProviders =
      provider === undefined
        ? profile.staleProviders
        : profile.staleProviders.filter((item) => item === provider)
    const solvedTotal =
      provider === undefined
        ? profile.solvedTotal
        : (profileProviders.find((item) => item.provider === provider)
            ?.solvedCount ?? 0)
    const solvedAtByKey = new Map<string, string>()
    for (const solved of solvedProblems) {
      if (solved.occurredAt !== null) {
        solvedAtByKey.set(
          `${solved.provider}:${solved.externalId}`,
          solved.occurredAt,
        )
      }
    }
    for (const action of actions) {
      if (
        action.actionType !== 'status_changed' ||
        action.learnerStatus !== 'solved'
      ) {
        continue
      }
      const actionKey = `${action.provider}:${action.externalId}`
      if (!solvedAtByKey.has(actionKey)) {
        solvedAtByKey.set(actionKey, action.occurredAt.toISOString())
      }
    }
    const insights = buildAnalyticsInsights({
      timezone: learnerTimezone,
      now: new Date(),
      profiles: profileSnapshots,
      otherAccounts: profileProviders.map((item) => ({
        provider: item.provider,
        handle: item.handle,
        ...(item.solvedCount === undefined
          ? {}
          : { solvedCount: item.solvedCount }),
      })),
      submissions,
      solved: uniqueSolvedReferences
        .filter(
          (reference) =>
            provider === undefined || reference.provider === provider,
        )
        .map((reference) => {
          const solvedAt = solvedAtByKey.get(
            `${reference.provider}:${reference.externalId}`,
          )
          return solvedAt === undefined ? reference : { ...reference, solvedAt }
        }),
      ratingChanges,
      participations,
      metadata: metadataByKey,
      normalizeTopic,
    })
    response.json(
      UnifiedAnalyticsSchema.parse({
        insights,
        solvedTotal,
        solvedByProvider,
        solvedOverTime,
        solvedByDifficulty,
        topicCounts,
        languageCounts,
        ...(acceptanceRate === undefined ? {} : { acceptanceRate }),
        ratingHistory: ratingChanges,
        contestParticipation: participations,
        dataCompleteness:
          actions.length === 0 &&
          uniqueSolvedReferences.every((reference) =>
            metadataByKey.has(`${reference.provider}:${reference.externalId}`),
          )
            ? profile.completeness
            : 'partial',
        staleProviders,
        generatedAt: new Date().toISOString(),
      }),
    )
  })

  app.get(
    '/api/recommendations',
    requireAuthenticated,
    async (request, response) => {
      const cancellation = abortSignalForResponse(request, response)
      try {
        const feed = await recommendationFeedForLearner(
          authenticatedSubject(response),
          false,
          response.locals.requestId as string,
          cancellation.signal,
        )
        response.json(feed)
      } catch (error) {
        if (!respondWithProviderError(error, response)) {
          throw error
        }
      } finally {
        cancellation.detach()
      }
    },
  )

  app.post(
    '/api/recommendations/refresh',
    requireAuthenticated,
    async (request, response) => {
      const cancellation = abortSignalForResponse(request, response)
      try {
        const feed = await recommendationFeedForLearner(
          authenticatedSubject(response),
          true,
          response.locals.requestId as string,
          cancellation.signal,
        )
        response.json(feed)
      } catch (error) {
        if (!respondWithProviderError(error, response)) {
          throw error
        }
      } finally {
        cancellation.detach()
      }
    },
  )

  const steeringView = (
    record: RecommendationSteeringRecord,
  ): RecommendationSteering => ({
    id: record.id,
    text: record.text,
    directives: record.directives,
    applied: record.applied,
    savedToMemory: record.memoryId !== undefined,
    createdAt: record.createdAt.toISOString(),
  })

  app.get(
    '/api/recommendations/steering',
    requireAuthenticated,
    async (_request, response) => {
      const records = await recommendationService.listSteering(
        authenticatedSubject(response),
      )
      response.json(
        RecommendationSteeringListResponseSchema.parse({
          data: records.map(steeringView),
        }),
      )
    },
  )

  // A learner's plain-language instruction for their recommendations. It is
  // parsed into enforced filters, remembered by the coach (with consent), and
  // the feed is regenerated under it straight away.
  app.post(
    '/api/recommendations/steering',
    requireAuthenticated,
    async (request, response) => {
      const input = SaveRecommendationSteeringRequestSchema.safeParse(
        request.body,
      )
      if (!input.success) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_RECOMMENDATION_INSTRUCTION',
              'Describe what you want in 1 to 500 characters.',
              { details: input.error.issues },
            ),
          )
        return
      }
      const authUserId = authenticatedSubject(response)
      const text = input.data.text.replace(/\s+/g, ' ').trim()
      const cancellation = abortSignalForResponse(request, response)
      try {
        const { record, feed } = await recommendationService.addSteering(
          authUserId,
          text,
          response.locals.requestId as string,
          cancellation.signal,
        )
        let saved = record
        const consent = await progressRepository.getConsent(authUserId)
        const proposeMemory = aiMemoryClient.proposeMemory
        if (
          consent?.enabled === true &&
          consent.policyVersion === COACH_POLICY_VERSION &&
          proposeMemory !== undefined
        ) {
          try {
            const proposed = await proposeMemory.call(
              aiMemoryClient,
              authUserId,
              `recommendation-steering:${record.id}`,
              {
                statement:
                  `Recommendation instruction from the learner: ${text}`.slice(
                    0,
                    500,
                  ),
                category: 'user_instruction',
              },
            )
            if (proposed.memory !== undefined) {
              await aiMemoryClient.actOnMemory(
                authUserId,
                proposed.memory.id,
                'approve',
              )
              await recommendationService.recordSteeringMemory(
                authUserId,
                record.id,
                proposed.memory.id,
              )
              saved = { ...record, memoryId: proposed.memory.id }
            }
          } catch {
            // The instruction already steers recommendations; memory is an
            // enhancement and reports its absence through savedToMemory.
            logger.warn('recommendation_steering_memory_failed', {
              errorCode: 'AI_MEMORY_UNAVAILABLE',
            })
          }
        }
        response.json(
          RecommendationSteeringResponseSchema.parse({
            data: {
              steering: steeringView(saved),
              feed: await decorateRecommendationFeed(authUserId, feed),
            },
          }),
        )
      } catch (error) {
        if (!respondWithProviderError(error, response)) {
          throw error
        }
      } finally {
        cancellation.detach()
      }
    },
  )

  app.delete(
    '/api/recommendations/steering/:steeringId',
    requireAuthenticated,
    async (request, response) => {
      const authUserId = authenticatedSubject(response)
      const removed = await recommendationService.removeSteering(
        authUserId,
        String(request.params.steeringId),
      )
      if (removed === null) {
        response
          .status(404)
          .json(
            createApiError(
              'RECOMMENDATION_INSTRUCTION_NOT_FOUND',
              'That recommendation instruction was not found.',
            ),
          )
        return
      }
      if (removed.memoryId !== undefined) {
        try {
          await aiMemoryClient.actOnMemory(
            authUserId,
            removed.memoryId,
            'archive',
          )
        } catch {
          logger.warn('recommendation_steering_memory_archive_failed', {
            errorCode: 'AI_MEMORY_UNAVAILABLE',
          })
        }
      }
      const records = await recommendationService.listSteering(authUserId)
      response.json(
        RecommendationSteeringListResponseSchema.parse({
          data: records.map(steeringView),
        }),
      )
    },
  )

  app.patch(
    '/api/recommendation-items/:itemId/feedback',
    requireAuthenticated,
    async (request, response) => {
      const inputResult = RecommendationFeedbackInputSchema.safeParse(
        request.body,
      )

      if (!inputResult.success) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_RECOMMENDATION_FEEDBACK',
              'The recommendation feedback is invalid.',
              { details: inputResult.error.issues },
            ),
          )
        return
      }

      const itemId = pathParam(request, 'itemId')

      if (
        itemId === undefined ||
        !recommendationItemIdSchema.safeParse(itemId).success
      ) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_RECOMMENDATION_ITEM',
              'The recommendation item ID is invalid.',
            ),
          )
        return
      }

      try {
        response.json(
          await recommendationService.saveFeedback(
            authenticatedSubject(response),
            itemId,
            inputResult.data,
          ),
        )
      } catch (error) {
        if (respondWithProviderError(error, response)) {
          return
        }

        if (error instanceof RecommendationOwnershipError) {
          response
            .status(404)
            .json(
              createApiError(
                'RECOMMENDATION_ITEM_NOT_FOUND',
                'The recommendation item could not be found for this learner.',
              ),
            )
          return
        }

        if (error instanceof RecommendationNotFoundError) {
          response
            .status(404)
            .json(
              createApiError('RECOMMENDATION_ITEM_NOT_FOUND', error.message),
            )
          return
        }

        throw error
      }
    },
  )

  app.post(
    '/api/recommendation-items/:itemId/dismiss',
    requireAuthenticated,
    async (request, response) => {
      const itemId = pathParam(request, 'itemId')

      if (
        itemId === undefined ||
        !recommendationItemIdSchema.safeParse(itemId).success
      ) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_RECOMMENDATION_ITEM',
              'The recommendation item ID is invalid.',
            ),
          )
        return
      }

      try {
        response.json(
          await recommendationService.dismiss(
            authenticatedSubject(response),
            itemId,
          ),
        )
      } catch (error) {
        if (respondWithProviderError(error, response)) {
          return
        }

        if (error instanceof RecommendationNotFoundError) {
          response
            .status(404)
            .json(
              createApiError('RECOMMENDATION_ITEM_NOT_FOUND', error.message),
            )
          return
        }

        throw error
      }
    },
  )

  app.get(
    '/api/recommendation-dismissals',
    requireAuthenticated,
    async (_request, response) => {
      try {
        response.json(
          await recommendationService.listDismissals(
            authenticatedSubject(response),
          ),
        )
      } catch (error) {
        if (!respondWithProviderError(error, response)) {
          throw error
        }
      }
    },
  )

  app.post(
    '/api/recommendation-dismissals/:provider/:externalId',
    requireAuthenticated,
    async (request, response) => {
      const provider = ProviderKeySchema.safeParse(request.params.provider)
      const externalId = pathParam(request, 'externalId')
      if (
        !provider.success ||
        externalId === undefined ||
        !recommendationExternalIdSchema.safeParse(externalId).success
      ) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_RECOMMENDATION_ITEM',
              'The problem identity is invalid.',
            ),
          )
        return
      }
      try {
        response.json(
          await recommendationService.dismissProblem(
            authenticatedSubject(response),
            provider.data,
            externalId,
          ),
        )
      } catch (error) {
        if (respondWithProviderError(error, response)) return
        if (error instanceof RecommendationNotFoundError) {
          response
            .status(404)
            .json(
              createApiError('RECOMMENDATION_ITEM_NOT_FOUND', error.message),
            )
          return
        }
        throw error
      }
    },
  )

  app.delete(
    '/api/recommendation-dismissals/:provider/:externalId',
    requireAuthenticated,
    async (request, response) => {
      const providerResult = ProviderKeySchema.safeParse(
        request.params.provider,
      )

      if (!providerResult.success) {
        response
          .status(400)
          .json(
            createApiError(
              'UNSUPPORTED_RECOMMENDATION_PROVIDER',
              'That provider cannot be restored from recommendations.',
            ),
          )
        return
      }

      const externalId = pathParam(request, 'externalId')

      if (
        externalId === undefined ||
        !recommendationExternalIdSchema.safeParse(externalId).success
      ) {
        response
          .status(400)
          .json(
            createApiError(
              'INVALID_RECOMMENDATION_ITEM',
              'The recommendation problem ID is invalid.',
            ),
          )
        return
      }

      try {
        response.json(
          RecommendationRestorationResponseSchema.parse({
            data: await recommendationService.restore(
              authenticatedSubject(response),
              providerResult.data,
              externalId,
            ),
          }),
        )
      } catch (error) {
        if (respondWithProviderError(error, response)) {
          return
        }

        if (error instanceof RecommendationNotFoundError) {
          response
            .status(404)
            .json(
              createApiError(
                'RECOMMENDATION_DISMISSAL_NOT_FOUND',
                error.message,
              ),
            )
          return
        }

        throw error
      }
    },
  )

  app.use(
    (
      error: unknown,
      request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      if (error instanceof ProgressOutboxUnavailableError) {
        logger.warn('progress_outbox_unavailable', {
          service: 'core-api',
          route: request.path,
          requestId: response.locals.requestId as string,
          errorCode: error.code,
        })
        response
          .status(503)
          .json(
            createApiError(
              error.code,
              'Progress processing is temporarily unavailable. Please try again.',
              { retryable: true },
            ),
          )
        return
      }
      // Body parsers report oversized payloads with status 413; that is a
      // client error, not a server failure.
      if (
        typeof error === 'object' &&
        error !== null &&
        'type' in error &&
        error.type === 'entity.too.large'
      ) {
        response
          .status(413)
          .json(
            createApiError(
              'PAYLOAD_TOO_LARGE',
              'The request body is too large.',
            ),
          )
        return
      }
      const invalidJson =
        error instanceof SyntaxError &&
        'status' in error &&
        error.status === 400

      logger.error('unhandled_request_error', {
        service: 'core-api',
        route: request.path,
        requestId: response.locals.requestId as string,
        httpStatus: invalidJson ? 400 : 500,
        errorCode: invalidJson ? 'INVALID_JSON' : 'INTERNAL_SERVER_ERROR',
        // The error class and a database error code (e.g. P2002) are safe
        // to log; the message and stack are dropped by the logger.
        errorName: error instanceof Error ? error.name : typeof error,
        dbCode:
          error instanceof Error &&
          'code' in error &&
          typeof error.code === 'string'
            ? error.code
            : undefined,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      })

      response
        .status(invalidJson ? 400 : 500)
        .json(
          createApiError(
            invalidJson ? 'INVALID_JSON' : 'INTERNAL_SERVER_ERROR',
            invalidJson
              ? 'The request body is not valid JSON.'
              : 'The application service could not complete the request.',
          ),
        )
    },
  )

  return app
}
