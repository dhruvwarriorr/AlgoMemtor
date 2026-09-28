import {
  ExternalProblemSummarySchema,
  ProviderWarningSchema,
  type ExternalProblemSummary,
} from '@algomemtor/shared-contracts'

import { RequestGate } from '../../utils/request-gate'
import {
  CachedCatalogProvider,
  type CatalogRefreshResult,
} from '../providers/cached-catalog-provider'
import {
  fetchProviderText,
  isProviderHostnameAllowed,
  type ProviderHttpRequest,
} from '../providers/provider-http-client'
import { providerHtmlToText } from '../providers/provider-html-sanitizer'
import type {
  ProblemProvider,
  ProblemProviderRequest,
  ProblemProviderSearchResult,
  ProviderProblemQuery,
} from '../providers/problem-provider'
import type { ProviderCapabilityMap } from '../providers/provider-adapter'
import type { ProblemMetadataCache } from '../providers/problem-metadata-cache'

export type CsesProviderOptions = {
  baseUrl?: string
  cacheTtlMs?: number
  timeoutMs?: number
  maxAttempts?: number
  minRequestIntervalMs?: number
  fetchImpl?: typeof fetch
  requestGate?: RequestGate
  metadataCache?: ProblemMetadataCache
  catalogEnabled?: boolean
}

const slug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const taskUrl = (id: string) =>
  `https://cses.fi/problemset/task/${encodeURIComponent(id)}/`

export class CsesProvider implements ProblemProvider {
  readonly key = 'cses' as const
  readonly capabilities: ProviderCapabilityMap

  private readonly endpoint: URL
  private readonly timeoutMs: number
  private readonly maxAttempts: number
  private readonly requestGate: RequestGate
  private readonly fetchImpl: typeof fetch
  private readonly catalogEnabled: boolean
  private readonly catalog: CachedCatalogProvider

  constructor(options: CsesProviderOptions = {}) {
    const base = new URL(options.baseUrl ?? 'https://cses.fi')
    const hasCustomFetch = options.fetchImpl !== undefined
    if (
      base.protocol !== 'https:' ||
      !isProviderHostnameAllowed(
        this.key,
        base.hostname,
        'cses.fi',
        hasCustomFetch,
      ) ||
      base.username !== '' ||
      base.password !== '' ||
      base.port !== '' ||
      base.search !== '' ||
      base.hash !== ''
    ) {
      throw new Error('The CSES catalog configuration is unsafe.')
    }
    this.endpoint = new URL('/problemset/', base)
    this.timeoutMs = options.timeoutMs ?? 8000
    this.maxAttempts = options.maxAttempts ?? 2
    this.requestGate =
      options.requestGate ??
      new RequestGate({ minIntervalMs: options.minRequestIntervalMs ?? 1000 })
    this.fetchImpl = options.fetchImpl ?? fetch
    this.catalogEnabled = options.catalogEnabled ?? true
    this.capabilities = {
      catalog: this.catalogEnabled ? 'supported' : 'disabled',
      problem_content: 'unsupported',
      profile: 'unsupported',
      submissions: 'unsupported',
      solved_problems: 'unsupported',
      rating_history: 'unsupported',
      contests: 'unsupported',
      contest_participation: 'unsupported',
    }
    this.catalog = new CachedCatalogProvider({
      key: this.key,
      label: 'CSES',
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
            message: 'CSES catalog synchronization is disabled.',
          }),
        ],
      }
    }
    return this.catalog.search(query, request)
  }

  private async fetchCatalog(
    request: ProblemProviderRequest,
  ): Promise<CatalogRefreshResult> {
    const html = await fetchProviderText({
      provider: this.key,
      url: this.endpoint,
      allowedHostname: 'cses.fi',
      requestGate: this.requestGate,
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      maxAttempts: this.maxAttempts,
      maxResponseBytes: 5_000_000,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      ...(request.requestId === undefined
        ? {}
        : { requestId: request.requestId }),
    } satisfies ProviderHttpRequest)
    const fetchedAt = new Date().toISOString()
    const problems: ExternalProblemSummary[] = []
    let sectionCount = 0
    for (const match of html.matchAll(
      /<h2[^>]*>([\s\S]*?)<\/h2>[\s\S]*?<ul[^>]*class=["'][^"']*task-list[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi,
    )) {
      const sectionName = providerHtmlToText(match[1] ?? '')
      if (sectionName === '') continue
      sectionCount += 1
      const sectionSlug = slug(sectionName)
      for (const task of (match[2] ?? '').matchAll(
        /href=["']\/problemset\/task\/(\d+)["'][^>]*>([^<]+)</gi,
      )) {
        const externalId = task[1]
        const title = providerHtmlToText(task[2] ?? '')
        if (externalId === undefined || title === '') continue
        const canonicalUrl = taskUrl(externalId)
        const topics = ['cses', ...(sectionSlug === '' ? [] : [sectionSlug])]
        const candidate = ExternalProblemSummarySchema.safeParse({
          provider: this.key,
          externalId,
          title,
          canonicalUrl,
          providerTags: topics,
          topics,
          contentAvailable: false,
          sourceUrl: this.endpoint.toString(),
          extractionStrategy: 'sanitized_html',
          schemaVersion: 'cses-problemset-html-v1',
          completeness: 'complete',
          stale: false,
          fetchedAt,
        })
        if (candidate.success) problems.push(candidate.data)
      }
    }
    return {
      problems,
      complete: sectionCount > 0 && problems.length > 0,
    }
  }
}
