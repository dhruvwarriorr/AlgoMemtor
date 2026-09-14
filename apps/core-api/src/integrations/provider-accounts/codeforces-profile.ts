import {
  ProviderProfileSchema,
  type ProviderProfile,
  type PublicProviderHandle,
} from '@algomemtor/shared-contracts'
import { z } from 'zod'

import { ProviderError } from '../../errors/provider-error.js'
import { RequestGate } from '../../utils/request-gate.js'
import {
  fetchProviderJson,
  isProviderHostnameAllowed,
  type ProviderHttpRequest,
} from '../providers/provider-http-client.js'
import {
  ProviderPublicStatsError,
  type ProviderProfileFetcher,
} from './provider-public-stats.js'

const UserInfoSchema = z
  .object({
    handle: z.string().trim().min(1),
    firstName: z.string().trim().optional(),
    lastName: z.string().trim().optional(),
    rank: z.string().trim().optional(),
    rating: z.number().finite().optional(),
    avatar: z.string().url().nullish(),
  })
  .passthrough()

const EnvelopeSchema = z.union([
  z.object({ status: z.literal('OK'), result: z.array(z.unknown()) }),
  z.object({ status: z.literal('FAILED'), comment: z.string().max(1000) }),
])

export type CodeforcesProfileFetcherOptions = {
  baseUrl?: string
  timeoutMs?: number
  maxAttempts?: number
  minRequestIntervalMs?: number
  requestGate?: RequestGate
  fetchImpl?: typeof fetch
}

export class CodeforcesProfileFetcher implements ProviderProfileFetcher {
  readonly provider = 'codeforces' as const
  private readonly endpoint: URL
  private readonly fetchImpl: typeof fetch
  private readonly requestGate: RequestGate
  private readonly timeoutMs: number
  private readonly maxAttempts: number

  constructor(options: CodeforcesProfileFetcherOptions = {}) {
    const base = new URL(options.baseUrl ?? 'https://codeforces.com/api')
    const hasCustomFetch = options.fetchImpl !== undefined
    if (
      base.protocol !== 'https:' ||
      !isProviderHostnameAllowed(
        this.provider,
        base.hostname,
        'codeforces.com',
        hasCustomFetch,
      ) ||
      base.username !== '' ||
      base.password !== '' ||
      base.port !== '' ||
      base.search !== '' ||
      base.hash !== ''
    ) {
      throw new Error('The Codeforces profile URL is unsafe.')
    }
    this.endpoint = new URL(
      'user.info',
      `${base.toString().replace(/\/+$/, '')}/`,
    )
    this.fetchImpl = options.fetchImpl ?? fetch
    this.requestGate =
      options.requestGate ??
      new RequestGate({ minIntervalMs: options.minRequestIntervalMs ?? 2100 })
    this.timeoutMs = options.timeoutMs ?? 8000
    this.maxAttempts = options.maxAttempts ?? 2
  }

  async fetchProfile(
    handle: PublicProviderHandle,
    signal?: AbortSignal,
  ): Promise<ProviderProfile> {
    const url = new URL(this.endpoint)
    url.searchParams.set('handles', handle)
    const body = await fetchProviderJson({
      provider: this.provider,
      url,
      allowedHostname: 'codeforces.com',
      requestGate: this.requestGate,
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      maxAttempts: this.maxAttempts,
      maxResponseBytes: 1_000_000,
      ...(signal === undefined ? {} : { signal }),
    } satisfies ProviderHttpRequest)
    const envelope = EnvelopeSchema.safeParse(body)
    if (!envelope.success) {
      throw new ProviderError(
        'Codeforces returned an invalid profile response.',
        {
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: this.provider,
          retryable: false,
        },
      )
    }
    if (envelope.data.status === 'FAILED') {
      throw new ProviderPublicStatsError(
        'The Codeforces account was not found.',
        {
          provider: this.provider,
          code: /not found/i.test(envelope.data.comment)
            ? 'PROVIDER_ACCOUNT_NOT_FOUND'
            : 'PROVIDER_UNAVAILABLE',
          retryable: false,
        },
      )
    }
    const raw = envelope.data.result[0]
    const parsed = UserInfoSchema.safeParse(raw)
    if (!parsed.success) {
      throw new ProviderError(
        'Codeforces returned an invalid profile record.',
        {
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: this.provider,
          retryable: false,
        },
      )
    }
    const displayName = [parsed.data.firstName, parsed.data.lastName]
      .filter(Boolean)
      .join(' ')
    const profileUrl = new URL(
      `/profile/${encodeURIComponent(parsed.data.handle)}`,
      'https://codeforces.com',
    ).toString()
    const fetchedAt = new Date().toISOString()
    return ProviderProfileSchema.parse({
      provider: this.provider,
      externalId: parsed.data.handle,
      handle: parsed.data.handle,
      ...(displayName === '' ? {} : { displayName }),
      profileUrl,
      ...(parsed.data.avatar === undefined ||
      parsed.data.avatar === null ||
      !parsed.data.avatar.startsWith('https://')
        ? {}
        : { avatarUrl: parsed.data.avatar }),
      ...(parsed.data.rank === undefined ? {} : { rank: parsed.data.rank }),
      ...(parsed.data.rating === undefined
        ? {}
        : { rating: parsed.data.rating }),
      languageCounts: {},
      topicCounts: {},
      badges: [],
      calendar: {},
      completeness: 'partial',
      provenance: {
        provider: this.provider,
        providerId: parsed.data.handle,
        canonicalUrl: profileUrl,
        sourceUrl: url.toString(),
        extractionStrategy: 'official_json',
        schemaVersion: 'codeforces-user-info-v1',
        completeness: 'partial',
        fetchedAt,
        stale: false,
      },
    })
  }
}
