import {
  ExternalProblemSummarySchema,
  ProviderFreshnessSchema,
  ProviderWarningSchema,
  type ExternalProblemSummary,
  type ProviderFreshness,
  type ProviderKey,
  type ProviderWarning,
} from '@algomemtor/shared-contracts'

import { ProviderError } from '../../errors/provider-error.js'
import {
  structuredLogger,
  type StructuredLogger,
} from '../../utils/structured-logger.js'
import { filterProblems } from './problem-filters.js'
import type {
  ProblemProvider,
  ProblemProviderRequest,
  ProblemProviderSearchResult,
  ProviderProblemQuery,
} from './problem-provider.js'
import type { ProblemMetadataCache } from './problem-metadata-cache.js'

export type CatalogRefreshResult = {
  problems: ExternalProblemSummary[]
  warnings?: ProviderWarning[]
  complete?: boolean
}

export type CachedCatalogProviderOptions = {
  key: ProviderKey
  label: string
  cacheTtlMs?: number
  failureCooldownMs?: number
  fetchCatalog: (
    request: ProblemProviderRequest,
  ) => Promise<CatalogRefreshResult>
  metadataCache?: ProblemMetadataCache
  logger?: StructuredLogger
  now?: () => number
}

type CacheEntry = {
  problems: ExternalProblemSummary[]
  warnings: ProviderWarning[]
  fetchedAtMs: number
  expiresAtMs: number
}

export class CachedCatalogProvider implements ProblemProvider {
  readonly key: ProviderKey

  private readonly label: string
  private readonly cacheTtlMs: number
  private readonly failureCooldownMs: number
  private readonly fetchCatalog: CachedCatalogProviderOptions['fetchCatalog']
  private readonly metadataCache: ProblemMetadataCache | undefined
  private readonly logger: StructuredLogger
  private readonly now: () => number
  private cache: CacheEntry | undefined
  private persistedLoaded = false
  private refreshPromise: Promise<CacheEntry> | undefined
  private blockedUntilMs = 0
  private lastErrorCode: string | undefined
  private health: ProviderFreshness

  constructor(options: CachedCatalogProviderOptions) {
    this.key = options.key
    this.label = options.label
    this.cacheTtlMs = options.cacheTtlMs ?? 21_600_000
    this.failureCooldownMs = options.failureCooldownMs ?? 60_000
    this.fetchCatalog = options.fetchCatalog
    this.metadataCache = options.metadataCache
    this.logger = options.logger ?? structuredLogger
    this.now = options.now ?? Date.now
    this.health = ProviderFreshnessSchema.parse({
      provider: this.key,
      availability: 'available',
      stale: false,
    })

    if (this.cacheTtlMs <= 0 || this.failureCooldownMs < 0) {
      throw new Error(`The ${this.key} catalog configuration is invalid.`)
    }
  }

  getHealth() {
    return ProviderFreshnessSchema.parse(this.health)
  }

  getLabel() {
    return this.label
  }

  async search(
    query: ProviderProblemQuery,
    request: ProblemProviderRequest = {},
  ): Promise<ProblemProviderSearchResult> {
    const catalog = await this.loadCatalog(request)
    return {
      problems: filterProblems(catalog.problems, query),
      freshness: this.getHealth(),
      warnings: catalog.warnings,
    }
  }

  private async loadPersistedCatalog(request: ProblemProviderRequest) {
    if (this.persistedLoaded || this.metadataCache === undefined) return
    this.persistedLoaded = true
    try {
      const persisted = await this.metadataCache.findByProvider(this.key)
      if (persisted === null || this.cache !== undefined) return
      this.cache = {
        problems: persisted.problems,
        warnings:
          persisted.availability === 'available'
            ? []
            : [
                ProviderWarningSchema.parse({
                  provider: this.key,
                  code: 'PARTIAL_DATA',
                  message: `Showing cached ${this.label} metadata with partial provider results.`,
                }),
              ],
        fetchedAtMs: persisted.fetchedAtMs,
        expiresAtMs:
          persisted.availability === 'unavailable'
            ? Math.min(persisted.expiresAtMs, this.now())
            : persisted.expiresAtMs,
      }
      this.logger.info('provider_persistent_cache_loaded', {
        provider: this.key,
        cacheStatus: this.now() < persisted.expiresAtMs ? 'fresh' : 'stale',
        resultCount: persisted.problems.length,
        ...(request.requestId === undefined
          ? {}
          : { requestId: request.requestId }),
      })
    } catch {
      this.logger.warn('provider_persistent_cache_read_failed', {
        provider: this.key,
      })
    }
  }

  private async loadCatalog(request: ProblemProviderRequest) {
    await this.loadPersistedCatalog(request)
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

  private async refresh(request: ProblemProviderRequest): Promise<CacheEntry> {
    const fetchedAtMs = this.now()
    const result = await this.fetchCatalog(request)
    const problems = ExternalProblemSummarySchema.array().parse(result.problems)
    if (problems.length === 0) {
      throw new ProviderError(
        `No ${this.label} catalog records were returned.`,
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
          message: `${this.label} returned a bounded catalog page; more records will be backfilled by the sync worker.`,
        }),
      )
    }
    const unique = new Set(problems.map((problem) => problem.externalId))
    if (unique.size !== problems.length) {
      throw new ProviderError(
        `The ${this.label} catalog contains duplicates.`,
        {
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: this.key,
          retryable: false,
        },
      )
    }
    return {
      problems,
      warnings,
      fetchedAtMs,
      expiresAtMs: fetchedAtMs + this.cacheTtlMs,
    }
  }

  private persistCatalog(cache: CacheEntry) {
    if (this.metadataCache === undefined) return
    void this.metadataCache
      .replaceProviderCatalog({
        provider: this.key,
        problems: cache.problems,
        availability: this.health.availability,
        fetchedAtMs: cache.fetchedAtMs,
        expiresAtMs: cache.expiresAtMs,
      })
      .catch(() => {
        this.logger.warn('provider_persistent_cache_write_failed', {
          provider: this.key,
        })
      })
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

  private handleRefreshFailure(
    staleCache: CacheEntry | undefined,
    error: unknown,
  ): CacheEntry {
    const providerError =
      error instanceof ProviderError
        ? error
        : new ProviderError(`The ${this.label} response was invalid.`, {
            code: 'PROVIDER_INVALID_RESPONSE',
            provider: this.key,
            retryable: false,
          })
    if (staleCache !== undefined) {
      this.blockedUntilMs = this.now() + this.failureCooldownMs
      this.lastErrorCode = providerError.code
      this.health = this.createFreshness(staleCache, true, providerError.code)
      return this.withStaleWarning(staleCache)
    }
    this.health = ProviderFreshnessSchema.parse({
      provider: this.key,
      availability: 'unavailable',
      stale: false,
      lastErrorCode: providerError.code,
    })
    throw providerError
  }

  private withStaleWarning(cache: CacheEntry): CacheEntry {
    const warning = ProviderWarningSchema.parse({
      provider: this.key,
      code: 'STALE_DATA',
      message: `Showing cached ${this.label} metadata because a fresh response is unavailable.`,
    })
    return {
      ...cache,
      problems: cache.problems.map((problem) => ({
        ...problem,
        completeness: 'partial' as const,
        stale: true,
      })),
      warnings: [
        ...cache.warnings.filter((item) => item.code !== warning.code),
        warning,
      ],
    }
  }
}
