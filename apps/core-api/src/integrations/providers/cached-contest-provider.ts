import {
  ExternalContestSchema,
  ProviderFreshnessSchema,
  ProviderWarningSchema,
  type ExternalContest,
  type ProviderFreshness,
  type ProviderKey,
  type ProviderWarning,
} from '@algomemtor/shared-contracts'

import { ProviderError } from '../../errors/provider-error.js'
import {
  structuredLogger,
  type StructuredLogger,
} from '../../utils/structured-logger.js'
import type {
  ContestProvider,
  ContestProviderRequest,
  ContestProviderSearchResult,
  ContestRefreshResult,
  ProviderContestQuery,
} from './contest-provider.js'
import type { ContestCache } from './contest-cache.js'

type CacheEntry = {
  contests: ExternalContest[]
  warnings: ProviderWarning[]
  fetchedAtMs: number
  expiresAtMs: number
}

export type CachedContestProviderOptions = {
  key: ProviderKey
  label: string
  cacheTtlMs?: number
  failureCooldownMs?: number
  fetchContests: (
    request: ContestProviderRequest,
  ) => Promise<ContestRefreshResult>
  cache?: ContestCache
  logger?: StructuredLogger
  now?: () => number
}

export class CachedContestProvider implements ContestProvider {
  readonly key: ProviderKey

  private readonly label: string
  private readonly cacheTtlMs: number
  private readonly failureCooldownMs: number
  private readonly fetchContests: CachedContestProviderOptions['fetchContests']
  private readonly cacheRepository: ContestCache | undefined
  private readonly logger: StructuredLogger
  private readonly now: () => number
  private cache: CacheEntry | undefined
  private persistedLoaded = false
  private refreshPromise: Promise<CacheEntry> | undefined
  private blockedUntilMs = 0
  private lastErrorCode: string | undefined
  private health: ProviderFreshness

  constructor(options: CachedContestProviderOptions) {
    this.key = options.key
    this.label = options.label
    this.cacheTtlMs = options.cacheTtlMs ?? 900_000
    this.failureCooldownMs = options.failureCooldownMs ?? 60_000
    this.fetchContests = options.fetchContests
    this.cacheRepository = options.cache
    this.logger = options.logger ?? structuredLogger
    this.now = options.now ?? Date.now
    this.health = ProviderFreshnessSchema.parse({
      provider: this.key,
      availability: 'available',
      stale: false,
    })

    if (this.cacheTtlMs <= 0 || this.failureCooldownMs < 0) {
      throw new Error(`The ${this.key} contest configuration is invalid.`)
    }
  }

  getHealth() {
    return ProviderFreshnessSchema.parse(this.health)
  }

  async list(
    query: ProviderContestQuery = {},
    request: ContestProviderRequest = {},
  ): Promise<ContestProviderSearchResult> {
    const catalog = await this.loadCatalog(request)
    const filtered = catalog.contests
      .filter(
        (contest) =>
          query.status === undefined || contest.status === query.status,
      )
      .filter((contest) => {
        if (query.startsAfter === undefined || contest.startsAt === undefined) {
          return query.startsAfter === undefined
        }
        return new Date(contest.startsAt) >= query.startsAfter
      })
      .filter((contest) => {
        if (query.endsBefore === undefined || contest.endsAt === undefined) {
          return query.endsBefore === undefined
        }
        return new Date(contest.endsAt) <= query.endsBefore
      })
      .sort((left, right) => {
        const leftTime =
          left.startsAt === undefined
            ? Number.MAX_SAFE_INTEGER
            : Date.parse(left.startsAt)
        const rightTime =
          right.startsAt === undefined
            ? Number.MAX_SAFE_INTEGER
            : Date.parse(right.startsAt)
        return (
          leftTime - rightTime ||
          left.externalId.localeCompare(right.externalId)
        )
      })
    return {
      contests:
        query.limit === undefined ? filtered : filtered.slice(0, query.limit),
      freshness: this.getHealth(),
      warnings: catalog.warnings,
    }
  }

  private async loadCatalog(request: ContestProviderRequest) {
    await this.loadPersistedCatalog()
    const now = this.now()
    if (this.cache !== undefined && now < this.cache.expiresAtMs) {
      this.health = this.createFreshness(this.cache, false)
      return this.cache
    }
    if (
      this.cache !== undefined &&
      now < this.blockedUntilMs &&
      this.lastErrorCode !== undefined
    ) {
      this.health = this.createFreshness(this.cache, true, this.lastErrorCode)
      return this.withStaleWarning(this.cache)
    }
    if (this.refreshPromise !== undefined) {
      try {
        return await this.refreshPromise
      } catch (error) {
        return this.handleRefreshFailure(this.cache, error)
      }
    }

    const staleCache = this.cache
    this.refreshPromise = this.refresh(request).then((result) => {
      const cache: CacheEntry = {
        ...result,
        expiresAtMs: result.fetchedAtMs + this.cacheTtlMs,
      }
      this.cache = cache
      this.blockedUntilMs = 0
      this.lastErrorCode = undefined
      this.health = this.createFreshness(cache, false)
      this.persistCatalog(cache)
      return cache
    })
    try {
      return await this.refreshPromise
    } catch (error) {
      return this.handleRefreshFailure(staleCache, error)
    } finally {
      this.refreshPromise = undefined
    }
  }

