import { createHash, randomUUID } from 'node:crypto'

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
  LinkableProviderSchema,
  LinkProviderAccountRequestSchema,
  ProviderAccountResponseSchema,
  ProviderAccountsResponseSchema,
  RecommendationFeedbackInputSchema,
  RecommendationRestorationResponseSchema,
  RefreshProviderPublicStatsRequestSchema,
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
} from '@algomemtor/shared-contracts'
import type { ExternalProblemSummary } from '@algomemtor/shared-contracts'
import cors from 'cors'
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
import { requireAuth } from './auth/require-auth.js'
import type {
  SupabaseJwtVerifier,
  VerifiedAccessToken,
} from './auth/supabase-jwt.js'
import { readCodeforcesProviderConfig } from './config/provider-config.js'
import { ProviderError } from './errors/provider-error.js'
import { CodeforcesProvider } from './integrations/codeforces/codeforces-provider.js'
import { CodeChefPublicStatsFetcher } from './integrations/provider-accounts/codechef-public-stats.js'
import { CodeforcesPublicStatsFetcher } from './integrations/provider-accounts/codeforces-public-stats.js'
import { LeetCodePublicStatsFetcher } from './integrations/provider-accounts/leetcode-public-stats.js'
import {
  ProviderPublicStatsError,
  type ProviderPublicStatsFetcher,
} from './integrations/provider-accounts/provider-public-stats.js'
import type { ProblemProvider } from './integrations/providers/problem-provider.js'
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
  InMemoryProviderAccountRepository,
  type ProviderAccountRepository,
} from './repositories/provider-account-repository.js'
import { ProblemCatalogService } from './services/problem-catalog-service.js'
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
import { serializeProviderAccount } from './services/provider-account-service.js'
import {
  structuredLogger,
  type StructuredLogger,
} from './utils/structured-logger.js'

