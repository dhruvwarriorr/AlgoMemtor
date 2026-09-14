import type { ProviderKey } from '@algomemtor/shared-contracts'

export type ProviderErrorCode =
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_BLOCKED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_INVALID_RESPONSE'

export type ProviderErrorOptions = {
  code: ProviderErrorCode
  provider: ProviderKey
  retryable: boolean
  details?: unknown
  cause?: unknown
}

export class ProviderError extends Error {
  readonly code: ProviderErrorCode
  readonly provider: ProviderKey
  readonly retryable: boolean
  readonly details?: unknown

  constructor(message: string, options: ProviderErrorOptions) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    )

    this.name = 'ProviderError'
    this.code = options.code
    this.provider = options.provider
    this.retryable = options.retryable
    this.details = options.details

    Object.setPrototypeOf(this, new.target.prototype)
  }
}
