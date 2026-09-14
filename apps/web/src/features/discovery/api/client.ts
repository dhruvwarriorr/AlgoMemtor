import { ApiErrorResponseSchema } from '@algomemtor/shared-contracts'

import { authenticatedFetch } from '@/features/auth/authenticated-fetch'

type ValidationResult<T> =
  { success: true; data: T } | { success: false; error: { issues: unknown } }

type ResponseSchema<T> = {
  safeParse: (value: unknown) => ValidationResult<T>
}

type JsonRequestOptions<T> = Omit<RequestInit, 'signal'> & {
  authentication?: 'required'
  schema: ResponseSchema<T>
  signal?: AbortSignal
}

export class ApiClientError extends Error {
  readonly status?: number
  readonly code?: string
  readonly details?: unknown

  constructor(
    message: string,
    options: {
      status?: number
      code?: string
      details?: unknown
      cause?: unknown
    } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'ApiClientError'
    this.status = options.status
    this.code = options.code
    this.details = options.details
  }
}

function fallbackHttpMessage(status: number) {
  if (status === 429) {
    return 'The provider is receiving too many requests. Please try again shortly.'
  }

  if (status === 503) {
    return 'The problem provider is temporarily unavailable. Please try again.'
  }

  return 'The request could not be completed. Please try again.'
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  { authentication, schema, signal, ...init }: JsonRequestOptions<T>,
): Promise<T> {
  let response: Response

  try {
    const request = authentication === 'required' ? authenticatedFetch : fetch
    response = await request(input, { ...init, signal })
  } catch (error) {
    if (signal?.aborted) {
      throw error
    }

    throw new ApiClientError(
      'Unable to reach the application service. Check your connection and try again.',
      { code: 'NETWORK_ERROR', cause: error },
    )
  }

  let body: unknown

  if (response.status === 204) {
    body = null
  } else {
    try {
      body = await response.json()
    } catch (error) {
      throw new ApiClientError(
        response.ok
          ? 'The application service returned an unreadable response.'
          : fallbackHttpMessage(response.status),
        {
          status: response.status,
          code: response.ok ? 'INVALID_JSON_RESPONSE' : 'HTTP_ERROR',
          cause: error,
        },
      )
    }
  }

  if (response.status === 204) {
    const result = schema.safeParse(body)
    if (!result.success) {
      throw new ApiClientError(
        'The application service returned an unexpected response.',
        {
          status: response.status,
          code: 'INVALID_RESPONSE',
          details: result.error.issues,
        },
      )
    }
    return result.data
  }

  if (!response.ok) {
    const apiErrorResult = ApiErrorResponseSchema.safeParse(body)

    if (apiErrorResult.success) {
      throw new ApiClientError(apiErrorResult.data.error.message, {
        status: response.status,
        code: apiErrorResult.data.error.code,
        details: apiErrorResult.data.error.details,
      })
    }

    throw new ApiClientError(fallbackHttpMessage(response.status), {
      status: response.status,
      code: 'HTTP_ERROR',
    })
  }

  const result = schema.safeParse(body)

  if (!result.success) {
    throw new ApiClientError(
      'The application service returned an unexpected response.',
      {
        status: response.status,
        code: 'INVALID_RESPONSE',
        details: result.error.issues,
      },
    )
  }

  return result.data
}
