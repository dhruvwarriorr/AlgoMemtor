import {
  ExternalProblemSummarySchema,
  ProblemContentSchema,
  ProviderFreshnessSchema,
  ProviderWarningSchema,
  type ExternalProblemSummary,
  type ProviderFreshness,
  type ProviderWarning,
} from '@algomemtor/shared-contracts'

import { ProviderError } from '../../errors/provider-error.js'
import {
  structuredLogger,
  type StructuredLogger,
} from '../../utils/structured-logger.js'
import {
  RequestGate,
  sleepWithSignal,
  type RequestGateSleep,
} from '../../utils/request-gate.js'
import { filterProblems } from '../providers/problem-filters.js'
import type {
  ProblemProvider,
  ProblemProviderRequest,
  ProblemProviderSearchResult,
  ProviderProblemQuery,
} from '../providers/problem-provider.js'
import type { ProviderCapabilityMap } from '../providers/provider-adapter.js'
import type { ProblemMetadataCache } from '../providers/problem-metadata-cache.js'
import type { ProblemContentCacheRepository } from '../../repositories/problem-content-cache-repository.js'
import {
  fetchProviderText,
  isProviderHostnameAllowed,
  type ProviderHttpRequest,
} from '../providers/provider-http-client.js'
import { readLimitedResponseText } from '../provider-accounts/provider-fetch-utils.js'
import { problemContentFromHtml } from '../providers/provider-content.js'
import { providerHtmlToText } from '../providers/provider-html-sanitizer.js'
import {
  normalizeCodeforcesDifficulty,
  normalizeCodeforcesProblems,
} from './codeforces-normalizer.js'
import {
  CodeforcesProblemSchema,
  CodeforcesProblemStatisticsSchema,
  CodeforcesProblemsetEnvelopeSchema,
  type CodeforcesProblem,
  type CodeforcesProblemStatistics,
} from './codeforces-schemas.js'
import { createCodeforcesProblemUrl } from './codeforces-url.js'

type CacheEntry = {
  problems: ExternalProblemSummary[]
  warnings: ProviderWarning[]
  fetchedAtMs: number
  expiresAtMs: number
}

type RefreshResult = {
  problems: ExternalProblemSummary[]
  warnings: ProviderWarning[]
  fetchedAtMs: number
}

export type CodeforcesProviderOptions = {
  baseUrl?: string
  cacheTtlMs?: number
  contentCacheTtlMs?: number
  timeoutMs?: number
  maxAttempts?: number
  minRequestIntervalMs?: number
  retryBaseDelayMs?: number
  failureCooldownMs?: number
  fetchImpl?: typeof fetch
  logger?: StructuredLogger
  now?: () => number
  random?: () => number
  sleep?: RequestGateSleep
  requestGate?: RequestGate
  metadataCache?: ProblemMetadataCache
  contentCache?: ProblemContentCacheRepository
  catalogEnabled?: boolean
  contentEnabled?: boolean
}

const invalidResponseError = () =>
  new ProviderError('Codeforces returned an invalid response.', {
    code: 'PROVIDER_INVALID_RESPONSE',
    provider: 'codeforces',
    retryable: false,
  })

const requestAbortedError = () =>
  new ProviderError('The Codeforces request was cancelled.', {
    code: 'PROVIDER_UNAVAILABLE',
    provider: 'codeforces',
    retryable: false,
  })

export class CodeforcesProvider implements ProblemProvider {
  readonly key = 'codeforces' as const
  readonly capabilities: ProviderCapabilityMap

  private readonly endpoint: URL
  private readonly cacheTtlMs: number
  private readonly timeoutMs: number
  private readonly maxAttempts: number
  private readonly retryBaseDelayMs: number
  private readonly failureCooldownMs: number
  private readonly fetchImpl: typeof fetch
  private readonly hasCustomFetch: boolean
  private readonly logger: StructuredLogger
  private readonly now: () => number
  private readonly random: () => number
  private readonly sleep: RequestGateSleep
  private readonly requestGate: RequestGate
  private readonly metadataCache: ProblemMetadataCache | undefined
  private readonly contentCache = new Map<
    string,
    {
      content: ReturnType<typeof ProblemContentSchema.parse>
      expiresAtMs: number
    }
  >()
  private readonly contentCacheTtlMs: number
  private readonly contentRepository: ProblemContentCacheRepository | undefined
  private readonly catalogEnabled: boolean
  private readonly contentEnabled: boolean

