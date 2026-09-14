import {
  ExternalContestSchema,
  ProviderWarningSchema,
  type ExternalContest,
} from '@algomemtor/shared-contracts'

import { ProviderError } from '../../errors/provider-error.js'
import { RequestGate } from '../../utils/request-gate.js'
import {
  CachedContestProvider,
  type CachedContestProviderOptions,
} from '../providers/cached-contest-provider.js'
import type { ContestCache } from '../providers/contest-cache.js'
import type {
  ContestProvider,
  ContestProviderRequest,
  ContestProviderSearchResult,
  ProviderContestQuery,
} from '../providers/contest-provider.js'
import {
  fetchProviderJson,
  isProviderHostnameAllowed,
  type ProviderHttpRequest,
} from '../providers/provider-http-client.js'
import {
  LeetCodeContestRecordSchema,
  LeetCodeContestsEnvelopeSchema,
} from './leetcode-contest-schemas.js'
import { createLeetCodeContestUrl } from './leetcode-contest-url.js'

export type LeetCodeContestProviderOptions = {
  endpoint?: string
  cacheTtlMs?: number
  timeoutMs?: number
  maxAttempts?: number
  minRequestIntervalMs?: number
  requestGate?: RequestGate
  fetchImpl?: typeof fetch
  cache?: ContestCache
  now?: () => number
}

const query = `query allContests { allContests { title titleSlug startTime duration originStartTime isVirtual containsPremium } }`

const toIso = (seconds: number) => {
  const value = new Date(seconds * 1000)
  return Number.isFinite(value.getTime()) ? value.toISOString() : undefined
}

export class LeetCodeContestProvider implements ContestProvider {
  readonly key = 'leetcode' as const
  private readonly catalog: CachedContestProvider

  constructor(options: LeetCodeContestProviderOptions = {}) {
    const endpoint = new URL(options.endpoint ?? 'https://leetcode.com/graphql')
    const hasCustomFetch = options.fetchImpl !== undefined
    if (
      endpoint.protocol !== 'https:' ||
      !isProviderHostnameAllowed(
        this.key,
        endpoint.hostname,
        'leetcode.com',
        hasCustomFetch,
      ) ||
      endpoint.username !== '' ||
      endpoint.password !== '' ||
      endpoint.port !== '' ||
      endpoint.search !== '' ||
      endpoint.hash !== ''
    ) {
      throw new Error(
        'The LeetCode contest API URL must be an HTTPS leetcode.com URL without credentials or a custom port.',
      )
    }
    const requestGate =
      options.requestGate ??
      new RequestGate({ minIntervalMs: options.minRequestIntervalMs ?? 1000 })
    const now = options.now ?? (() => Date.now())
    const fetchContests: CachedContestProviderOptions['fetchContests'] = async (
      request,
    ) => {
      const body = await fetchProviderJson({
        provider: this.key,
        url: endpoint,
        allowedHostname: 'leetcode.com',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          referer: 'https://leetcode.com/',
        },
        body: JSON.stringify({ query, variables: {} }),
        requestGate,
        ...(options.fetchImpl === undefined
          ? {}
          : { fetchImpl: options.fetchImpl }),
        ...(options.timeoutMs === undefined
          ? {}
          : { timeoutMs: options.timeoutMs }),
        ...(options.maxAttempts === undefined
          ? {}
          : { maxAttempts: options.maxAttempts }),
        maxResponseBytes: 2_000_000,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
        ...(request.requestId === undefined
          ? {}
          : { requestId: request.requestId }),
      })
      const envelope = LeetCodeContestsEnvelopeSchema.safeParse(body)
      if (!envelope.success || envelope.data.errors?.length) {
        throw new ProviderError(
          'LeetCode returned an invalid contest response.',
          {
            code: 'PROVIDER_INVALID_RESPONSE',
            provider: this.key,
            retryable: false,
          },
        )
      }
      const fetchedAt = new Date().toISOString()
      const nowMs = now()
      const contests: ExternalContest[] = []
      let invalid = 0
      for (const raw of envelope.data.data.allContests) {
        const parsed = LeetCodeContestRecordSchema.safeParse(raw)
        if (!parsed.success) {
          invalid += 1
          continue
        }
        const record = parsed.data
        let canonicalUrl: string
        try {
          canonicalUrl = createLeetCodeContestUrl(record.titleSlug)
        } catch {
          invalid += 1
          continue
        }
        const startsAt = toIso(record.startTime)
        const endsAt = toIso(record.startTime + record.duration)
        if (startsAt === undefined || endsAt === undefined) {
          invalid += 1
          continue
        }
        const startMs = record.startTime * 1000
        const endMs = (record.startTime + record.duration) * 1000
        const status: ExternalContest['status'] =
          startMs > nowMs ? 'upcoming' : endMs < nowMs ? 'finished' : 'running'
        const candidate = ExternalContestSchema.safeParse({
          provider: this.key,
          externalId: record.titleSlug,
          name: record.title,
          canonicalUrl,
          startsAt,
          endsAt,
          durationSeconds: record.duration,
          isRated: true,
          status,
          provenance: {
            provider: this.key,
            providerId: record.titleSlug,
            canonicalUrl,
            sourceUrl: endpoint.toString(),
            extractionStrategy: 'public_graphql',
            schemaVersion: 'leetcode-contest-list-v1',
            completeness: 'complete',
            fetchedAt,
            stale: false,
          },
        })
        if (candidate.success) contests.push(candidate.data)
        else invalid += 1
      }
      if (contests.length === 0) {
        throw new ProviderError('LeetCode returned no valid contests.', {
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: this.key,
          retryable: false,
        })
      }
      return {
        contests,
        complete: true,
        warnings:
          invalid === 0
            ? []
            : [
                ProviderWarningSchema.parse({
                  provider: this.key,
                  code: 'INVALID_PROVIDER_RECORDS',
                  message:
                    'Some LeetCode contest records were rejected during validation.',
                }),
              ],
      }
    }
    this.catalog = new CachedContestProvider({
      key: this.key,
      label: 'LeetCode',
      fetchContests,
      ...(options.cacheTtlMs === undefined
        ? {}
        : { cacheTtlMs: options.cacheTtlMs }),
      ...(options.cache === undefined ? {} : { cache: options.cache }),
      ...(options.now === undefined ? {} : { now: options.now }),
    })
  }

  getHealth() {
    return this.catalog.getHealth()
  }

  list(
    query?: ProviderContestQuery,
    request?: ContestProviderRequest,
  ): Promise<ContestProviderSearchResult> {
    return this.catalog.list(query, request)
  }
}
