import { randomUUID } from 'node:crypto'

import {
  ApiErrorResponseSchema,
  ExternalProblemCatalogQueryParamsSchema,
} from '@algomemtor/shared-contracts'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'

import { requireAuth } from './auth/require-auth.js'
import type { SupabaseJwtVerifier } from './auth/supabase-jwt.js'
import { readCodeforcesProviderConfig } from './config/provider-config.js'
import { ProviderError } from './errors/provider-error.js'
import { CodeforcesProvider } from './integrations/codeforces/codeforces-provider.js'
import type { ProblemProvider } from './integrations/providers/problem-provider.js'
import { ProblemCatalogService } from './services/problem-catalog-service.js'
import {
  structuredLogger,
  type StructuredLogger,
} from './utils/structured-logger.js'

export type CreateAppOptions = {
  jwtVerifier?: SupabaseJwtVerifier
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

const denyUnconfiguredAuthentication: SupabaseJwtVerifier = async () => {
  throw new Error('Supabase JWT verification is not configured.')
}

export const createApp = (options: CreateAppOptions = {}) => {
  const logger = options.logger ?? structuredLogger
  const provider = options.problemProvider ?? defaultProvider()
  const jwtVerifier = options.jwtVerifier ?? denyUnconfiguredAuthentication
  const requireAuthenticated = requireAuth(jwtVerifier)
  const catalogService = new ProblemCatalogService(provider)
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
        id: (response.locals.auth as Awaited<ReturnType<SupabaseJwtVerifier>>)
          .subject,
      },
    })
  })

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

  return app
}
