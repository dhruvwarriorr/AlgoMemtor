import {
  ExternalContestSchema,
  ProviderWarningSchema,
  type ExternalContest,
} from '@algomemtor/shared-contracts'

import { ProviderError } from '../../errors/provider-error'
import { RequestGate } from '../../utils/request-gate'
import {
  CachedContestProvider,
  type CachedContestProviderOptions,
} from '../providers/cached-contest-provider'
import type { ContestCache } from '../providers/contest-cache'
import type {
  ContestProvider,
  ContestProviderRequest,
  ContestProviderSearchResult,
  ProviderContestQuery,
} from '../providers/contest-provider'
import {
  fetchProviderJson,
  isProviderHostnameAllowed,
} from '../providers/provider-http-client'
import {
  CodeChefContestRecordSchema,
  CodeChefContestsEnvelopeSchema,
} from './codechef-contest-schemas'
import { createCodeChefContestUrl } from './codechef-contest-url'

export type CodeChefContestProviderOptions = {
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

const numeric = (value: string | number | undefined) => {
  if (value === undefined) return undefined
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const dateValue = (value: string | undefined) => {
  if (value === undefined) return undefined
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined
}

const isRated = (name: string) => /rated/i.test(name)

export class CodeChefContestProvider implements ContestProvider {
  readonly key = 'codechef' as const
  private readonly catalog: CachedContestProvider

  constructor(options: CodeChefContestProviderOptions = {}) {
    const base = new URL(options.baseUrl ?? 'https://www.codechef.com')
    const hasCustomFetch = options.fetchImpl !== undefined
    if (
      base.protocol !== 'https:' ||
      !isProviderHostnameAllowed(
        this.key,
        base.hostname,
        'www.codechef.com',
        hasCustomFetch,
      ) ||
      base.username !== '' ||
      base.password !== '' ||
      base.port !== '' ||
      base.search !== '' ||
      base.hash !== ''
    ) {
      throw new Error(
        'The CodeChef contest API URL must be an HTTPS www.codechef.com URL without credentials or a custom port.',
      )
    }
    const endpoint = new URL('/api/list/contests/all', base)
    const now = options.now ?? (() => Date.now())
    const requestGate =
      options.requestGate ??
      new RequestGate({ minIntervalMs: options.minRequestIntervalMs ?? 1000 })
    const fetchContests: CachedContestProviderOptions['fetchContests'] = async (
      request,
    ) => {
      const body = await fetchProviderJson({
        provider: this.key,
        url: endpoint,
        allowedHostname: 'www.codechef.com',
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
      const envelope = CodeChefContestsEnvelopeSchema.safeParse(body)
      if (!envelope.success || envelope.data.status === 'error') {
        throw new ProviderError(
          'CodeChef returned an invalid contest response.',
          {
            code: 'PROVIDER_INVALID_RESPONSE',
            provider: this.key,
            retryable: false,
          },
        )
      }
      const fetchedAt = new Date().toISOString()
      const contests: ExternalContest[] = []
      let invalid = 0
      const buckets: Array<
        readonly [string, readonly unknown[], ExternalContest['status']]
      > = [
        ['present_contests', envelope.data.present_contests, 'running'],
        ['future_contests', envelope.data.future_contests, 'upcoming'],
        ['past_contests', envelope.data.past_contests, 'finished'],
        ['practice_contests', envelope.data.practice_contests, 'unknown'],
        ['skill_tests', envelope.data.skill_tests, 'unknown'],
      ]
      for (const [, records, bucketStatus] of buckets) {
        for (const raw of records) {
          const parsed = CodeChefContestRecordSchema.safeParse(raw)
          if (!parsed.success) {
            invalid += 1
            continue
          }
          const record = parsed.data
          let canonicalUrl: string
          try {
            canonicalUrl = createCodeChefContestUrl(record.contest_code)
          } catch {
            invalid += 1
            continue
          }
          const startsAt = dateValue(record.contest_start_date_iso)
          const endsAt = dateValue(record.contest_end_date_iso)
          const duration = numeric(record.contest_duration)
          const status =
            bucketStatus === 'unknown' &&
            startsAt !== undefined &&
            endsAt !== undefined
              ? Date.parse(startsAt) > now()
                ? 'upcoming'
                : Date.parse(endsAt) < now()
                  ? 'finished'
                  : 'running'
              : bucketStatus
          const candidate = ExternalContestSchema.safeParse({
            provider: this.key,
            externalId: String(record.contest_id),
            name: record.contest_name,
            canonicalUrl,
            ...(startsAt === undefined ? {} : { startsAt }),
            ...(endsAt === undefined ? {} : { endsAt }),
            ...(duration === undefined
              ? {}
              : { durationSeconds: Math.round(duration * 60) }),
            isRated: isRated(record.contest_name),
            status,
            provenance: {
              provider: this.key,
              providerId: String(record.contest_id),
              canonicalUrl,
              sourceUrl: endpoint.toString(),
              extractionStrategy: 'official_json',
              schemaVersion: 'codechef-contest-list-v1',
              completeness: 'complete',
              fetchedAt,
              stale: false,
            },
          })
          if (candidate.success) contests.push(candidate.data)
          else invalid += 1
        }
      }
      if (contests.length === 0) {
        throw new ProviderError('CodeChef returned no valid contests.', {
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
                    'Some CodeChef contest records were rejected during validation.',
                }),
              ],
      }
    }
    this.catalog = new CachedContestProvider({
      key: this.key,
      label: 'CodeChef',
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
