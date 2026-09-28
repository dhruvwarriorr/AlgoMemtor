import { ApiErrorResponseSchema } from '@algomemtor/shared-contracts'

import { ProviderError } from '../errors/provider-error'
import { AiMemoryClientError } from '../integrations/ai/ai-memory-client'
import { ProviderPublicStatsError } from '../integrations/provider-accounts/provider-public-stats'
import {
  CoachConsentRequiredError,
  CoachConversationNotFoundError,
  CoachMemoryUnavailableError,
  CoachProposalNotFoundError,
  CoachProposalStateError,
  CoachUnknownTopicError,
} from '../services/coach-service'
import { MentorError } from '../services/mentor-service'

export const createApiError = (
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

// A handler throws an HttpError to end the request with an API error body;
// the route wrapper turns it into the response.
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly headers: Record<string, string> = {},
  ) {
    super(`HTTP ${status}`)
    this.name = 'HttpError'
  }
}

export const httpError = (
  status: number,
  code: string,
  message: string,
  options: { retryable?: boolean; details?: unknown } = {},
  headers: Record<string, string> = {},
) => new HttpError(status, createApiError(code, message, options), headers)

export const featureNotEnabled = () =>
  httpError(
    404,
    'PROGRESS_DISABLED',
    'Learner progress is not enabled for this environment.',
  )

export const deletionPending = () =>
  httpError(
    409,
    'LEARNER_DATA_DELETION_PENDING',
    'Learner data is temporarily hidden while deletion finishes.',
    { retryable: true },
  )

const providerName = (provider: string) =>
  provider === 'codeforces'
    ? 'Codeforces'
    : provider === 'codechef'
      ? 'CodeChef'
      : provider === 'leetcode'
        ? 'LeetCode'
        : 'CSES'

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
  const name = providerName(error.provider)

  if (error.code === 'PROVIDER_RATE_LIMITED') {
    return `${name} is temporarily rate limiting catalog requests.`
  }

  if (error.code === 'PROVIDER_INVALID_RESPONSE') {
    return `${name} returned an invalid metadata response.`
  }

  if (error.code === 'PROVIDER_BLOCKED') {
    return `${name} blocked this public data request; cached data may be shown.`
  }

  if (error.code === 'PROVIDER_TIMEOUT') {
    return `${name} took too long to respond.`
  }

  return `${name} is temporarily unavailable.`
}

export const providerHttpError = (error: ProviderError) =>
  httpError(providerStatusCode(error), error.code, providerMessage(error), {
    retryable: error.retryable,
    details: { provider: error.provider },
  })

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
  const name = providerName(error.provider)

  if (error.code === 'PROVIDER_ACCOUNT_NOT_FOUND') {
    return `No public ${name} profile was found for that handle.`
  }

  if (error.code === 'PROVIDER_RATE_LIMITED') {
    return `${name} is temporarily rate limiting profile requests.`
  }

  if (error.code === 'PROVIDER_INVALID_RESPONSE') {
    return `${name} changed or returned an invalid public profile response.`
  }

  if (error.code === 'PROVIDER_BLOCKED') {
    return `${name} blocked this public profile request; cached data may be shown.`
  }

  if (error.code === 'PROVIDER_TIMEOUT') {
    return `${name} took too long to return public profile data.`
  }

  return `${name} public profile data is temporarily unavailable.`
}

export const publicStatsHttpError = (error: ProviderPublicStatsError) =>
  httpError(
    publicStatsStatusCode(error),
    error.code,
    publicStatsMessage(error),
    {
      retryable: error.retryable,
      details: { provider: error.provider },
    },
  )

// Each mapper rethrows an error it recognises as the matching API error and
// leaves anything else for the caller (and finally the route wrapper).
export const rethrowProviderError = (error: unknown) => {
  if (error instanceof ProviderError) throw providerHttpError(error)
}

export const rethrowMemoryError = (error: unknown) => {
  if (!(error instanceof AiMemoryClientError)) return
  const status = error.code === 'AI_MEMORY_REJECTED' ? 409 : 503
  throw httpError(
    status,
    error.code,
    status === 409
      ? 'The learner memory could not be changed in its current state.'
      : 'Learner memory is temporarily unavailable.',
    { retryable: status === 503 },
  )
}

export const rethrowCoachError = (error: unknown) => {
  if (error instanceof CoachConsentRequiredError) {
    throw httpError(
      403,
      error.code,
      'Enable personalized AI coaching in Settings before starting a coach conversation.',
    )
  }
  if (
    error instanceof CoachConversationNotFoundError ||
    error instanceof CoachProposalNotFoundError
  ) {
    throw httpError(404, error.code, error.message)
  }
  if (error instanceof CoachProposalStateError) {
    throw httpError(409, error.code, error.message)
  }
  if (error instanceof CoachMemoryUnavailableError) {
    throw httpError(503, error.code, error.message, { retryable: true })
  }
  if (error instanceof CoachUnknownTopicError) {
    throw httpError(400, error.code, error.message)
  }
}

export const rethrowMentorError = (error: unknown) => {
  if (!(error instanceof MentorError)) return
  throw httpError(
    error.status,
    error.code,
    error.message,
    error.status === 429 || error.status === 503 ? { retryable: true } : {},
  )
}

// Runs `work` and converts the recognised domain errors into API errors.
export async function mapErrors<T>(
  work: () => Promise<T>,
  ...mappers: ((error: unknown) => void)[]
): Promise<T> {
  try {
    return await work()
  } catch (error) {
    for (const mapper of mappers) mapper(error)
    throw error
  }
}
