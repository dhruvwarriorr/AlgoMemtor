import { RequestGate } from '../../utils/request-gate.js'
import {
  fetchWithTimeout,
  invalidProviderResponse,
  readLimitedResponseText,
  throwForProviderHttpStatus,
  waitForProviderRequest,
} from './provider-fetch-utils.js'
import {
  ProviderPublicStatsError,
  type ProviderPublicStatsFetcher,
} from './provider-public-stats.js'

const solvedCountPattern =
  /<h3[^>]*>\s*Total\s+Problems\s+Solved:\s*([0-9][0-9,]*)\s*<\/h3>/i
const solvedSectionPattern =
  /<section\b[^>]*class=["'][^"']*problems-solved[^"']*["'][^>]*>[\s\S]*?<\/section>/i

export function parseCodeChefSolvedCount(html: string) {
  const section = solvedSectionPattern.exec(html)?.[0]

  if (section === undefined) {
    return null
  }

  const match = solvedCountPattern.exec(section)

  if (match?.[1] === undefined) {
    return null
  }

  const count = Number(match[1].replaceAll(',', ''))
  return Number.isSafeInteger(count) && count >= 0 ? count : null
}

export type CodeChefPublicStatsOptions = {
  baseUrl?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
  requestGate?: RequestGate
  now?: () => Date
}

export class CodeChefPublicStatsFetcher implements ProviderPublicStatsFetcher {
  readonly provider = 'codechef' as const

  private readonly baseUrl: URL
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  private readonly requestGate: RequestGate
  private readonly now: () => Date

  constructor(options: CodeChefPublicStatsOptions = {}) {
    this.baseUrl = new URL(options.baseUrl ?? 'https://www.codechef.com/users/')
    this.timeoutMs = options.timeoutMs ?? 8000
    this.fetchImpl = options.fetchImpl ?? fetch
    this.requestGate =
      options.requestGate ?? new RequestGate({ minIntervalMs: 1000 })
    this.now = options.now ?? (() => new Date())

    if (
      this.baseUrl.protocol !== 'https:' ||
      !this.baseUrl.pathname.endsWith('/users/') ||
      this.timeoutMs <= 0
    ) {
      throw new Error('The CodeChef public-statistics config is invalid.')
    }
  }

  async fetchSolvedCount(handle: string, signal?: AbortSignal) {
    await waitForProviderRequest(this.provider, this.requestGate, signal)
    const endpoint = new URL(encodeURIComponent(handle), this.baseUrl)
    const response = await fetchWithTimeout({
      provider: this.provider,
      url: endpoint,
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
      ...(signal === undefined ? {} : { signal }),
      init: {
        redirect: 'manual',
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent': 'AlgoMemtor/0.1 public-profile-stats',
        },
      },
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      const redirectedUrl =
        location === null ? null : new URL(location, endpoint)

      if (
        redirectedUrl?.origin === this.baseUrl.origin &&
        redirectedUrl.pathname === '/'
      ) {
        throw new ProviderPublicStatsError(
          'The CodeChef account was not found.',
          {
            provider: this.provider,
            code: 'PROVIDER_ACCOUNT_NOT_FOUND',
            retryable: false,
          },
        )
      }

      throw new ProviderPublicStatsError(
        'CodeChef redirected the public profile request unexpectedly.',
        {
          provider: this.provider,
          code: 'PROVIDER_UNAVAILABLE',
          retryable: false,
        },
      )
    }

    throwForProviderHttpStatus(this.provider, response)
    const html = await readLimitedResponseText(
      this.provider,
      response,
      3_000_000,
    )
    const solvedCount = parseCodeChefSolvedCount(html)

    if (solvedCount === null) {
      throw invalidProviderResponse(this.provider)
    }

    return {
      solvedCount,
      complete: true,
      source: 'codechef_public_profile_html' as const,
      fetchedAt: this.now(),
    }
  }
}