export type CreateAppOptions = {
  jwtVerifier?: SupabaseJwtVerifier
  learnerProfileRepository?: LearnerProfileRepository
  problemActionRepository?: ProblemActionRepository
  progressRepository?: ProgressRepository
  bookmarkRepository?: BookmarkRepository
  recommendationRepository?: RecommendationRepository
  providerAccountRepository?: ProviderAccountRepository
  providerPublicStatsFetchers?: readonly ProviderPublicStatsFetcher[]
  problemProvider?: ProblemProvider
  logger?: StructuredLogger
  aiRecommendationClient?: AiRecommendationClient
  aiMemoryClient?: AiMemoryClient
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
  if (error.code === 'PROVIDER_RATE_LIMITED') {
    return 'Codeforces is temporarily rate limiting catalog requests.'
  }

  if (error.code === 'PROVIDER_INVALID_RESPONSE') {
    return 'Codeforces returned an invalid metadata response.'
  }

  if (error.code === 'PROVIDER_TIMEOUT') {
    return 'Codeforces took too long to respond.'
  }

  return 'Codeforces is temporarily unavailable.'
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

const defaultProviderPublicStatsFetchers = () => [
  new CodeforcesPublicStatsFetcher(),
  new CodeChefPublicStatsFetcher(),
  new LeetCodePublicStatsFetcher(),
]

const latestLearnerStatuses = (
  actions: readonly {
    provider: string
    externalId: string
    actionType: string
    learnerStatus?: 'unsolved' | 'attempted' | 'solved' | undefined
    occurredAt: Date
    id: string
  }[],
) => {
  const statuses = new Map<string, 'unsolved' | 'attempted' | 'solved'>()
  for (const action of actions
    .filter((item) => item.actionType === 'status_changed')
    .sort(
      (left, right) =>
        left.occurredAt.getTime() - right.occurredAt.getTime() ||
        left.id.localeCompare(right.id),
    )) {
    if (action.learnerStatus !== undefined) {
      statuses.set(
        `${action.provider}:${action.externalId}`,
        action.learnerStatus,
      )
    }
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
        : 'LeetCode'

  if (error.code === 'PROVIDER_ACCOUNT_NOT_FOUND') {
    return `No public ${providerName} profile was found for that handle.`
  }

  if (error.code === 'PROVIDER_RATE_LIMITED') {
    return `${providerName} is temporarily rate limiting profile requests.`
  }

  if (error.code === 'PROVIDER_INVALID_RESPONSE') {
    return `${providerName} changed or returned an invalid public profile response.`
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
  const provider = options.problemProvider ?? defaultProvider()
  const jwtVerifier = options.jwtVerifier ?? denyUnconfiguredAuthentication
  const requireAuthenticated = requireAuth(jwtVerifier)
  const catalogService = new ProblemCatalogService(provider)
  const learnerProfileRepository =
    options.learnerProfileRepository ?? new InMemoryLearnerProfileRepository()
  const providerAccountRepository =
    options.providerAccountRepository ?? new InMemoryProviderAccountRepository()
  const problemActionRepository =
    options.problemActionRepository ?? new InMemoryProblemActionRepository()
  const progressRepository =
    options.progressRepository ?? new InMemoryProgressRepository()
  const bookmarkRepository =
    options.bookmarkRepository ?? new InMemoryBookmarkRepository()
  const recommendationRepository =
    options.recommendationRepository ?? new InMemoryRecommendationRepository()
  const recommendationService = new RecommendationService({
    aiRecommendationClient:
      options.aiRecommendationClient ?? new UnavailableAiRecommendationClient(),
    provider,
    learnerProfileRepository,
    problemActionRepository,
    progressRepository,
    recommendationRepository,
    logger,
    memoryGenerationEnabled: process.env.MEMORY_GENERATION_ENABLED !== 'false',
  })
  const providerAccountStatsService = new ProviderAccountStatsService({
    repository: providerAccountRepository,
    fetchers:
      options.providerPublicStatsFetchers ??
      defaultProviderPublicStatsFetchers(),
    logger,
  })
  const progressService = new ProgressService({
    actionRepository: problemActionRepository,
    progressRepository,
    bookmarkRepository,
    recommendationRepository,
    provider,
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

  app.use('/api', requireAuthenticated, async (request, response, next) => {
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
      providers: [provider.getHealth()],
    })
  })

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
      const providerResult = LinkableProviderSchema.safeParse(
        request.params.provider,
      )
      const accountResult = LinkProviderAccountRequestSchema.safeParse(
        request.body,
      )

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

      const account = await providerAccountRepository.upsertByAuthUserId(
        authenticatedSubject(response),
        providerResult.data,
        accountResult.data.handle,
      )

      response.json(
        ProviderAccountResponseSchema.parse({
          data: serializeProviderAccount(account),
        }),
      )
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

      await providerAccountRepository.deleteByAuthUserId(
        authenticatedSubject(response),
        providerResult.data,
      )
      response.json(
        DisconnectProviderAccountResponseSchema.parse({
          data: { provider: providerResult.data },
        }),
      )
    },
  )

  app.post(
    '/api/provider-accounts/:provider/public-stats/refresh',
    requireAuthenticated,
    async (request, response) => {
      const providerResult = LinkableProviderSchema.safeParse(
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

      if (!consentResult.success) {
        response
          .status(400)
          .json(
            createApiError(
              'PUBLIC_STATS_CONSENT_REQUIRED',
              'Explicit consent is required before public solved-count data is fetched and stored.',
              { details: consentResult.error.issues },
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

  app.post(
    '/api/problems/:provider/:externalId/open',
    requireAuthenticated,
    async (request, response) => {
      if (!progressEnabled) {
        featureNotEnabled(response)
        return
      }
      const reference = readLearnerProblemReference(request, response)
      if (reference === null) return
      const input = z
        .object({
          recommendationItemId: z.uuid().optional(),
          sourceContext: z.string().trim().min(1).max(64).optional(),
        })
        .strict()
        .safeParse(request.body ?? {})
      if (!input.success) {
        response.status(400).json(
          createApiError(
            'INVALID_OPEN_EVENT',
            'The problem open event is invalid.',
            {
              details: input.error.issues,
            },
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
      const action = await progressService.recordAction(
        authenticatedSubject(response),
        reference,
        'opened',
        input.data,
      )
      response
        .status(202)
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
            'The AI note-sharing choice is invalid.',
            {
              details: input.error.issues,
            },
          ),
        )
        return
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
      const catalog = await catalogService.getProblems(
        queryResult.data,
        response.locals.requestId as string,
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
    '/api/recommendations',
    requireAuthenticated,
    async (request, response) => {
      const cancellation = abortSignalForResponse(request, response)
      try {
        const feed = await recommendationService.getFeed(
          authenticatedSubject(response),
          false,
          response.locals.requestId as string,
          cancellation.signal,
        )
        response.json(
          progressEnabled && feed.data !== null
            ? {
                ...feed,
                data: {
                  ...feed.data,
                  items: await decorateProblemsForLearner(
                    authenticatedSubject(response),
                    feed.data.items.map((item) => item.problem),
                  ).then((problems) =>
                    feed.data?.items.map((item, index) => ({
                      ...item,
                      problem: problems[index] ?? item.problem,
                    })),
                  ),
                },
              }
            : feed,
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

  app.post(
    '/api/recommendations/refresh',
    requireAuthenticated,
    async (request, response) => {
      const cancellation = abortSignalForResponse(request, response)
      try {
        const feed = await recommendationService.getFeed(
          authenticatedSubject(response),
          true,
          response.locals.requestId as string,
          cancellation.signal,
        )
        response.json(
          progressEnabled && feed.data !== null
            ? {
                ...feed,
                data: {
                  ...feed.data,
                  items: await decorateProblemsForLearner(
                    authenticatedSubject(response),
                    feed.data.items.map((item) => item.problem),
                  ).then((problems) =>
                    feed.data?.items.map((item, index) => ({
                      ...item,
                      problem: problems[index] ?? item.problem,
                    })),
                  ),
                },
              }
            : feed,
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

  app.delete(
    '/api/recommendation-dismissals/:provider/:externalId',
    requireAuthenticated,
    async (request, response) => {
      const providerResult = LinkableProviderSchema.safeParse(
        request.params.provider,
      )

      if (!providerResult.success || providerResult.data !== 'codeforces') {
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
