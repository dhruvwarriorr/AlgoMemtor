import type { LinkableProvider } from '@algomemtor/shared-contracts'

import { RequestGate } from '../../utils/request-gate.js'
import { ProviderPublicStatsError } from './provider-public-stats.js'

export async function waitForProviderRequest(
  provider: LinkableProvider,
  requestGate: RequestGate,
  signal?: AbortSignal,
) {
  try {
    await requestGate.wait(signal)
  } catch (error) {
    throw new ProviderPublicStatsError(
      `The ${provider} public-statistics request was cancelled.`,
      {
        provider,
        code: 'PROVIDER_UNAVAILABLE',
        retryable: false,
        cause: error,
      },
    )
  }
}

export async function fetchWithTimeout(options: {
  provider: LinkableProvider
  url: URL
  init?: RequestInit
  timeoutMs: number
  fetchImpl: typeof fetch
  signal?: AbortSignal
}) {
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs)
  const combinedSignal =
    options.signal === undefined
      ? timeoutSignal
      : AbortSignal.any([options.signal, timeoutSignal])

  try {
    return await options.fetchImpl(options.url, {
      ...options.init,
      signal: combinedSignal,
    })
  } catch (error) {
    if (timeoutSignal.aborted) {
      throw new ProviderPublicStatsError(
        `${options.provider} took too long to return public statistics.`,
        {
          provider: options.provider,
          code: 'PROVIDER_TIMEOUT',
          retryable: true,
          cause: error,
        },
      )
    }

    throw new ProviderPublicStatsError(
      `${options.provider} public statistics are unavailable.`,
      {
        provider: options.provider,
        code: 'PROVIDER_UNAVAILABLE',
        retryable: options.signal?.aborted !== true,
        cause: error,
      },
    )
  }
}

export function throwForProviderHttpStatus(
  provider: LinkableProvider,
  response: Response,
) {
  if (response.status === 404) {
    throw new ProviderPublicStatsError('The public account was not found.', {
      provider,
      code: 'PROVIDER_ACCOUNT_NOT_FOUND',
      retryable: false,
    })
  }

  if (response.status === 429) {
    throw new ProviderPublicStatsError(
      'The provider is rate limiting public-statistics requests.',
      {
        provider,
        code: 'PROVIDER_RATE_LIMITED',
        retryable: true,
      },
    )
  }

  if (!response.ok) {
    throw new ProviderPublicStatsError(
      'The provider could not return public statistics.',
      {
        provider,
        code: 'PROVIDER_UNAVAILABLE',
        retryable: response.status >= 500,
      },
    )
  }
}

export async function readLimitedResponseText(
  provider: LinkableProvider,
  response: Response,
  maxBytes: number,
) {
  const contentLength = Number(response.headers.get('content-length'))

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw invalidProviderResponse(provider)
  }

  if (response.body === null) {
    return ''
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let receivedBytes = 0
  let text = ''

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    receivedBytes += value.byteLength

    if (receivedBytes > maxBytes) {
      await reader.cancel()
      throw invalidProviderResponse(provider)
    }

    text += decoder.decode(value, { stream: true })
  }

  return text + decoder.decode()
}

export function invalidProviderResponse(provider: LinkableProvider) {
  return new ProviderPublicStatsError(
    'The provider returned an invalid public-statistics response.',
    {
      provider,
      code: 'PROVIDER_INVALID_RESPONSE',
      retryable: false,
    },
  )
}