  private async loadPersistedCatalog() {
    if (this.persistedLoaded || this.cacheRepository === undefined) return
    this.persistedLoaded = true
    try {
      const persisted = await this.cacheRepository.findByProvider(this.key)
      if (persisted === null || this.cache !== undefined) return
      this.cache = {
        contests: persisted.contests,
        warnings:
          persisted.availability === 'available'
            ? []
            : [
                ProviderWarningSchema.parse({
                  provider: this.key,
                  code: 'PARTIAL_DATA',
                  message: `Showing cached ${this.label} contest data with partial provider results.`,
                }),
              ],
        fetchedAtMs: persisted.fetchedAtMs,
        expiresAtMs:
          persisted.availability === 'unavailable'
            ? Math.min(persisted.expiresAtMs, this.now())
            : persisted.expiresAtMs,
      }
    } catch {
      this.logger.warn('provider_contest_cache_read_failed', {
        provider: this.key,
      })
    }
  }

  private async refresh(request: ContestProviderRequest): Promise<CacheEntry> {
    const fetchedAtMs = this.now()
    const result = await this.fetchContests(request)
    const contests = ExternalContestSchema.array().parse(result.contests)
    if (contests.length === 0) {
      throw new ProviderError(
        `No ${this.label} contest records were returned.`,
        {
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: this.key,
          retryable: false,
        },
      )
    }
    const identities = new Set(
      contests.map((contest) => `${contest.provider}:${contest.externalId}`),
    )
    if (identities.size !== contests.length) {
      throw new ProviderError(
        `The ${this.label} contest catalog contains duplicates.`,
        {
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: this.key,
          retryable: false,
        },
      )
    }
    const warnings = [...(result.warnings ?? [])]
    if (result.complete === false) {
      warnings.push(
        ProviderWarningSchema.parse({
          provider: this.key,
          code: 'PARTIAL_DATA',
          message: `${this.label} returned a bounded contest catalog; more records will be refreshed by the sync worker.`,
        }),
      )
    }
    return {
      contests,
      warnings,
      fetchedAtMs,
      expiresAtMs: fetchedAtMs + this.cacheTtlMs,
    }
  }

  private async handleRefreshFailure(
    staleCache: CacheEntry | undefined,
    error: unknown,
  ) {
    const providerError =
      error instanceof ProviderError
        ? error
        : new ProviderError(`${this.label} contest data is unavailable.`, {
            code: 'PROVIDER_UNAVAILABLE',
            provider: this.key,
            retryable: true,
            cause: error,
          })
    this.lastErrorCode = providerError.code
    this.blockedUntilMs = this.now() + this.failureCooldownMs
    if (staleCache !== undefined) {
      this.health = this.createFreshness(staleCache, true, providerError.code)
      return this.withStaleWarning(staleCache, providerError.code)
    }
    throw providerError
  }

  private withStaleWarning(cache: CacheEntry, errorCode?: string) {
    const warnings = [
      ...cache.warnings,
      ProviderWarningSchema.parse({
        provider: this.key,
        code: 'STALE_DATA',
        message: `Showing the last known ${this.label} contests while the provider is unavailable.`,
      }),
    ]
    if (errorCode === undefined) return { ...cache, warnings }
    return { ...cache, warnings }
  }

  private createFreshness(
    cache: CacheEntry,
    stale: boolean,
    lastErrorCode?: string,
  ) {
    return ProviderFreshnessSchema.parse({
      provider: this.key,
      availability:
        stale || cache.warnings.length > 0 ? 'degraded' : 'available',
      stale,
      fetchedAt: new Date(cache.fetchedAtMs).toISOString(),
      expiresAt: new Date(cache.expiresAtMs).toISOString(),
      ...(lastErrorCode === undefined ? {} : { lastErrorCode }),
    })
  }

  private persistCatalog(cache: CacheEntry) {
    if (this.cacheRepository === undefined) return
    void this.cacheRepository
      .replaceProviderCatalog({
        provider: this.key,
        contests: cache.contests,
        availability: this.health.availability,
        fetchedAtMs: cache.fetchedAtMs,
        expiresAtMs: cache.expiresAtMs,
      })
      .catch(() => {
        this.logger.warn('provider_contest_cache_write_failed', {
          provider: this.key,
        })
      })
  }
}
