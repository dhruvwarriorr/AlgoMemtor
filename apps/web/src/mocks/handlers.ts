import {
  ApiErrorResponseSchema,
  ExternalProblemCatalogQueryParamsSchema,
  ExternalProblemCatalogResponseSchema,
  ExternalProblemSummarySchema,
  OutboundEventRequestSchema,
  OutboundEventResponseSchema,
  ProvidersResponseSchema,
  TopicsResponseSchema,
} from '@algomemtor/shared-contracts'
import { delay, http, HttpResponse, type RequestHandler } from 'msw'

import { problemFixtures } from './fixtures/problems'
import { topicFixtures } from './fixtures/topics'

const mockDelayMs = 300

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
    const catalogResponse = ExternalProblemCatalogResponseSchema.parse({
      data: summaries,
      meta: {
        page,
        pageSize,
        total,
        totalPages,
        partial: false,
        warnings: [],
      },
    })

    return HttpResponse.json(catalogResponse)
  }),
  http.post('/api/outbound-events', async ({ request }) => {
    await delay(mockDelayMs)

    let requestBody: unknown

    try {
      requestBody = await request.json()
    } catch {
      const errorResponse = createApiError(
        'INVALID_OUTBOUND_EVENT',
        'The outbound event request body must be valid JSON.',
        [],
      )

      return HttpResponse.json(errorResponse, { status: 400 })
    }

    const eventResult = OutboundEventRequestSchema.safeParse(requestBody)

    if (!eventResult.success) {
      const errorResponse = createApiError(
        'INVALID_OUTBOUND_EVENT',
        'The outbound event request body is invalid.',
        eventResult.error.issues,
      )

      return HttpResponse.json(errorResponse, { status: 400 })
    }

    const referencedProblem = problemFixtures.find(
      (problem) =>
        problem.provider === eventResult.data.provider &&
        problem.externalId === eventResult.data.externalId,
    )

    if (!referencedProblem) {
      const errorResponse = createApiError(
        'PROBLEM_NOT_FOUND',
        'The referenced external problem does not exist.',
        {
          provider: eventResult.data.provider,
          externalId: eventResult.data.externalId,
        },
      )

      return HttpResponse.json(errorResponse, { status: 404 })
    }

    const outboundEventResponse = OutboundEventResponseSchema.parse({
      data: {
        ...eventResult.data,
        recordedAt: new Date().toISOString(),
      },
    })

    return HttpResponse.json(outboundEventResponse, { status: 201 })
  }),
]
