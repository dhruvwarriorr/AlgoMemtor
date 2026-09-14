import {
  ProviderProfileSchema,
  type ProviderProfile,
  type PublicProviderHandle,
} from '@algomemtor/shared-contracts'

import { RequestGate } from '../../utils/request-gate.js'
import {
  fetchProviderText,
  isProviderHostnameAllowed,
  type ProviderHttpRequest,
} from '../providers/provider-http-client.js'
import { providerHtmlToText } from '../providers/provider-html-sanitizer.js'
import {
  isCodeChefChallengePage,
  parseCodeChefSolvedCount,
} from './codechef-public-stats.js'
import {
  ProviderPublicStatsError,
  type ProviderProfileFetcher,
} from './provider-public-stats.js'

const numberFrom = (html: string, pattern: RegExp) => {
  const value = pattern.exec(html)?.[1]?.replaceAll(',', '')
  if (value === undefined) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

export type CodeChefProfileFetcherOptions = {
  baseUrl?: string
  timeoutMs?: number
  maxAttempts?: number
  minRequestIntervalMs?: number
  requestGate?: RequestGate
  fetchImpl?: typeof fetch
}

export class CodeChefProfileFetcher implements ProviderProfileFetcher {
  readonly provider = 'codechef' as const
  private readonly baseUrl: URL
  private readonly fetchImpl: typeof fetch
  private readonly requestGate: RequestGate
  private readonly timeoutMs: number
  private readonly maxAttempts: number

  constructor(options: CodeChefProfileFetcherOptions = {}) {
    this.baseUrl = new URL(options.baseUrl ?? 'https://www.codechef.com/users/')
    const hasCustomFetch = options.fetchImpl !== undefined
    if (
      this.baseUrl.protocol !== 'https:' ||
      !isProviderHostnameAllowed(
        this.provider,
        this.baseUrl.hostname,
        'www.codechef.com',
        hasCustomFetch,
      ) ||
      this.baseUrl.username !== '' ||
      this.baseUrl.password !== '' ||
      this.baseUrl.port !== '' ||
      this.baseUrl.search !== '' ||
      this.baseUrl.hash !== '' ||
      !this.baseUrl.pathname.endsWith('/users/')
    ) {
      throw new Error('The CodeChef profile URL is unsafe.')
    }
    this.fetchImpl = options.fetchImpl ?? fetch
    this.requestGate =
      options.requestGate ??
      new RequestGate({ minIntervalMs: options.minRequestIntervalMs ?? 1000 })
    this.timeoutMs = options.timeoutMs ?? 8000
    this.maxAttempts = options.maxAttempts ?? 2
  }

  async fetchProfile(
    handle: PublicProviderHandle,
    signal?: AbortSignal,
  ): Promise<ProviderProfile> {
    const url = new URL(encodeURIComponent(handle), this.baseUrl)
    const html = await fetchProviderText({
      provider: this.provider,
      url,
      allowedHostname: 'www.codechef.com',
      requestGate: this.requestGate,
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      maxAttempts: this.maxAttempts,
      maxResponseBytes: 3_000_000,
      ...(signal === undefined ? {} : { signal }),
    } satisfies ProviderHttpRequest)
    if (isCodeChefChallengePage(html)) {
      throw new ProviderPublicStatsError(
        'CodeChef blocked public profile data.',
        {
          provider: this.provider,
          code: 'PROVIDER_BLOCKED',
          retryable: false,
        },
      )
    }
    const solvedCount = parseCodeChefSolvedCount(html)
    if (solvedCount === null) {
      throw new ProviderPublicStatsError(
        'The CodeChef profile response is invalid.',
        {
          provider: this.provider,
          code: 'PROVIDER_INVALID_RESPONSE',
          retryable: false,
        },
      )
    }
    const rating = numberFrom(
      html,
      /class=["'][^"']*rating-number[^"']*["'][^>]*>\s*([0-9][0-9,]*)/i,
    )
    const globalRank = numberFrom(
      html,
      /<div[^>]*class=["'][^"']*rating-ranks[^"']*["'][\s\S]*?<strong>\s*([0-9][0-9,]*)\s*<\/strong>[\s\S]*?Global Rank/i,
    )
    const displayName = providerHtmlToText(
      /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? '',
    )
    const profileUrl = new URL(
      `/users/${encodeURIComponent(handle)}`,
      'https://www.codechef.com',
    ).toString()
    const fetchedAt = new Date().toISOString()
    return ProviderProfileSchema.parse({
      provider: this.provider,
      externalId: handle,
      handle,
      ...(displayName === '' ? {} : { displayName }),
      profileUrl,
      ...(rating === undefined ? {} : { rating }),
      ...(globalRank === undefined ? {} : { rank: String(globalRank) }),
      solvedCount,
      languageCounts: {},
      topicCounts: {},
      badges: [],
      calendar: {},
      completeness: 'partial',
      provenance: {
        provider: this.provider,
        providerId: handle,
        canonicalUrl: profileUrl,
        sourceUrl: url.toString(),
        extractionStrategy: 'sanitized_html',
        schemaVersion: 'codechef-profile-html-v2',
        completeness: 'partial',
        fetchedAt,
        stale: false,
      },
    })
  }
}
