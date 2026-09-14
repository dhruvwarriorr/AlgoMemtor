import {
  ApiErrorResponseSchema,
  DisconnectProviderAccountResponseSchema,
  ExternalProblemCatalogQueryParamsSchema,
  ExternalProblemCatalogResponseSchema,
  ExternalProblemSummarySchema,
  LearnerProfileResponseSchema,
  LearnerProfileSchema,
  LinkableProviderSchema,
  LinkProviderAccountRequestSchema,
  ProviderAccountResponseSchema,
  ProviderAccountSchema,
  ProviderAccountsResponseSchema,
  RecommendationDismissalResponseSchema,
  RecommendationDismissalsResponseSchema,
  RecommendationFeedbackInputSchema,
  RecommendationFeedbackResponseSchema,
  RecommendationFeedResponseSchema,
  RecommendationRestorationResponseSchema,
  ProvidersResponseSchema,
  SaveLearnerProfileRequestSchema,
  RefreshProviderPublicStatsRequestSchema,
  TopicsResponseSchema,
  type LearnerProfile,
  type LinkableProvider,
  type ProviderAccount,
} from '@algomemtor/shared-contracts'
import { delay, http, HttpResponse, type RequestHandler } from 'msw'

import { problemFixtures } from './fixtures/problems'
import { topicFixtures } from './fixtures/topics'
import { progressHandlers } from './progressHandlers'

const mockDelayMs = 300
const transientScenarioFailureCounts = new Map<string, number>()
let learnerProfile: LearnerProfile | null = null
let providerAccounts: ProviderAccount[] = []
const dismissedRecommendationIds = new Set<string>()
const recommendationFeedback = new Map<
  string,
  {
    usefulness?: 'useful' | 'not_useful'
    perceivedDifficulty?: 'too_easy' | 'about_right' | 'too_hard'
  }
>()
let recommendationGeneration = 0

const profileUrl = (provider: LinkableProvider, handle: string) => {
  const encodedHandle = encodeURIComponent(handle)

  if (provider === 'codeforces') {
    return `https://codeforces.com/profile/${encodedHandle}`
  }

  if (provider === 'codechef') {
    return `https://www.codechef.com/users/${encodedHandle}`
  }

  return `https://leetcode.com/u/${encodedHandle}/`
}

const mockSolvedCounts: Record<LinkableProvider, number> = {
  codeforces: 245,
  codechef: 118,
  leetcode: 176,
}

const mockStatsSources = {
  codeforces: 'codeforces_api',
  codechef: 'codechef_public_profile_html',
  leetcode: 'leetcode_website_graphql',
} as const

const providersResponse = ProvidersResponseSchema.parse({
  data: [
    {
      key: 'codeforces',
      label: 'Codeforces',
      availability: 'available',
    },
  ],
})

const topicsResponse = TopicsResponseSchema.parse({
  data: topicFixtures,
})

const recommendationItemId = (index: number) =>
  `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`

const recommendationProblems = () =>
  problemFixtures.filter(
    (problem) =>
      problem.learnerStatus !== 'solved' &&
      !dismissedRecommendationIds.has(
        `${problem.provider}:${problem.externalId}`,
      ),
  )

const recommendationResponse = () => {
  const generatedAt = new Date().toISOString()
  const items = recommendationProblems()
    .slice(0, 10)
    .map((problem, index) => {
      const id = recommendationItemId(index)
      const feedback = recommendationFeedback.get(id)

      return {
        id,
        provider: problem.provider,
        externalId: problem.externalId,
        position: index + 1,
        score: Number((0.9 - index * 0.01).toFixed(6)),
        reason:
          index % 2 === 0
            ? 'Practises a topic from your current recommendation path.'
            : 'Fits the difficulty range selected for your practice.',
        problem,
        ...(feedback === undefined
          ? {}
          : {
              feedback: {
                id,
                recommendationItemId: id,
                ...feedback,
                createdAt: generatedAt,
                updatedAt: generatedAt,
              },
            }),
      }
    })

  return RecommendationFeedResponseSchema.parse({
    data: {
      id: `00000000-0000-4000-8000-${String(500 + recommendationGeneration).padStart(12, '0')}`,
      generatedAt,
      rankingMode: 'deterministic',
      rankingVersion: 'deterministic-v1',
      items,
    },
    meta: {
      partial: false,
      stale: false,
      warnings: [],
      providers: [],
    },
  })
}

