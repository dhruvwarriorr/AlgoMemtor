import { ProviderError } from '../../errors/provider-error'
import {
  sleepWithSignal,
  type RequestGate,
  type RequestGateSleep,
} from '../../utils/request-gate'
import {
  structuredLogger,
  type StructuredLogger,
} from '../../utils/structured-logger'
import type { ProviderKey } from '@algomemtor/shared-contracts'

export type ProviderHttpRequest = {
  provider: ProviderKey
  url: URL
  allowedHostname: string
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  responseType?: 'json' | 'text'
  signal?: AbortSignal
  timeoutMs?: number
  maxAttempts?: number
  retryBaseDelayMs?: number
  maxResponseBytes?: number
  requestGate: RequestGate
  fetchImpl?: typeof fetch
  logger?: StructuredLogger
  random?: () => number
  sleep?: RequestGateSleep
  requestId?: string
}

const providerTestHostname = (provider: ProviderKey) =>
  provider === 'codeforces'
    ? 'codeforces.test'
    : provider === 'codechef'
      ? 'codechef.test'
      : provider === 'leetcode'
        ? 'leetcode.test'
        : 'cses.test'

export const isProviderHostnameAllowed = (
  provider: ProviderKey,
  hostname: string,
  allowedHostname: string,
  hasCustomFetch: boolean,
) =>
  hostname === allowedHostname ||
  (hasCustomFetch &&
    (hostname === providerTestHostname(provider) ||
      hostname.endsWith(`.${providerTestHostname(provider)}`)))

const invalidResponseError = (provider: ProviderKey) =>
  new ProviderError(`${provider} returned an invalid response.`, {
    code: 'PROVIDER_INVALID_RESPONSE',
    provider,
    retryable: false,
  })

const unavailableError = (provider: ProviderKey, status?: number) =>
  new ProviderError(`${provider} is temporarily unavailable.`, {
    code: 'PROVIDER_UNAVAILABLE',
    provider,
    retryable: status !== undefined && status >= 500,
    ...(status === undefined ? {} : { details: { httpStatus: status } }),
  })

const assertSafeEndpoint = (request: ProviderHttpRequest) => {
  if (
    request.url.protocol !== 'https:' ||
    !isProviderHostnameAllowed(
      request.provider,
      request.url.hostname,
      request.allowedHostname,
      request.fetchImpl !== undefined,
    ) ||
    request.url.username !== '' ||
    request.url.password !== '' ||
    request.url.port !== ''
  ) {
    throw new Error(`Unsafe ${request.provider} provider endpoint.`)
  }
}

