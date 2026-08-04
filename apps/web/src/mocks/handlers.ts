import {
  ApiErrorResponseSchema,
  ProblemCatalogQueryParamsSchema,
  ProblemCatalogResponseSchema,
  ProblemSummarySchema,
  SingleProblemResponseSchema,
  TopicsResponseSchema,
} from '@algomemtor/shared-contracts'
import { delay, http, HttpResponse, type RequestHandler } from 'msw'

import { problemFixtures } from './fixtures/problems'
import { topicFixtures } from './fixtures/topics'

const mockDelayMs = 300

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
  http.get('/api/topics', () => HttpResponse.json(topicsResponse)),
  http.get('/api/problems', async ({ request }) => {
    await delay(mockDelayMs)

    const url = new URL(request.url)
    const rawQuery = Object.fromEntries(url.searchParams)
    const queryResult = ProblemCatalogQueryParamsSchema.safeParse(rawQuery)

    if (!queryResult.success) {
      const errorResponse = createApiError(
        'INVALID_QUERY_PARAMETERS',
        'The problem catalog query parameters are invalid.',
        queryResult.error.issues,
      )

      return HttpResponse.json(errorResponse, { status: 400 })
    }

    const { search, difficulty, topic, status, page, pageSize } =
      queryResult.data
    let filteredProblems = problemFixtures

    if (search) {
      const normalizedSearch = normalizeSearchText(search)
      filteredProblems = filteredProblems.filter((problem) =>
        normalizeSearchText(problem.title).includes(normalizedSearch),
      )
    }

    if (difficulty) {
      filteredProblems = filteredProblems.filter(
        (problem) => problem.difficulty === difficulty,
      )
    }

    if (topic) {
      filteredProblems = filteredProblems.filter((problem) =>
        problem.topics.includes(topic),
      )
    }

    if (status) {
      filteredProblems = filteredProblems.filter(
        (problem) => problem.status === status,
      )
    }

    const total = filteredProblems.length
    const totalPages = Math.ceil(total / pageSize)
    const startIndex = (page - 1) * pageSize
    const endIndex = startIndex + pageSize
    const summaries = filteredProblems
      .slice(startIndex, endIndex)
      .map((problem) => ProblemSummarySchema.parse(problem))
    const catalogResponse = ProblemCatalogResponseSchema.parse({
      data: summaries,
      meta: {
        page,
        pageSize,
        total,
        totalPages,
      },
    })

    return HttpResponse.json(catalogResponse)
  }),
  http.get('/api/problems/:problemId', async ({ params }) => {
    await delay(mockDelayMs)

    const problemId = String(params.problemId ?? '')
    const problem = problemFixtures.find(
      (fixture) => fixture.id === problemId || fixture.slug === problemId,
    )

    if (!problem) {
      const errorResponse = createApiError(
        'PROBLEM_NOT_FOUND',
        'The requested problem could not be found.',
        { problemId },
      )

      return HttpResponse.json(errorResponse, { status: 404 })
    }

    const problemResponse = SingleProblemResponseSchema.parse({
      data: problem,
    })

    return HttpResponse.json(problemResponse)
  }),
]