function createApiError(code: string, message: string, details: unknown) {
  return ApiErrorResponseSchema.parse({
    error: {
      code,
      message,
      details,
    },
  })
}

function normalizeSearchText(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

export const handlers: RequestHandler[] = [
  ...progressHandlers,
  http.get('/api/learner-profile', () =>
    HttpResponse.json(
      LearnerProfileResponseSchema.parse({ data: learnerProfile }),
    ),
  ),
  http.put('/api/learner-profile', async ({ request }) => {
    const profileResult = SaveLearnerProfileRequestSchema.safeParse(
      await request.json().catch(() => null),
    )

    if (!profileResult.success) {
      return HttpResponse.json(
        createApiError(
          'INVALID_LEARNER_PROFILE',
          'The learner profile is invalid.',
          profileResult.error.issues,
        ),
        { status: 400 },
      )
    }

    learnerProfile = LearnerProfileSchema.parse({
      ...profileResult.data,
      onboardingCompleted: true,
    })

    return HttpResponse.json(
      LearnerProfileResponseSchema.parse({ data: learnerProfile }),
    )
  }),
  http.get('/api/provider-accounts', () =>
    HttpResponse.json(
      ProviderAccountsResponseSchema.parse({ data: providerAccounts }),
    ),
  ),
  http.put('/api/provider-accounts/:provider', async ({ params, request }) => {
    const providerResult = LinkableProviderSchema.safeParse(params.provider)
    const accountResult = LinkProviderAccountRequestSchema.safeParse(
      await request.json().catch(() => null),
    )

    if (!providerResult.success || !accountResult.success) {
      return HttpResponse.json(
        createApiError(
          'INVALID_PROVIDER_ACCOUNT',
          'The provider account link is invalid or consent is missing.',
          accountResult.success ? [] : accountResult.error.issues,
        ),
        { status: 400 },
      )
    }

    const now = new Date().toISOString()
    const existing = providerAccounts.find(
      ({ provider }) => provider === providerResult.data,
    )
    const preserveStats =
      existing?.handle === accountResult.data.handle && existing !== undefined
    const account = ProviderAccountSchema.parse({
      provider: providerResult.data,
      handle: accountResult.data.handle,
      profileUrl: profileUrl(providerResult.data, accountResult.data.handle),
      consentScope: 'store_public_profile_reference',
      verification: 'not_verified',
      ...(preserveStats
        ? {
            activityAccess: existing.activityAccess,
            ...(existing.publicStatsConsentAt === undefined
              ? {}
              : {
                  publicStatsConsentAt: existing.publicStatsConsentAt,
                }),
            publicStats: existing.publicStats,
          }
        : {
            activityAccess: 'not_enabled',
            publicStats: { status: 'not_synced' },
          }),
      linkedAt: existing?.linkedAt ?? now,
      updatedAt: now,
    })
    providerAccounts = [
      ...providerAccounts.filter(
        ({ provider }) => provider !== providerResult.data,
      ),
      account,
    ]

    return HttpResponse.json(
      ProviderAccountResponseSchema.parse({ data: account }),
    )
  }),
  http.delete('/api/provider-accounts/:provider', ({ params }) => {
    const providerResult = LinkableProviderSchema.safeParse(params.provider)

    if (!providerResult.success) {
      return HttpResponse.json(
        createApiError(
          'UNSUPPORTED_LINK_PROVIDER',
          'That provider cannot be disconnected.',
          [],
        ),
        { status: 400 },
      )
    }

    providerAccounts = providerAccounts.filter(
      ({ provider }) => provider !== providerResult.data,
    )

    return HttpResponse.json(
      DisconnectProviderAccountResponseSchema.parse({
        data: { provider: providerResult.data },
      }),
    )
  }),
  http.post(
    '/api/provider-accounts/:provider/public-stats/refresh',
    async ({ params, request }) => {
      const providerResult = LinkableProviderSchema.safeParse(params.provider)
      const consentResult = RefreshProviderPublicStatsRequestSchema.safeParse(
        await request.json().catch(() => null),
      )
      const account = providerResult.success
        ? providerAccounts.find(
            ({ provider }) => provider === providerResult.data,
          )
        : undefined

      if (!providerResult.success || !consentResult.success) {
        return HttpResponse.json(
          createApiError(
            'PUBLIC_STATS_CONSENT_REQUIRED',
            'Explicit consent is required before public statistics are fetched.',
            [],
          ),
          { status: 400 },
        )
      }

      if (account === undefined) {
        return HttpResponse.json(
          createApiError(
            'PROVIDER_ACCOUNT_NOT_LINKED',
            'Link this provider account before refreshing its public statistics.',
            { provider: providerResult.data },
          ),
          { status: 404 },
        )
      }

      const now = new Date().toISOString()
      const updatedAccount = ProviderAccountSchema.parse({
        ...account,
        activityAccess: 'public_solved_count',
        publicStatsConsentAt: account.publicStatsConsentAt ?? now,
        publicStats: {
          status: 'available',
          solvedCount: mockSolvedCounts[providerResult.data],
          complete: true,
          source: mockStatsSources[providerResult.data],
          fetchedAt: now,
          stale: false,
        },
        updatedAt: now,
      })
      providerAccounts = providerAccounts.map((candidate) =>
        candidate.provider === providerResult.data ? updatedAccount : candidate,
      )

      return HttpResponse.json(
        ProviderAccountResponseSchema.parse({ data: updatedAccount }),
      )
    },
  ),
  http.get('/api/providers', () => HttpResponse.json(providersResponse)),
  http.get('/api/topics', () => HttpResponse.json(topicsResponse)),
  http.get('/api/recommendations', async () => {
    await delay(mockDelayMs)
    return HttpResponse.json(recommendationResponse())
  }),
  http.post('/api/recommendations/refresh', async () => {
    await delay(mockDelayMs)
    recommendationGeneration += 1
    return HttpResponse.json(recommendationResponse())
  }),
  http.patch(
    '/api/recommendation-items/:itemId/feedback',
    async ({ params, request }) => {
      const itemId = String(params.itemId)
      const inputResult = RecommendationFeedbackInputSchema.safeParse(
        await request.json().catch(() => null),
      )

      if (!inputResult.success) {
        return HttpResponse.json(
          createApiError(
            'INVALID_RECOMMENDATION_FEEDBACK',
            'The recommendation feedback is invalid.',
            inputResult.error.issues,
          ),
          { status: 400 },
        )
      }

      const current = recommendationFeedback.get(itemId) ?? {}
      const next = { ...current, ...inputResult.data }
      recommendationFeedback.set(itemId, next)
      const now = new Date().toISOString()

      return HttpResponse.json(
        RecommendationFeedbackResponseSchema.parse({
          data: {
            id: itemId,
            recommendationItemId: itemId,
            ...next,
            createdAt: now,
            updatedAt: now,
          },
        }),
      )
    },
  ),
  http.post('/api/recommendation-items/:itemId/dismiss', ({ params }) => {
    const item = recommendationProblems().find(
      (problem) =>
        recommendationItemId(recommendationProblems().indexOf(problem)) ===
        params.itemId,
    )

    if (item === undefined) {
      return HttpResponse.json(
        createApiError(
          'RECOMMENDATION_ITEM_NOT_FOUND',
          'The recommendation item could not be found.',
          {},
        ),
        { status: 404 },
      )
    }

    dismissedRecommendationIds.add(`${item.provider}:${item.externalId}`)
    return HttpResponse.json(
      RecommendationDismissalResponseSchema.parse({
        data: {
          provider: item.provider,
          externalId: item.externalId,
          dismissedAt: new Date().toISOString(),
          problem: item,
        },
      }),
    )
  }),
  http.get('/api/recommendation-dismissals', () =>
    HttpResponse.json(
      RecommendationDismissalsResponseSchema.parse({
        data: [...dismissedRecommendationIds].map((key) => {
          const separator = key.indexOf(':')
          const provider = key.slice(0, separator)
          const externalId = key.slice(separator + 1)
          const problem = problemFixtures.find(
            (candidate) =>
              `${candidate.provider}:${candidate.externalId}` === key,
          )

          return {
            provider,
            externalId,
            dismissedAt: new Date().toISOString(),
            ...(problem === undefined ? {} : { problem }),
          }
        }),
      }),
    ),
  ),
  http.delete(
    '/api/recommendation-dismissals/:provider/:externalId',
    ({ params }) => {
      const provider = String(params.provider)
      const externalId = String(params.externalId)
      dismissedRecommendationIds.delete(`${provider}:${externalId}`)
      return HttpResponse.json(
        RecommendationRestorationResponseSchema.parse({
          data: { provider, externalId, restored: true },
        }),
      )
    },
  ),
  http.get('/api/problems', async ({ request }) => {
    await delay(mockDelayMs)

    const url = new URL(request.url)
    const rawQuery = Object.fromEntries(url.searchParams)
    const mockScenario = url.searchParams.get('scenario')
    const queryResult =
      ExternalProblemCatalogQueryParamsSchema.safeParse(rawQuery)

    if (!queryResult.success) {
      const errorResponse = createApiError(
        'INVALID_QUERY_PARAMETERS',
        'The external problem catalog query parameters are invalid.',
        queryResult.error.issues,
      )

      return HttpResponse.json(errorResponse, { status: 400 })
    }

    if (mockScenario === 'error') {
      const failureCount =
        (transientScenarioFailureCounts.get(mockScenario) ?? 0) + 1
      transientScenarioFailureCounts.set(mockScenario, failureCount)

      if (failureCount <= 2) {
        const errorResponse = createApiError(
          'CATALOG_REQUEST_FAILED',
          'The problem catalog could not be loaded.',
          { scenario: mockScenario },
        )

        return HttpResponse.json(errorResponse, { status: 500 })
      }
    }

    if (mockScenario === 'rate-limited') {
      const errorResponse = createApiError(
        'PROVIDER_RATE_LIMITED',
        'Codeforces is temporarily rate limiting catalog requests.',
        { provider: 'codeforces' },
      )

      return HttpResponse.json(errorResponse, { status: 429 })
    }

    if (mockScenario === 'unavailable') {
      const errorResponse = createApiError(
        'PROVIDER_UNAVAILABLE',
        'Codeforces is temporarily unavailable.',
        { provider: 'codeforces' },
      )

      return HttpResponse.json(errorResponse, { status: 503 })
    }

    const {
      search,
      provider,
      difficulty,
      topic,
      status,
      minRating,
      maxRating,
      page,
      pageSize,
    } = queryResult.data
    let filteredProblems = problemFixtures

    if (search) {
      const normalizedSearch = normalizeSearchText(search)
      filteredProblems = filteredProblems.filter((problem) =>
        [problem.title, problem.externalId, ...problem.providerTags].some(
          (value) => normalizeSearchText(value).includes(normalizedSearch),
        ),
      )
    }

    if (provider) {
      filteredProblems = filteredProblems.filter(
        (problem) => problem.provider === provider,
      )
    }

    if (difficulty) {
      filteredProblems = filteredProblems.filter(
        (problem) => problem.normalizedDifficulty === difficulty,
      )
    }

    if (topic) {
      filteredProblems = filteredProblems.filter((problem) =>
        problem.topics.includes(topic),
      )
    }

    if (status) {
      filteredProblems = filteredProblems.filter(
        (problem) => problem.learnerStatus === status,
      )
    }

    if (minRating !== undefined || maxRating !== undefined) {
      filteredProblems = filteredProblems.filter((problem) => {
        const rating = problem.providerDifficulty

        return (
          typeof rating === 'number' &&
          (minRating === undefined || rating >= minRating) &&
          (maxRating === undefined || rating <= maxRating)
        )
      })
    }

    const total = filteredProblems.length
    const totalPages = Math.ceil(total / pageSize)
    const startIndex = (page - 1) * pageSize
    const endIndex = startIndex + pageSize
    const summaries = filteredProblems
      .slice(startIndex, endIndex)
      .map((problem) => ExternalProblemSummarySchema.parse(problem))
    const warnings =
      mockScenario === 'partial'
        ? [
            {
              provider: 'codeforces' as const,
              code: 'PARTIAL_RESULTS',
              message:
                'Codeforces returned only part of the catalog. Available problems are shown.',
            },
          ]
        : mockScenario === 'stale'
          ? [
              {
                provider: 'codeforces' as const,
                code: 'STALE_DATA',
                message:
                  'Showing the most recent cached Codeforces catalog while fresh data is unavailable.',
              },
            ]
          : []
    const catalogResponse = ExternalProblemCatalogResponseSchema.parse({
      data: summaries,
      meta: {
        page,
        pageSize,
        total,
        totalPages,
        partial: mockScenario === 'partial',
        warnings,
      },
    })

    return HttpResponse.json(catalogResponse)
  }),
]
