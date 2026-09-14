import {
  ExternalContestSchema,
  ProviderWarningSchema,
  type ExternalContest,
} from '@algomemtor/shared-contracts'

import { ProviderError } from '../../errors/provider-error.js'
import { RequestGate } from '../../utils/request-gate.js'
import {
  fetchProviderJson,
  isProviderHostnameAllowed,
  type ProviderHttpRequest,
} from '../providers/provider-http-client.js'
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
  CodeforcesContestEnvelopeSchema,
  CodeforcesContestRecordSchema,
} from './codeforces-contest-schemas.js'
import { createCodeforcesContestUrl } from './codeforces-contest-url.js'

export type CodeforcesContestProviderOptions = {
  baseUrl?: string
  cacheTtlMs?: number
  timeoutMs?: number
  maxAttempts?: number
  minRequestIntervalMs?: number
  requestGate?: RequestGate
  fetchImpl?: typeof fetch
  cache?: ContestCache
  now?: () => number
}

const statusForPhase = (phase: string): ExternalContest['status'] => {
  if (phase === 'BEFORE') return 'upcoming'
  if (phase === 'CODING') return 'running'
  if (phase === 'FINISHED') return 'finished'
  return 'unknown'
}

const toIso = (seconds: number | undefined) => {
  if (seconds === undefined) return undefined
  const value = new Date(seconds * 1000)
  return Number.isFinite(value.getTime()) ? value.toISOString() : undefined
}

export class CodeforcesContestProvider implements ContestProvider {
  readonly key = 'codeforces' as const
  private readonly catalog: CachedContestProvider

  constructor(options: CodeforcesContestProviderOptions = {}) {
    const base = new URL(options.baseUrl ?? 'https://codeforces.com/api')
    const hasCustomFetch = options.fetchImpl !== undefined
    if (
      base.protocol !== 'https:' ||
      !isProviderHostnameAllowed(
        this.key,
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
      throw new Error(
        'The Codeforces contest API URL must be an HTTPS codeforces.com URL without credentials or a custom port.',
      )
    }
    const endpoint = new URL('contest.list', `${base.toString().replace(/\/+$/, '')}/`)
    const requestGate =
      options.requestGate ??
      new RequestGate({ minIntervalMs: options.minRequestIntervalMs ?? 2100 })
    const fetchCatalog: CachedContestProviderOptions['fetchContests'] = async (
      request,
    ) => {
      const body = await fetchProviderJson({
        provider: this.key,
        url: endpoint,
        allowedHostname: 'codeforces.com',
        requestGate,
        ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
        ...(options.maxAttempts === undefined ? {} : { maxAttempts: options.maxAttempts }),
        maxResponseBytes: 8_000_000,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
        ...(request.requestId === undefined ? {} : { requestId: request.requestId }),
      } satisfies ProviderHttpRequest)
      const envelope = CodeforcesContestEnvelopeSchema.safeParse(body)
      if (!envelope.success) {
        throw new ProviderError('Codeforces returned an invalid contest response.', {
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: this.key,
          retryable: false,
        })
      }
      if (envelope.data.status === 'FAILED') {
        throw new ProviderError('Codeforces rejected the contest request.', {
          code: 'PROVIDER_UNAVAILABLE',
          provider: this.key,
          retryable: /limit/i.test(envelope.data.comment),
        })
      }
      const fetchedAt = new Date().toISOString()
      const contests: ExternalContest[] = []
      let invalid = 0
      for (const raw of envelope.data.result) {
        const parsed = CodeforcesContestRecordSchema.safeParse(raw)
        if (!parsed.success) {
          invalid += 1
          continue
        }
        const record = parsed.data
        let canonicalUrl: string
        try {
          canonicalUrl = createCodeforcesContestUrl(record.id)
        } catch {
          invalid += 1
          continue
        }
        const startsAt = toIso(record.startTimeSeconds)
        const endsAt =
          startsAt === undefined || record.durationSeconds === undefined
            ? undefined
            : toIso(
                (Date.parse(startsAt) + record.durationSeconds * 1000) / 1000,
              )
        const candidate = ExternalContestSchema.safeParse({
          provider: this.key,
          externalId: String(record.id),
          name: record.name,
          canonicalUrl,
          phase: record.phase,
          ...(startsAt === undefined ? {} : { startsAt }),
          ...(endsAt === undefined ? {} : { endsAt }),
          ...(record.durationSeconds === undefined
            ? {}
            : { durationSeconds: record.durationSeconds }),
          isRated: record.type !== 'GYM' && record.type !== 'IOI',
          status: statusForPhase(record.phase),
          provenance: {
            provider: this.key,
            providerId: String(record.id),
            canonicalUrl,
            sourceUrl: endpoint.toString(),
            extractionStrategy: 'official_json',
            schemaVersion: 'codeforces-contest-list-v1',
            completeness: 'complete',
            fetchedAt,
            stale: false,
          },
        })
        if (candidate.success) contests.push(candidate.data)
        else invalid += 1
      }
      if (contests.length === 0) {
        throw new ProviderError('Codeforces returned no valid contests.', {
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
                  message: 'Some Codeforces contest records were rejected during validation.',
                }),
              ],
      }
    }
    this.catalog = new CachedContestProvider({
      key: this.key,
      label: 'Codeforces',
      fetchContests: fetchCatalog,
      ...(options.cacheTtlMs === undefined ? {} : { cacheTtlMs: options.cacheTtlMs }),
      ...(options.cache === undefined ? {} : { cache: options.cache }),
      ...(options.now === undefined ? {} : { now: options.now }),
    })
  }

  getHealth() {
    return this.catalog.getHealth()
  }

  list(query?: ProviderContestQuery, request?: ContestProviderRequest): Promise<ContestProviderSearchResult> {
    return this.catalog.list(query, request)
  }
}
