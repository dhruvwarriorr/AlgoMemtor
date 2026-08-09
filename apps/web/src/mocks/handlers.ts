import {
  ApiErrorResponseSchema,
  ExternalProblemCatalogQueryParamsSchema,
  ExternalProblemCatalogResponseSchema,
  ExternalProblemSummarySchema,
  ProvidersResponseSchema,
  TopicsResponseSchema,
} from '@algomemtor/shared-contracts'
import { delay, http, HttpResponse, type RequestHandler } from 'msw'

import { problemFixtures } from './fixtures/problems'
import { topicFixtures } from './fixtures/topics'

const mockDelayMs = 300
const transientScenarioFailureCounts = new Map<string, number>()

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
  http.get('/api/providers', () => HttpResponse.json(providersResponse)),
  http.get('/api/topics', () => HttpResponse.json(topicsResponse)),
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
