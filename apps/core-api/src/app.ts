import { randomUUID } from 'node:crypto'

import {
  ApiErrorResponseSchema,
  DisconnectProviderAccountResponseSchema,
  ExternalProblemCatalogQueryParamsSchema,
  LearnerProfileResponseSchema,
  LinkableProviderSchema,
  LinkProviderAccountRequestSchema,
  ProviderAccountResponseSchema,
  ProviderAccountsResponseSchema,
  RefreshProviderPublicStatsRequestSchema,
  SaveLearnerProfileRequestSchema,
} from '@algomemtor/shared-contracts'
import cors from 'cors'
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express'
import helmet from 'helmet'

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
  InMemoryProviderAccountRepository,
  type ProviderAccountRepository,
} from './repositories/provider-account-repository.js'
import { ProblemCatalogService } from './services/problem-catalog-service.js'
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
  providerAccountRepository?: ProviderAccountRepository
  providerPublicStatsFetchers?: readonly ProviderPublicStatsFetcher[]
  problemProvider?: ProblemProvider
  logger?: StructuredLogger
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
  const providerAccountStatsService = new ProviderAccountStatsService({
    repository: providerAccountRepository,
    fetchers:
      options.providerPublicStatsFetchers ??
      defaultProviderPublicStatsFetchers(),
    logger,
  })
  const app = express()

  app.use(helmet())
  app.use(
    cors({
      origin:
        options.webOrigin ?? process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    }),
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

      const profile = await learnerProfileRepository.upsertByAuthUserId(
        authenticatedSubject(response),
        profileResult.data,
      )

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
      response.json(
        await catalogService.getProblems(
          queryResult.data,
          response.locals.requestId as string,
        ),
      )
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

  app.use(
    (
      error: unknown,
      request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
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
