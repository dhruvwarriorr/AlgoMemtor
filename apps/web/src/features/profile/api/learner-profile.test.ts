import { afterEach, describe, expect, it, vi } from 'vitest'

const authenticatedFetchMock = vi.hoisted(() =>
  vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(),
)

vi.mock('@/features/auth/authenticated-fetch', () => ({
  authenticatedFetch: authenticatedFetchMock,
}))

import { ApiClientError } from '@/features/discovery/api/client'

import { fetchLearnerProfile, saveLearnerProfile } from './learner-profile'

const answers = {
  experience: 'beginner' as const,
  difficultyComfort: 'introductory' as const,
  goal: 'improve_problem_solving' as const,
  topicPreference: {
    mode: 'selected' as const,
    topics: ['implementation' as const],
  },
  preferredTopics: [],
  platformPreferences: {
    platforms: ['codeforces' as const],
    standings: [],
  },
  learningPreferences: ['solve_problems_directly' as const],
}

afterEach(() => {
  authenticatedFetchMock.mockReset()
})

describe('learner profile API', () => {
  it('loads the profile through the authenticated client', async () => {
    const responseBody = {
      data: { ...answers, onboardingCompleted: true },
    }
    authenticatedFetchMock.mockResolvedValue(
      Response.json(responseBody, { status: 200 }),
    )

    await expect(fetchLearnerProfile()).resolves.toEqual(responseBody)
    expect(authenticatedFetchMock).toHaveBeenCalledWith(
      '/api/learner-profile',
      expect.objectContaining({ signal: undefined }),
    )
  })

  it('saves the profile with an authenticated JSON PUT request', async () => {
    const responseBody = {
      data: { ...answers, onboardingCompleted: true },
    }
    authenticatedFetchMock.mockResolvedValue(
      Response.json(responseBody, { status: 200 }),
    )

    await expect(saveLearnerProfile(answers)).resolves.toEqual(responseBody)

    const requestInit = authenticatedFetchMock.mock.calls[0]?.[1]
    expect(authenticatedFetchMock.mock.calls[0]?.[0]).toBe(
      '/api/learner-profile',
    )
    expect(requestInit).toMatchObject({ method: 'PUT' })
    expect(new Headers(requestInit?.headers).get('content-type')).toBe(
      'application/json',
    )
    const requestBody = requestInit?.body
    expect(typeof requestBody).toBe('string')

    if (typeof requestBody !== 'string') {
      expect.unreachable('Expected a serialized JSON request body.')
    }

    expect(JSON.parse(requestBody)).toEqual(answers)
  })

  it('rejects a successful response that violates the shared contract', async () => {
    authenticatedFetchMock.mockResolvedValue(
      Response.json({ data: { onboardingCompleted: true } }, { status: 200 }),
    )

    try {
      await fetchLearnerProfile()
      expect.unreachable('Expected the invalid response to be rejected.')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError)
      expect(error).toMatchObject({ code: 'INVALID_RESPONSE' })
    }
  })
})