  private cache?: CacheEntry
  private metadataCacheLoaded = false
  private metadataCacheLoadPromise: Promise<void> | undefined
  private refreshPromise: Promise<CacheEntry> | undefined
  private refreshBlockedUntilMs = 0
  private lastRefreshErrorCode: string | undefined
  private health: ProviderFreshness = {
    provider: 'codeforces',
    availability: 'available',
    stale: false,
  }

  constructor(options: CodeforcesProviderOptions = {}) {
    const baseUrl = options.baseUrl ?? 'https://codeforces.com/api'
    const base = new URL(baseUrl)
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
        'CODEFORCES_API_BASE_URL must be an HTTPS URL on codeforces.com without credentials, query parameters, fragments, or a custom port.',
      )
    }

    this.endpoint = new URL(
      'problemset.problems',
      `${baseUrl.replace(/\/+$/, '')}/`,
    )
    this.cacheTtlMs = options.cacheTtlMs ?? 3_600_000
    this.timeoutMs = options.timeoutMs ?? 8000
    this.maxAttempts = options.maxAttempts ?? 2
    const minRequestIntervalMs = options.minRequestIntervalMs ?? 2100
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 250
    this.failureCooldownMs = options.failureCooldownMs ?? 30_000
    this.fetchImpl = options.fetchImpl ?? fetch
    this.hasCustomFetch = hasCustomFetch
    this.logger = options.logger ?? structuredLogger
    this.now = options.now ?? Date.now
    this.random = options.random ?? Math.random
    this.sleep = options.sleep ?? sleepWithSignal
    this.requestGate =
      options.requestGate ??
      new RequestGate({
        minIntervalMs: minRequestIntervalMs,
        now: this.now,
        sleep: this.sleep,
      })
    this.metadataCache = options.metadataCache
    this.contentCacheTtlMs = Math.min(
      options.contentCacheTtlMs ?? this.cacheTtlMs,
      2_592_000_000,
    )
    this.contentRepository = options.contentCache
    this.catalogEnabled = options.catalogEnabled ?? true
    this.contentEnabled = options.contentEnabled ?? true
    this.capabilities = {
      catalog: this.catalogEnabled ? 'supported' : 'disabled',
      problem_content: this.contentEnabled ? 'supported' : 'disabled',
      profile: 'unsupported',
      submissions: 'unsupported',
      solved_problems: 'unsupported',
      rating_history: 'unsupported',
      contests: 'supported',
      contest_participation: 'unsupported',
    }

    if (
      this.endpoint.protocol !== 'https:' ||
      this.cacheTtlMs <= 0 ||
      this.timeoutMs <= 0 ||
      this.maxAttempts < 1 ||
      minRequestIntervalMs < 0 ||
      this.retryBaseDelayMs < 0 ||
      this.failureCooldownMs < 0
    ) {
      throw new Error('The Codeforces provider configuration is invalid.')
    }
  }

  getHealth() {
    return ProviderFreshnessSchema.parse(this.health)
  }

  async search(
    query: ProviderProblemQuery,
    request: ProblemProviderRequest = {},
  ): Promise<ProblemProviderSearchResult> {
    if (!this.catalogEnabled) {
      return {
        problems: [],
        freshness: this.getHealth(),
        warnings: [
          ProviderWarningSchema.parse({
            provider: this.key,
            code: 'CAPABILITY_DISABLED',
            message: 'Codeforces catalog synchronization is disabled.',
          }),
        ],
      }
    }
    const catalog = await this.loadCatalog(request)

    return {
      problems: filterProblems(catalog.problems, query),
      freshness: this.getHealth(),
      warnings: catalog.warnings,
    }
  }

  async getContent(externalId: string, request: ProblemProviderRequest = {}) {
    if (!this.contentEnabled) {
      return {
        content: null,
        freshness: this.getHealth(),
        warnings: [
          ProviderWarningSchema.parse({
            provider: this.key,
            code: 'CAPABILITY_DISABLED',
            message: 'Codeforces problem content retrieval is disabled.',
          }),
        ],
      }
    }
    let cached = this.contentCache.get(externalId)
    if (cached === undefined && this.contentRepository !== undefined) {
      try {
        const persisted = await this.contentRepository.find(
          this.key,
          externalId,
        )
        if (persisted !== null) {
          cached = {
            content: persisted.content,
            expiresAtMs: persisted.expiresAtMs,
          }
          this.contentCache.set(externalId, cached)
        }
      } catch {
        // Cache failures are non-fatal; the public page remains authoritative.
      }
    }
    const now = this.now()
    if (cached !== undefined && now < cached.expiresAtMs) {
      return {
        content: cached.content,
        freshness: this.getHealth(),
        warnings: [],
      }
    }
    const match = /^(\d+)([A-Za-z][0-9]*)$/.exec(externalId.trim())
    if (match === null) {
      return {
        content: null,
        freshness: this.getHealth(),
        warnings: [
          ProviderWarningSchema.parse({
            provider: this.key,
            code: 'UNSUPPORTED_PROVIDER_RECORDS',
            message:
              'This Codeforces problem does not have a safe public statement URL.',
          }),
        ],
      }
    }
    const contestId = Number(match[1])
    const index = match[2]
    if (index === undefined) {
      return { content: null, freshness: this.getHealth(), warnings: [] }
    }
    let canonicalUrl: string
    try {
      canonicalUrl = createCodeforcesProblemUrl(contestId, index)
    } catch {
      return { content: null, freshness: this.getHealth(), warnings: [] }
    }
    try {
      const html = await fetchProviderText({
        provider: this.key,
        url: new URL(canonicalUrl),
        allowedHostname: 'codeforces.com',
        requestGate: this.requestGate,
        fetchImpl: this.fetchImpl,
        timeoutMs: this.timeoutMs,
        maxAttempts: this.maxAttempts,
        maxResponseBytes: 2_000_000,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
        ...(request.requestId === undefined
          ? {}
          : { requestId: request.requestId }),
      } satisfies ProviderHttpRequest)
      if (/captcha|cloudflare|access denied|just a moment/i.test(html)) {
        throw new ProviderError('Codeforces blocked public problem content.', {
          code: 'PROVIDER_BLOCKED',
          provider: this.key,
          retryable: false,
        })
      }
      const statementMatch =
        /<div[^>]*class=["'][^"']*problem-statement[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i.exec(
          html,
        )
      const source = statementMatch?.[1] ?? html
      const title =
        providerHtmlToText(
          /<div[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(
            html,
          )?.[1] ?? '',
        ) || externalId
      const content = problemContentFromHtml({
        provider: this.key,
        externalId,
        canonicalUrl,
        title,
        html: source,
        sourceUrl: canonicalUrl,
        schemaVersion: 'codeforces-problem-html-v1',
      })
      this.contentCache.set(externalId, {
        content,
        expiresAtMs: now + this.contentCacheTtlMs,
      })
      void this.contentRepository?.save({
        provider: this.key,
        externalId,
        content,
        availability: 'available',
        fetchedAtMs: now,
        expiresAtMs: now + this.contentCacheTtlMs,
      })
      return { content, freshness: this.getHealth(), warnings: [] }
    } catch (error) {
      if (cached !== undefined) {
        const providerError =
          error instanceof ProviderError
            ? error
            : new ProviderError('Codeforces problem content is unavailable.', {
                code: 'PROVIDER_UNAVAILABLE',
                provider: this.key,
                retryable: true,
                cause: error,
              })
        const staleContent = ProblemContentSchema.parse({
          ...cached.content,
          completeness: 'partial',
          provenance: {
            ...cached.content.provenance,
            completeness: 'partial',
            stale: true,
            errorCode: providerError.code,
          },
        })
        return {
          content: staleContent,
          freshness: this.getHealth(),
          warnings: [
            ProviderWarningSchema.parse({
              provider: this.key,
              code: 'STALE_DATA',
              message:
                'Showing cached Codeforces problem content while the provider is unavailable.',
            }),
          ],
        }
      }
      throw error
    }
  }

  private async loadCatalog(request: ProblemProviderRequest) {
    await this.loadPersistedCatalog(request)
    const now = this.now()

    if (this.cache !== undefined && now < this.cache.expiresAtMs) {
      this.health = this.createFreshness(this.cache, false)
      this.logger.info('provider_cache_hit', {
        provider: this.key,
        cacheStatus: 'fresh',
        resultCount: this.cache.problems.length,
        ...(request.requestId === undefined
          ? {}
          : { requestId: request.requestId }),
      })
      return this.cache
    }

    if (
      this.cache !== undefined &&
      now < this.refreshBlockedUntilMs &&
      this.lastRefreshErrorCode !== undefined
    ) {
      this.health = this.createFreshness(
        this.cache,
        true,
        this.lastRefreshErrorCode,
      )
      this.logger.info('provider_cache_hit', {
        provider: this.key,
        cacheStatus: 'stale-cooldown',
        resultCount: this.cache.problems.length,
        stale: true,
        ...(request.requestId === undefined
          ? {}
          : { requestId: request.requestId }),
      })
      return this.withStaleWarning(this.cache)
    }

    if (this.refreshPromise !== undefined) {
      this.logger.info('provider_refresh_deduplicated', {
        provider: this.key,
        cacheStatus: 'in-flight',
        ...(request.requestId === undefined
          ? {}
          : { requestId: request.requestId }),
      })

      try {
        return await this.refreshPromise
      } catch (error) {
        return this.handleRefreshFailure(this.cache, error, request)
      }
    }

    const staleCache = this.cache
    this.refreshPromise = this.refresh(request).then((result) => {
      const cache: CacheEntry = {
        ...result,
        expiresAtMs: result.fetchedAtMs + this.cacheTtlMs,
      }
      this.cache = cache
      this.refreshBlockedUntilMs = 0
      this.lastRefreshErrorCode = undefined
      this.health = this.createFreshness(cache, false)
      this.persistCatalog(cache, request)
      return cache
    })

    try {
      return await this.refreshPromise
    } catch (error) {
      return this.handleRefreshFailure(staleCache, error, request)
    } finally {
      this.refreshPromise = undefined
    }
  }

  private async loadPersistedCatalog(request: ProblemProviderRequest) {
    if (this.metadataCacheLoaded || this.metadataCache === undefined) {
      return
    }

    if (this.metadataCacheLoadPromise === undefined) {
      this.metadataCacheLoadPromise = this.metadataCache
        .findByProvider(this.key)
        .then((persisted) => {
          if (persisted === null || this.cache !== undefined) {
            return
          }

          this.cache = {
            problems: persisted.problems,
            warnings:
              persisted.availability !== 'available'
                ? [
                    ProviderWarningSchema.parse({
                      provider: this.key,
                      code: 'PARTIAL_DATA',
                      message:
                        'Showing cached Codeforces metadata with partial provider results.',
                    }),
                  ]
                : [],
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
        })
        .catch(() => {
          this.logger.warn('provider_persistent_cache_read_failed', {
            provider: this.key,
            ...(request.requestId === undefined
              ? {}
              : { requestId: request.requestId }),
          })
        })
        .finally(() => {
          this.metadataCacheLoaded = true
          this.metadataCacheLoadPromise = undefined
        })
    }

    await this.metadataCacheLoadPromise
  }

  private persistCatalog(cache: CacheEntry, request: ProblemProviderRequest) {
    if (this.metadataCache === undefined) {
      return
    }

    const metadataCache = this.metadataCache

    void Promise.resolve()
      .then(() =>
        metadataCache.replaceProviderCatalog({
          provider: this.key,
          problems: cache.problems,
          availability: this.health.availability,
          fetchedAtMs: cache.fetchedAtMs,
          expiresAtMs: cache.expiresAtMs,
        }),
      )
      .catch(() => {
        this.logger.warn('provider_persistent_cache_write_failed', {
          provider: this.key,
          cacheStatus: 'fresh',
          ...(request.requestId === undefined
            ? {}
            : { requestId: request.requestId }),
        })
      })
  }

  private async refresh(
    request: ProblemProviderRequest,
  ): Promise<RefreshResult> {
    const startedAt = this.now()
    const rawResult = await this.fetchWithRetries(request)
    const problems: CodeforcesProblem[] = []
    const statistics: CodeforcesProblemStatistics[] = []
    let invalidProblemCount = 0
    let invalidStatisticsCount = 0
    let unsupportedProblemCount = 0

    for (const rawProblem of rawResult.problems) {
      const parsed = CodeforcesProblemSchema.safeParse(rawProblem)

      if (parsed.success) {
        problems.push(parsed.data)
      } else {
        invalidProblemCount += 1
      }
    }

    for (const rawStatistics of rawResult.problemStatistics) {
      const parsed = CodeforcesProblemStatisticsSchema.safeParse(rawStatistics)

      if (parsed.success) {
        statistics.push(parsed.data)
      } else {
        invalidStatisticsCount += 1
      }
    }

    const fetchedAtMs = this.now()
    const fetchedAt = new Date(fetchedAtMs).toISOString()
    const normalizedProblems: ExternalProblemSummary[] = []

    for (const problem of normalizeCodeforcesProblems({
      problems,
      problemStatistics: statistics,
    })) {
      if (problem.contestId === undefined || problem.topics.length === 0) {
        unsupportedProblemCount += 1
        continue
      }

      let canonicalUrl: string

      try {
        canonicalUrl = createCodeforcesProblemUrl(
          problem.contestId,
          problem.index,
        )
      } catch {
        unsupportedProblemCount += 1
        continue
      }

      const candidate = ExternalProblemSummarySchema.safeParse({
        provider: this.key,
        externalId: problem.externalId,
        title: problem.title,
        canonicalUrl,
        ...(problem.providerDifficulty === undefined
          ? {}
          : {
              providerDifficulty: problem.providerDifficulty,
              normalizedDifficulty: normalizeCodeforcesDifficulty(
                problem.providerDifficulty,
              ),
            }),
        providerTags: problem.providerTags,
        topics: problem.topics,
        ...(problem.solvedCount === undefined
          ? {}
          : { solvedCount: problem.solvedCount }),
        isPaidOnly: false,
        contentAvailable: true,
        sourceUrl: this.endpoint.toString(),
        extractionStrategy: 'official_json',
        schemaVersion: 'codeforces-problemset-v2',
        completeness: 'complete',
        stale: false,
        fetchedAt,
      })

      if (candidate.success) {
        normalizedProblems.push(candidate.data)
      } else {
        invalidProblemCount += 1
      }
    }

    if (
      rawResult.problems.length > 0 &&
      normalizedProblems.length === 0 &&
      (invalidProblemCount > 0 || unsupportedProblemCount > 0)
    ) {
      throw invalidResponseError()
    }

    const warnings: ProviderWarning[] = []

    if (invalidProblemCount > 0 || invalidStatisticsCount > 0) {
      warnings.push(
        ProviderWarningSchema.parse({
          provider: this.key,
          code: 'INVALID_PROVIDER_RECORDS',
          message:
            'Some Codeforces metadata records were rejected during validation.',
        }),
      )
    }

    if (unsupportedProblemCount > 0) {
      warnings.push(
        ProviderWarningSchema.parse({
          provider: this.key,
          code: 'UNSUPPORTED_PROVIDER_RECORDS',
          message:
            'Some Codeforces records were skipped because a safe canonical problem URL could not be constructed.',
        }),
      )
    }

    const validatedProblems = ExternalProblemSummarySchema.array()
      .parse(normalizedProblems)
      .map((problem) => ({
        ...problem,
        completeness:
          invalidProblemCount === 0 && invalidStatisticsCount === 0
            ? ('complete' as const)
            : ('partial' as const),
      }))

    if (validatedProblems.length === 0) {
      throw invalidResponseError()
    }

    this.logger.info('provider_refresh_succeeded', {
      provider: this.key,
      cacheStatus: 'miss',
      latencyMs: Math.max(0, fetchedAtMs - startedAt),
      resultCount: validatedProblems.length,
      invalidProblemCount,
      invalidStatisticsCount,
      unsupportedProblemCount,
      ...(request.requestId === undefined
        ? {}
        : { requestId: request.requestId }),
    })

    return { problems: validatedProblems, warnings, fetchedAtMs }
  }

  private async fetchWithRetries(request: ProblemProviderRequest) {
    let lastError: ProviderError | undefined

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        await this.waitForProviderSlot(request.signal)
        return await this.fetchOnce(request.signal)
      } catch (error) {
        const providerError =
          error instanceof ProviderError ? error : requestAbortedError()
        lastError = providerError

        this.logger.warn('provider_request_failed', {
          provider: this.key,
          attempt,
          errorCode: providerError.code,
          retryable: providerError.retryable,
          ...(request.requestId === undefined
            ? {}
            : { requestId: request.requestId }),
        })

        const shouldRetry =
          providerError.retryable &&
          providerError.code !== 'PROVIDER_RATE_LIMITED' &&
          attempt < this.maxAttempts

        if (!shouldRetry) {
          throw providerError
        }

        const backoffMs =
          this.retryBaseDelayMs * 2 ** (attempt - 1) +
          Math.floor(this.random() * this.retryBaseDelayMs)

        try {
          await this.sleep(backoffMs, request.signal)
        } catch {
          throw requestAbortedError()
        }
      }
    }

    throw lastError ?? invalidResponseError()
  }

  private async waitForProviderSlot(signal?: AbortSignal) {
    try {
      await this.requestGate.wait(signal)
    } catch {
      throw requestAbortedError()
    }
  }

  private async fetchOnce(signal?: AbortSignal) {
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs)
    const combinedSignal =
      signal === undefined
        ? timeoutSignal
        : AbortSignal.any([signal, timeoutSignal])

    let response: Response

    try {
      response = await this.fetchImpl(this.endpoint, {
        headers: { accept: 'application/json' },
        redirect: 'manual',
        signal: combinedSignal,
      })
    } catch {
      if (signal?.aborted) {
        throw requestAbortedError()
      }

      if (timeoutSignal.aborted) {
        throw new ProviderError('The Codeforces request timed out.', {
          code: 'PROVIDER_TIMEOUT',
          provider: this.key,
          retryable: true,
        })
      }

      throw new ProviderError('Codeforces is temporarily unavailable.', {
        code: 'PROVIDER_UNAVAILABLE',
        provider: this.key,
        retryable: true,
      })
    }

    if (response.status === 429) {
      throw new ProviderError('Codeforces is rate limiting requests.', {
        code: 'PROVIDER_RATE_LIMITED',
        provider: this.key,
        retryable: true,
      })
    }

    if (response.status === 403) {
      throw new ProviderError('Codeforces blocked this public request.', {
        code: 'PROVIDER_BLOCKED',
        provider: this.key,
        retryable: false,
      })
    }

    if (response.status >= 300 && response.status < 400) {
      throw new ProviderError('Codeforces redirected a public request.', {
        code: 'PROVIDER_BLOCKED',
        provider: this.key,
        retryable: false,
      })
    }

    if (!response.ok) {
      throw new ProviderError('Codeforces is temporarily unavailable.', {
        code: 'PROVIDER_UNAVAILABLE',
        provider: this.key,
        retryable: response.status >= 500,
        details: { httpStatus: response.status },
      })
    }

    if (response.url !== '') {
      const responseUrl = new URL(response.url)
      if (
        responseUrl.protocol !== 'https:' ||
        !isProviderHostnameAllowed(
          this.key,
          responseUrl.hostname,
          'codeforces.com',
          this.hasCustomFetch,
        ) ||
        responseUrl.username !== '' ||
        responseUrl.password !== '' ||
        responseUrl.port !== ''
      ) {
        throw new ProviderError('Codeforces redirected to an unsafe host.', {
          code: 'PROVIDER_BLOCKED',
          provider: this.key,
          retryable: false,
        })
      }
    }

    const contentType = response.headers.get('content-type')?.toLowerCase()
    if (
      contentType !== null &&
      contentType !== undefined &&
      !contentType.includes('application/json') &&
      !contentType.includes('+json')
    ) {
      throw invalidResponseError()
    }

    let text: string

    try {
      text = await readLimitedResponseText(this.key, response, 30_000_000)
    } catch {
      throw invalidResponseError()
    }

    let body: unknown
    try {
      body = JSON.parse(text) as unknown
    } catch {
      throw invalidResponseError()
    }

    const envelope = CodeforcesProblemsetEnvelopeSchema.safeParse(body)

    if (!envelope.success) {
      throw invalidResponseError()
    }

    if (envelope.data.status === 'FAILED') {
      const rateLimited = /call limit exceeded/i.test(envelope.data.comment)

      throw new ProviderError(
        rateLimited
          ? 'Codeforces is rate limiting requests.'
          : 'Codeforces rejected the metadata request.',
        {
          code: rateLimited ? 'PROVIDER_RATE_LIMITED' : 'PROVIDER_UNAVAILABLE',
          provider: this.key,
          retryable: rateLimited,
        },
      )
    }

    return envelope.data.result
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
    request: ProblemProviderRequest,
  ): CacheEntry {
    const providerError =
      error instanceof ProviderError ? error : invalidResponseError()

    if (staleCache !== undefined) {
      this.refreshBlockedUntilMs = this.now() + this.failureCooldownMs
      this.lastRefreshErrorCode = providerError.code
      this.health = this.createFreshness(staleCache, true, providerError.code)
      this.logger.warn('provider_stale_fallback', {
        provider: this.key,
        cacheStatus: 'stale',
        errorCode: providerError.code,
        stale: true,
        ...(request.requestId === undefined
          ? {}
          : { requestId: request.requestId }),
      })
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
    const staleWarning = ProviderWarningSchema.parse({
      provider: this.key,
      code: 'STALE_DATA',
      message:
        'Showing cached Codeforces metadata because a fresh response is unavailable.',
    })

    return {
      ...cache,
      problems: cache.problems.map((problem) => ({
        ...problem,
        completeness: 'partial' as const,
        stale: true,
      })),
      warnings: [
        ...cache.warnings.filter(
          (warning) => warning.code !== staleWarning.code,
        ),
        staleWarning,
      ],
    }
  }
}
