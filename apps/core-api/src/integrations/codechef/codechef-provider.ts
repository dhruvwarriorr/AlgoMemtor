import {
  ExternalProblemSummarySchema,
  ProblemContentSchema,
  ProviderWarningSchema,
  type ExternalProblemSummary,
} from '@algomemtor/shared-contracts'

import { ProviderError } from '../../errors/provider-error.js'
import { RequestGate } from '../../utils/request-gate.js'
import { filterProblems } from '../providers/problem-filters.js'
import {
  CachedCatalogProvider,
  type CatalogRefreshResult,
} from '../providers/cached-catalog-provider.js'
import {
  fetchProviderJson,
  fetchProviderText,
  isProviderHostnameAllowed,
  type ProviderHttpRequest,
} from '../providers/provider-http-client.js'
import { problemContentFromHtml } from '../providers/provider-content.js'
import { providerHtmlToText } from '../providers/provider-html-sanitizer.js'
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
  CodeChefProblemRecordSchema,
  CodeChefProblemsEnvelopeSchema,
} from './codechef-schemas.js'
import { createCodeChefProblemUrl } from './codechef-url.js'

export type CodeChefProviderOptions = {
  baseUrl?: string
  cacheTtlMs?: number
  contentCacheTtlMs?: number
  timeoutMs?: number
  maxAttempts?: number
  minRequestIntervalMs?: number
  catalogLimit?: number
  fetchImpl?: typeof fetch
  requestGate?: RequestGate
  metadataCache?: ProblemMetadataCache
  contentCache?: ProblemContentCacheRepository
  catalogEnabled?: boolean
  contentEnabled?: boolean
}

const numeric = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return undefined
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const topicSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const normalizeDifficulty = (value: number | undefined) => {
  if (value === undefined || value <= 0) return undefined
  return value <= 1000 ? 'easy' : value <= 1500 ? 'medium' : 'hard'
}

const makeProviderError = (message: string) =>
  new ProviderError(message, {
    code: 'PROVIDER_INVALID_RESPONSE',
    provider: 'codechef',
    retryable: false,
  })

export class CodeChefProvider implements ProblemProvider {
  readonly key = 'codechef' as const
  readonly capabilities: ProviderCapabilityMap

  private readonly endpoint: URL
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly maxAttempts: number
  private readonly catalogLimit: number
  private readonly requestGate: RequestGate
  private readonly catalog: CachedCatalogProvider
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

