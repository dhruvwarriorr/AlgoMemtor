import {
  ExternalProblemSummarySchema,
  ProblemContentSchema,
  ProviderWarningSchema,
  type ExternalProblemSummary,
} from '@algomemtor/shared-contracts'

import {
  LeetCodeContestSchema,
  leetcodeContestProblems,
  leetcodeContestQuery,
  type ContestProblemLink,
  type ContestProblemsHint,
} from '../providers/contest-problems'
import {
  LeetCodeSolutionsEnvelopeSchema,
  leetcodeCommunitySolutions,
  leetcodeLanguageTag,
  leetcodeSolutionsQuery,
  type CommunitySolutionLink,
} from '../providers/community-solutions'
import { ProviderError } from '../../errors/provider-error'
import { RequestGate } from '../../utils/request-gate'
import {
  CachedCatalogProvider,
  type CatalogRefreshResult,
} from '../providers/cached-catalog-provider'
import {
  fetchProviderJson,
  isProviderHostnameAllowed,
  type ProviderHttpRequest,
} from '../providers/provider-http-client'
import { problemContentFromLeetCode } from '../providers/provider-content'
import type {
  ProblemProvider,
  ProblemProviderRequest,
  ProblemProviderSearchResult,
  ProviderProblemQuery,
} from '../providers/problem-provider'
import type { ProviderCapabilityMap } from '../providers/provider-adapter'
import type { ProblemMetadataCache } from '../providers/problem-metadata-cache'
import type { ProblemContentCacheRepository } from '../../repositories/problem-content-cache-repository'
import {
  LeetCodeQuestionListEnvelopeSchema,
  LeetCodeQuestionContentEnvelopeSchema,
  LeetCodeQuestionSchema,
  LeetCodeTopicSchema,
} from './leetcode-schemas'
import { createLeetCodeProblemUrl } from './leetcode-url'

const leetcodeSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)+$/

export type LeetCodeProviderOptions = {
  baseUrl?: string
  cacheTtlMs?: number
  contentCacheTtlMs?: number
  timeoutMs?: number
  maxAttempts?: number
  minRequestIntervalMs?: number
  pageSize?: number
  maxPages?: number
  fetchImpl?: typeof fetch
  requestGate?: RequestGate
  metadataCache?: ProblemMetadataCache
  contentCache?: ProblemContentCacheRepository
  catalogEnabled?: boolean
  contentEnabled?: boolean
}

const normalizeDifficulty = (value: string) => {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'easy') return 'easy' as const
  if (normalized === 'medium') return 'medium' as const
  if (normalized === 'hard') return 'hard' as const
  return undefined
}

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const query = `query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) { questionList(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters) { totalNum data { acRate difficulty questionId isPaidOnly title titleSlug topicTags { name slug } } } }`

const contentQuery = `query questionData($titleSlug: String!) { question(titleSlug: $titleSlug) { questionId title content isPaidOnly hints } }`

const invalidResponse = () =>
  new ProviderError('LeetCode returned an invalid problem catalog.', {
    code: 'PROVIDER_INVALID_RESPONSE',
    provider: 'leetcode',
    retryable: false,
  })

const contentSafeForPaidProblem = (
  content: ReturnType<typeof ProblemContentSchema.parse>,
) =>
  content.isPaidOnly
    ? problemContentFromLeetCode({
        externalId: content.externalId,
        canonicalUrl: content.canonicalUrl,
        title: content.title,
        isPaidOnly: true,
        sourceUrl: content.provenance.sourceUrl,
        fetchedAt: content.provenance.fetchedAt,
      })
    : content

export class LeetCodeProvider implements ProblemProvider {
  readonly key = 'leetcode' as const
  readonly capabilities: ProviderCapabilityMap

  private readonly endpoint: URL
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly maxAttempts: number
  private readonly pageSize: number
  private readonly maxPages: number
  private readonly requestGate: RequestGate
  private readonly catalog: CachedCatalogProvider
  private readonly titleSlugByExternalId = new Map<string, string>()
  private readonly paidOnlyByExternalId = new Map<string, boolean>()
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

