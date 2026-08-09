import { describe, expect, it } from 'vitest'

import { ProviderError } from './provider-error.js'

describe('ProviderError', () => {
  it('preserves its stable fields and Error identity', () => {
    const error = new ProviderError('The provider request timed out.', {
      code: 'PROVIDER_TIMEOUT',
      provider: 'codeforces',
      retryable: true,
    })

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ProviderError)
    expect(error.name).toBe('ProviderError')
    expect(error.message).toBe('The provider request timed out.')
    expect(error.code).toBe('PROVIDER_TIMEOUT')
    expect(error.provider).toBe('codeforces')
    expect(error.retryable).toBe(true)
  })

  it('preserves optional details and cause', () => {
    const cause = new Error('request failed')
    const details = { retryAfterSeconds: 30 }

    const error = new ProviderError(
      'The provider is receiving too many requests.',
      {
        code: 'PROVIDER_RATE_LIMITED',
        provider: 'codeforces',
        retryable: false,
        details,
        cause,
      },
    )

    expect(error.retryable).toBe(false)
    expect(error.details).toBe(details)
    expect(error.cause).toBe(cause)
  })
})