  constructor(options: CodeChefProviderOptions = {}) {
    const baseUrl = options.baseUrl ?? 'https://www.codechef.com'
    const base = new URL(baseUrl)
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
        'CODECHEF_API_BASE_URL must be an HTTPS URL on www.codechef.com without credentials, query parameters, fragments, or a custom port.',
      )
    }
    this.endpoint = new URL('/api/list/problems/all', base)
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = options.timeoutMs ?? 8000
    this.maxAttempts = options.maxAttempts ?? 2
    this.catalogLimit = Math.min(
      Math.max(options.catalogLimit ?? 5000, 100),
      10_000,
    )
    this.requestGate =
      options.requestGate ??
      new RequestGate({ minIntervalMs: options.minRequestIntervalMs ?? 1000 })
    this.contentCacheTtlMs = Math.min(
      options.contentCacheTtlMs ?? options.cacheTtlMs ?? 21_600_000,
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
    this.catalog = new CachedCatalogProvider({
      key: this.key,
      label: 'CodeChef',
      cacheTtlMs: options.cacheTtlMs ?? 21_600_000,
      ...(options.metadataCache === undefined
        ? {}
        : { metadataCache: options.metadataCache }),
      fetchCatalog: (request) => this.fetchCatalog(request),
    })
  }

  getHealth() {
    return this.catalog.getHealth()
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
            message: 'CodeChef catalog synchronization is disabled.',
          }),
        ],
      }
    }
    return this.catalog.search(query, request)
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
            message: 'CodeChef problem content retrieval is disabled.',
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
        // A cache read failure must not prevent a fresh provider request.
      }
    }
    const now = Date.now()
    if (cached !== undefined && now < cached.expiresAtMs) {
      return {
        content: cached.content,
        freshness: this.getHealth(),
        warnings: [],
      }
    }
    let canonicalUrl: string
    try {
      canonicalUrl = createCodeChefProblemUrl(externalId)
    } catch {
      return { content: null, freshness: this.getHealth(), warnings: [] }
    }
    try {
      const html = await fetchProviderText({
        provider: this.key,
        url: new URL(canonicalUrl),
        allowedHostname: 'www.codechef.com',
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
      if (/captcha|cloudflare|access denied|just a moment|robot/i.test(html)) {
        throw new ProviderError('CodeChef blocked public problem content.', {
          code: 'PROVIDER_BLOCKED',
          provider: this.key,
          retryable: false,
        })
      }
      const title =
        providerHtmlToText(
          /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ??
            /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ??
            '',
        ) || externalId
      const content = problemContentFromHtml({
        provider: this.key,
        externalId,
        canonicalUrl,
        title,
        html,
        sourceUrl: canonicalUrl,
        schemaVersion: 'codechef-problem-html-v1',
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
            : new ProviderError('CodeChef problem content is unavailable.', {
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
                'Showing cached CodeChef problem content while the provider is unavailable.',
            }),
          ],
        }
      }
      throw error
    }
  }

  private async fetchCatalog(
    request: ProblemProviderRequest,
  ): Promise<CatalogRefreshResult> {
    const endpoint = new URL(this.endpoint)
    endpoint.searchParams.set('sort_by', 'successful_submissions')
    endpoint.searchParams.set('sorting_order', 'desc')
    endpoint.searchParams.set('offset', '0')
    endpoint.searchParams.set('limit', String(this.catalogLimit))
    const httpRequest: ProviderHttpRequest = {
      provider: this.key,
      url: endpoint,
      allowedHostname: 'www.codechef.com',
      requestGate: this.requestGate,
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      maxAttempts: this.maxAttempts,
      maxResponseBytes: 3_000_000,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      ...(request.requestId === undefined
        ? {}
        : { requestId: request.requestId }),
    }
    const body = await fetchProviderJson(httpRequest)
    const envelope = CodeChefProblemsEnvelopeSchema.safeParse(body)
    if (!envelope.success || envelope.data.status === 'error') {
      throw makeProviderError('CodeChef returned an invalid problem catalog.')
    }
    const fetchedAt = new Date().toISOString()
    const expectedCount = numeric(envelope.data.count)
    const problems: ExternalProblemSummary[] = []
    let invalidRecords = 0
    for (const raw of envelope.data.data) {
      const parsed = CodeChefProblemRecordSchema.safeParse(raw)
      if (!parsed.success) {
        invalidRecords += 1
        continue
      }
      const record = parsed.data
      let canonicalUrl: string
      try {
        canonicalUrl = createCodeChefProblemUrl(record.code)
      } catch {
        invalidRecords += 1
        continue
      }
      const difficulty = numeric(record.difficulty_rating)
      const total = numeric(record.total_submissions)
      const successful = numeric(
        record.distinct_successful_submissions ?? record.successful_submissions,
      )
      const contestTopic =
        record.contest_code === undefined
          ? undefined
          : topicSlug(record.contest_code)
      const topics = [
        'codechef',
        ...(contestTopic === undefined ? [] : [contestTopic]),
      ]
      const candidate = ExternalProblemSummarySchema.safeParse({
        provider: this.key,
        externalId: record.code,
        title: record.name,
        canonicalUrl,
        ...(difficulty !== undefined && difficulty > 0
          ? {
              providerDifficulty: difficulty,
              normalizedDifficulty: normalizeDifficulty(difficulty),
            }
          : {}),
        providerTags: [
          'codechef',
          ...(record.contest_code === undefined ? [] : [record.contest_code]),
        ],
        topics,
        ...(successful !== undefined && successful >= 0
          ? { solvedCount: Math.floor(successful) }
          : {}),
        ...(total !== undefined && total > 0 && successful !== undefined
          ? {
              acceptanceRate: Math.min(
                100,
                Math.max(0, (successful / total) * 100),
              ),
            }
          : {}),
        isPaidOnly: false,
        contentAvailable: true,
        sourceUrl: endpoint.toString(),
        extractionStrategy: 'official_json',
        schemaVersion: 'codechef-problem-api-v1',
        completeness:
          expectedCount === undefined || envelope.data.data.length >= expectedCount
            ? 'complete'
            : 'partial',
        stale: false,
        fetchedAt,
      })
      if (candidate.success) problems.push(candidate.data)
      else invalidRecords += 1
    }
    if (problems.length === 0) {
      throw makeProviderError('CodeChef returned no valid problem records.')
    }
    const complete =
      invalidRecords === 0 &&
      (expectedCount === undefined || envelope.data.data.length >= expectedCount)
    const validatedProblems = problems.map((problem) => ({
      ...problem,
      completeness: complete ? ('complete' as const) : ('partial' as const),
    }))
    const warnings =
      invalidRecords === 0
        ? []
        : [
            ProviderWarningSchema.parse({
              provider: this.key,
              code: 'INVALID_PROVIDER_RECORDS',
              message:
                'Some CodeChef problem records were rejected during validation.',
            }),
          ]
    return {
      problems: validatedProblems,
      warnings,
      complete,
    }
  }
}