  constructor(options: LeetCodeProviderOptions = {}) {
    const baseUrl = options.baseUrl ?? 'https://leetcode.com/graphql'
    const base = new URL(baseUrl)
    const hasCustomFetch = options.fetchImpl !== undefined
    if (
      base.protocol !== 'https:' ||
      !isProviderHostnameAllowed(
        this.key,
        base.hostname,
        'leetcode.com',
        hasCustomFetch,
      ) ||
      base.username !== '' ||
      base.password !== '' ||
      base.port !== '' ||
      base.search !== '' ||
      base.hash !== ''
    ) {
      throw new Error(
        'LEETCODE_GRAPHQL_URL must be an HTTPS URL on leetcode.com without credentials, query parameters, fragments, or a custom port.',
      )
    }
    this.endpoint = base
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = options.timeoutMs ?? 8000
    this.maxAttempts = options.maxAttempts ?? 2
    this.pageSize = Math.min(Math.max(options.pageSize ?? 100, 1), 100)
    this.maxPages = Math.min(Math.max(options.maxPages ?? 10, 1), 50)
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
      label: 'LeetCode',
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
    queryParams: ProviderProblemQuery,
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
            message: 'LeetCode catalog synchronization is disabled.',
          }),
        ],
      }
    }
    const result = await this.catalog.search(queryParams, request)
    for (const problem of result.problems) {
      const titleSlug = /\/problems\/([^/]+)\/?$/i.exec(
        problem.canonicalUrl,
      )?.[1]
      if (titleSlug !== undefined) {
        this.titleSlugByExternalId.set(problem.externalId, titleSlug)
      }
      if (problem.isPaidOnly !== undefined) {
        this.paidOnlyByExternalId.set(problem.externalId, problem.isPaidOnly)
      }
    }
    return result
  }

  private readonly contestProblemCache = new Map<
    string,
    { problems: ContestProblemLink[]; expiresAtMs: number }
  >()

  async contestProblems(
    contestCode: string,
    _hint: ContestProblemsHint,
    request: ProblemProviderRequest = {},
  ): Promise<ContestProblemLink[]> {
    const cached = this.contestProblemCache.get(contestCode)
    if (cached !== undefined && cached.expiresAtMs > Date.now()) {
      return cached.problems
    }
    const body = await fetchProviderJson({
      provider: this.key,
      url: this.endpoint,
      allowedHostname: 'leetcode.com',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        referer: `https://leetcode.com/contest/${contestCode}/`,
      },
      body: JSON.stringify({
        query: leetcodeContestQuery,
        variables: { contestSlug: contestCode },
      }),
      requestGate: this.requestGate,
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      maxAttempts: 1,
      maxResponseBytes: 200_000,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      ...(request.requestId === undefined
        ? {}
        : { requestId: request.requestId }),
    } satisfies ProviderHttpRequest)
    const parsed = LeetCodeContestSchema.safeParse(body)
    if (!parsed.success || parsed.data.errors?.length) return []
    const problems = leetcodeContestProblems(parsed.data)
    this.contestProblemCache.set(contestCode, {
      problems,
      expiresAtMs: Date.now() + 6 * 3_600_000,
    })
    return problems
  }

  async communitySolutions(
    externalId: string,
    language: string,
    request: ProblemProviderRequest = {},
  ): Promise<CommunitySolutionLink[]> {
    const tag = leetcodeLanguageTag(language)
    let titleSlug = this.titleSlugByExternalId.get(externalId)
    if (titleSlug === undefined && leetcodeSlugPattern.test(externalId)) {
      titleSlug = externalId
    }
    if (titleSlug === undefined || tag === undefined) return []
    const body = await fetchProviderJson({
      provider: this.key,
      url: this.endpoint,
      allowedHostname: 'leetcode.com',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        referer: `https://leetcode.com/problems/${titleSlug}/solutions/`,
      },
      body: JSON.stringify({
        query: leetcodeSolutionsQuery,
        variables: {
          questionSlug: titleSlug,
          orderBy: 'MOST_VOTES',
          tagSlugs: [tag],
          skip: 0,
          first: 3,
        },
      }),
      requestGate: this.requestGate,
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      maxAttempts: 1,
      maxResponseBytes: 500_000,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      ...(request.requestId === undefined
        ? {}
        : { requestId: request.requestId }),
    } satisfies ProviderHttpRequest)
    const parsed = LeetCodeSolutionsEnvelopeSchema.safeParse(body)
    if (!parsed.success || parsed.data.errors?.length) return []
    return leetcodeCommunitySolutions(parsed.data, titleSlug, language)
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
            message: 'LeetCode problem content retrieval is disabled.',
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
            content: contentSafeForPaidProblem(persisted.content),
            expiresAtMs: persisted.expiresAtMs,
          }
          this.contentCache.set(externalId, cached)
        }
      } catch {
        // Continue with a provider request when the cache is unavailable.
      }
    }
    const now = Date.now()
    if (cached !== undefined && now < cached.expiresAtMs) {
      return {
        content: contentSafeForPaidProblem(cached.content),
        freshness: this.getHealth(),
        warnings: [],
      }
    }
    try {
      let titleSlug = this.titleSlugByExternalId.get(externalId)
      let isPaidOnly = this.paidOnlyByExternalId.get(externalId)
      if (titleSlug === undefined) {
        await this.search({}, request)
        titleSlug = this.titleSlugByExternalId.get(externalId)
        isPaidOnly = this.paidOnlyByExternalId.get(externalId)
      }
      // Recent contest problems can be missing from the bounded catalog; a
      // validated slug is itself a question identifier the API accepts.
      if (titleSlug === undefined && leetcodeSlugPattern.test(externalId)) {
        titleSlug = externalId
      }
      if (titleSlug === undefined) {
        return { content: null, freshness: this.getHealth(), warnings: [] }
      }
      if (isPaidOnly === true) {
        return { content: null, freshness: this.getHealth(), warnings: [] }
      }
      const body = await fetchProviderJson({
        provider: this.key,
        url: this.endpoint,
        allowedHostname: 'leetcode.com',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          referer: 'https://leetcode.com/',
        },
        body: JSON.stringify({
          query: contentQuery,
          variables: { titleSlug },
        }),
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
      const parsed = LeetCodeQuestionContentEnvelopeSchema.safeParse(body)
      if (!parsed.success || parsed.data.errors?.length) throw invalidResponse()
      const question = parsed.data.data?.question
      if (question === null || question === undefined) {
        return { content: null, freshness: this.getHealth(), warnings: [] }
      }
      const canonicalUrl = createLeetCodeProblemUrl(titleSlug)
      const content = problemContentFromLeetCode({
        externalId,
        canonicalUrl,
        title: question.title,
        ...(question.content === undefined
          ? {}
          : { content: question.content }),
        ...(question.hints === undefined ? {} : { hints: question.hints }),
        isPaidOnly: question.isPaidOnly,
        sourceUrl: this.endpoint.toString(),
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
      if (cached === undefined) throw error
      const providerError =
        error instanceof ProviderError
          ? error
          : new ProviderError('LeetCode problem content is unavailable.', {
              code: 'PROVIDER_UNAVAILABLE',
              provider: this.key,
              retryable: true,
              cause: error,
            })
      const cachedContent = contentSafeForPaidProblem(cached.content)
      const staleContent = ProblemContentSchema.parse({
        ...cachedContent,
        completeness: 'partial',
        provenance: {
          ...cachedContent.provenance,
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
              'Showing cached LeetCode problem content while the provider is unavailable.',
          }),
        ],
      }
    }
  }

  private async fetchPage(skip: number, request: ProblemProviderRequest) {
    const body: ProviderHttpRequest = {
      provider: this.key,
      url: this.endpoint,
      allowedHostname: 'leetcode.com',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: {
          categorySlug: '',
          limit: this.pageSize,
          skip,
          filters: {},
        },
      }),
      requestGate: this.requestGate,
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      maxAttempts: this.maxAttempts,
      maxResponseBytes: 2_000_000,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      ...(request.requestId === undefined
        ? {}
        : { requestId: request.requestId }),
    }
    const response = await fetchProviderJson(body)
    const parsed = LeetCodeQuestionListEnvelopeSchema.safeParse(response)
    if (!parsed.success) throw invalidResponse()
    return parsed.data.data.questionList
  }

  private async fetchCatalog(
    request: ProblemProviderRequest,
  ): Promise<CatalogRefreshResult> {
    const firstPage = await this.fetchPage(0, request)
    const pages = [firstPage]
    const pageCount = Math.min(
      this.maxPages,
      Math.max(1, Math.ceil(firstPage.totalNum / this.pageSize)),
    )
    for (let page = 1; page < pageCount; page += 1) {
      pages.push(await this.fetchPage(page * this.pageSize, request))
    }

    const fetchedAt = new Date().toISOString()
    const problems: ExternalProblemSummary[] = []
    let invalidRecords = 0
    for (const page of pages) {
      for (const raw of page.data) {
        const parsed = LeetCodeQuestionSchema.safeParse(raw)
        if (!parsed.success) {
          invalidRecords += 1
          continue
        }
        const question = parsed.data
        this.titleSlugByExternalId.set(
          String(question.questionId),
          question.titleSlug,
        )
        this.titleSlugByExternalId.set(question.titleSlug, question.titleSlug)
        this.paidOnlyByExternalId.set(
          String(question.questionId),
          question.isPaidOnly,
        )
        let canonicalUrl: string
        try {
          canonicalUrl = createLeetCodeProblemUrl(question.titleSlug)
        } catch {
          invalidRecords += 1
          continue
        }
        const tags = (question.topicTags ?? []).flatMap((tag) => {
          const result = LeetCodeTopicSchema.safeParse(tag)
          if (!result.success) return []
          return [result.data.slug ?? result.data.name ?? '']
        })
        const providerTags = tags.filter(Boolean).map(slugify)
        const topics = [
          'leetcode',
          ...providerTags.map(slugify).filter(Boolean),
        ]
        const candidate = ExternalProblemSummarySchema.safeParse({
          provider: this.key,
          externalId: String(question.questionId),
          title: question.title,
          canonicalUrl,
          providerDifficulty: question.difficulty,
          ...(normalizeDifficulty(question.difficulty) === undefined
            ? {}
            : {
                normalizedDifficulty: normalizeDifficulty(question.difficulty),
              }),
          providerTags: ['leetcode', ...providerTags],
          topics,
          ...(question.acRate === undefined
            ? {}
            : { acceptanceRate: Math.min(100, question.acRate) }),
          isPaidOnly: question.isPaidOnly,
          contentAvailable: !question.isPaidOnly,
          sourceUrl: this.endpoint.toString(),
          extractionStrategy: 'public_graphql',
          schemaVersion: 'leetcode-question-list-v2',
          completeness:
            firstPage.totalNum <= pages.length * this.pageSize
              ? 'complete'
              : 'partial',
          stale: false,
          fetchedAt,
        })
        if (candidate.success) problems.push(candidate.data)
        else invalidRecords += 1
      }
    }
    if (problems.length === 0) throw invalidResponse()
    const complete =
      invalidRecords === 0 &&
      firstPage.totalNum <= pages.length * this.pageSize &&
      problems.length >= firstPage.totalNum
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
                'Some LeetCode problem records were rejected during validation.',
            }),
          ]
    return {
      problems: validatedProblems,
      warnings,
      complete,
    }
  }
}