const fetchProviderResponse = async (request: ProviderHttpRequest) => {
  assertSafeEndpoint(request)
  const fetchImpl = request.fetchImpl ?? fetch
  const logger = request.logger ?? structuredLogger
  const random = request.random ?? Math.random
  const sleep = request.sleep ?? sleepWithSignal
  const timeoutMs = request.timeoutMs ?? 8000
  const maxAttempts = request.maxAttempts ?? 2
  const retryBaseDelayMs = request.retryBaseDelayMs ?? 250
  const maxResponseBytes = request.maxResponseBytes ?? 3_000_000

  if (
    timeoutMs <= 0 ||
    maxAttempts < 1 ||
    retryBaseDelayMs < 0 ||
    maxResponseBytes <= 0
  ) {
    throw new Error('The provider HTTP configuration is invalid.')
  }

  let lastError: ProviderError | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await request.requestGate.wait(request.signal)
      const timeoutSignal = AbortSignal.timeout(timeoutMs)
      const combinedSignal =
        request.signal === undefined
          ? timeoutSignal
          : AbortSignal.any([request.signal, timeoutSignal])
      let response: Response

      try {
        response = await fetchImpl(request.url, {
          method: request.method ?? 'GET',
          headers: {
            accept: 'application/json',
            'user-agent': 'AlgoMemtor/1.0 (public provider integration)',
            ...(request.headers ?? {}),
          },
          ...(request.body === undefined ? {} : { body: request.body }),
          redirect: 'manual',
          signal: combinedSignal,
        })
      } catch (error) {
        if (request.signal?.aborted) {
          throw new ProviderError('The provider request was cancelled.', {
            code: 'PROVIDER_UNAVAILABLE',
            provider: request.provider,
            retryable: false,
            cause: error,
          })
        }
        if (timeoutSignal.aborted) {
          throw new ProviderError('The provider request timed out.', {
            code: 'PROVIDER_TIMEOUT',
            provider: request.provider,
            retryable: true,
            cause: error,
          })
        }
        throw new ProviderError('The provider is temporarily unavailable.', {
          code: 'PROVIDER_UNAVAILABLE',
          provider: request.provider,
          retryable: true,
          cause: error,
        })
      }

      if (response.status === 429) {
        throw new ProviderError('The provider is rate limiting requests.', {
          code: 'PROVIDER_RATE_LIMITED',
          provider: request.provider,
          retryable: true,
          details: { retryAfter: response.headers.get('retry-after') },
        })
      }

      if (response.status === 403) {
        throw new ProviderError('The provider blocked this public request.', {
          code: 'PROVIDER_BLOCKED',
          provider: request.provider,
          retryable: false,
          details: { httpStatus: response.status },
        })
      }

      if (response.status >= 300 && response.status < 400) {
        throw new ProviderError('The provider redirected a public request.', {
          code: 'PROVIDER_BLOCKED',
          provider: request.provider,
          retryable: false,
          details: { httpStatus: response.status },
        })
      }

      const contentType = response.headers.get('content-type')?.toLowerCase()
      if (
        contentType !== undefined &&
        request.responseType === 'json' &&
        !contentType.includes('application/json') &&
        !contentType.includes('+json')
      ) {
        throw invalidResponseError(request.provider)
      }
      if (
        contentType !== undefined &&
        request.responseType === 'text' &&
        !contentType.includes('text/html') &&
        !contentType.includes('application/xhtml+xml') &&
        !contentType.includes('text/plain')
      ) {
        throw invalidResponseError(request.provider)
      }

      if (!response.ok) {
        throw unavailableError(request.provider, response.status)
      }

      if (response.url !== '') {
        const responseUrl = new URL(response.url)
        if (
          responseUrl.protocol !== 'https:' ||
          !isProviderHostnameAllowed(
            request.provider,
            responseUrl.hostname,
            request.allowedHostname,
            request.fetchImpl !== undefined,
          ) ||
          responseUrl.username !== '' ||
          responseUrl.password !== '' ||
          responseUrl.port !== ''
        ) {
          throw new ProviderError(
            'The provider redirected to an unsafe host.',
            {
              code: 'PROVIDER_BLOCKED',
              provider: request.provider,
              retryable: false,
            },
          )
        }
      }

      const contentLength = Number(response.headers.get('content-length'))
      if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
        throw invalidResponseError(request.provider)
      }
      return response
    } catch (error) {
      const providerError =
        error instanceof ProviderError
          ? error
          : new ProviderError('The provider request was cancelled.', {
              code: 'PROVIDER_UNAVAILABLE',
              provider: request.provider,
              retryable: false,
              cause: error,
            })
      lastError = providerError

      logger.warn('provider_http_request_failed', {
        provider: request.provider,
        attempt,
        errorCode: providerError.code,
        retryable: providerError.retryable,
        ...(request.requestId === undefined
          ? {}
          : { requestId: request.requestId }),
      })

      const shouldRetry =
        providerError.retryable &&
        providerError.code !== 'PROVIDER_RATE_LIMITED' &&
        providerError.code !== 'PROVIDER_BLOCKED' &&
        attempt < maxAttempts

      if (!shouldRetry) {
        throw providerError
      }

      const backoffMs =
        retryBaseDelayMs * 2 ** (attempt - 1) +
        Math.floor(random() * Math.max(1, retryBaseDelayMs))
      try {
        await sleep(backoffMs, request.signal)
      } catch (sleepError) {
        throw new ProviderError('The provider request was cancelled.', {
          code: 'PROVIDER_UNAVAILABLE',
          provider: request.provider,
          retryable: false,
          cause: sleepError,
        })
      }
    }
  }

  throw lastError ?? invalidResponseError(request.provider)
}

const readProviderText = async (request: ProviderHttpRequest) => {
  const response = await fetchProviderResponse(request)
  const maxResponseBytes = request.maxResponseBytes ?? 3_000_000
  if (response.body === null) {
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > maxResponseBytes) {
      throw invalidResponseError(request.provider)
    }
    return text
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      if (result.value === undefined) continue
      size += result.value.byteLength
      if (size > maxResponseBytes) {
        try {
          await reader.cancel()
        } catch (cancelError) {
          void cancelError
        }
        throw invalidResponseError(request.provider)
      }
      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

export const fetchProviderJson = async (
  request: ProviderHttpRequest,
): Promise<unknown> => {
  const text = await readProviderText({ ...request, responseType: 'json' })
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    throw new ProviderError('The provider returned invalid JSON.', {
      code: 'PROVIDER_INVALID_RESPONSE',
      provider: request.provider,
      retryable: false,
      cause: error,
    })
  }
}

export const fetchProviderText = (request: ProviderHttpRequest) =>
  readProviderText({ ...request, responseType: 'text' })
