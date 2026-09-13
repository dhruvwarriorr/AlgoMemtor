import type { AddressInfo } from 'node:net'

import {
  ApiErrorResponseSchema,
  LearnerProfileResponseSchema,
} from '@algomemtor/shared-contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApp } from './app.js'
import type { SupabaseJwtVerifier } from './auth/supabase-jwt.js'
import { CodeforcesProvider } from './integrations/codeforces/codeforces-provider.js'
import { InMemoryLearnerProfileRepository } from './repositories/learner-profile-repository.js'

const firstSubject = '00000000-0000-4000-8000-000000000001'
const secondSubject = '00000000-0000-4000-8000-000000000002'
const firstAuthorization = { authorization: 'Bearer first-access-token' }
const secondAuthorization = { authorization: 'Bearer second-access-token' }

const validProfile = {
  experience: 'beginner',
  difficultyComfort: 'let_algomemtor_decide',
  goal: 'build_consistent_habit',
  topicPreference: { mode: 'let_algomemtor_suggest' },
  preferredTopics: [],
  platformPreferences: { platforms: [] },
  learningPreferences: ['mixed_approach'],
} as const

const jwtVerifier: SupabaseJwtVerifier = async (token) => {
  const subject =
    token === 'first-access-token'
      ? firstSubject
      : token === 'second-access-token'
        ? secondSubject
        : null

  if (subject === null) {
    throw new Error('Invalid test access token.')
  }

  return {
    subject,
    claims: { role: 'authenticated' },
  }
}

const servers: ReturnType<ReturnType<typeof createApp>['listen']>[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) =>
            error === undefined ? resolve() : reject(error),
          )
        }),
    ),
  )
})

const startApp = () => {
  const provider = new CodeforcesProvider({
    baseUrl: 'https://mock.codeforces.test/api',
    fetchImpl: vi.fn(),
    minRequestIntervalMs: 0,
  })
  const server = createApp({
    jwtVerifier,
    learnerProfileRepository: new InMemoryLearnerProfileRepository(),
    problemProvider: provider,
  }).listen(0)
  servers.push(server)
  const address = server.address() as AddressInfo

  return `http://127.0.0.1:${address.port}`
}

const saveProfile = (
  baseUrl: string,
  profile: unknown,
  headers: Record<string, string> = firstAuthorization,
) =>
  fetch(`${baseUrl}/api/learner-profile`, {
    method: 'PUT',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(profile),
  })

describe('learner profile API', () => {
  it('requires authentication before reading or validating profile data', async () => {
    const baseUrl = startApp()
    const getResponse = await fetch(`${baseUrl}/api/learner-profile`)
    const putResponse = await saveProfile(baseUrl, { invalid: true }, {})

    expect(getResponse.status).toBe(401)
    expect(getResponse.headers.get('www-authenticate')).toBe('Bearer')
    expect(putResponse.status).toBe(401)
    expect(putResponse.headers.get('www-authenticate')).toBe('Bearer')
  })

  it('returns null until the authenticated learner creates a profile', async () => {
    const response = await fetch(`${startApp()}/api/learner-profile`, {
      headers: firstAuthorization,
    })

    expect(response.status).toBe(200)
    expect(LearnerProfileResponseSchema.parse(await response.json())).toEqual({
      data: null,
    })
  })

  it('validates, saves, and returns a profile without provider linking', async () => {
    const baseUrl = startApp()
    const putResponse = await saveProfile(baseUrl, validProfile)
    const saved = LearnerProfileResponseSchema.parse(await putResponse.json())
    const getResponse = await fetch(`${baseUrl}/api/learner-profile`, {
      headers: firstAuthorization,
    })

    expect(putResponse.status).toBe(200)
    expect(saved.data).toEqual({
      ...validProfile,
      platformPreferences: { platforms: [], standings: [] },
      onboardingCompleted: true,
    })
    expect(
      LearnerProfileResponseSchema.parse(await getResponse.json()),
    ).toEqual(saved)
  })

  it('replaces the authenticated learner profile when it is edited', async () => {
    const baseUrl = startApp()
    await saveProfile(baseUrl, validProfile)

    const response = await saveProfile(baseUrl, {
      ...validProfile,
      experience: 'intermediate',
      goal: 'prepare_for_coding_interviews',
    })
    const saved = LearnerProfileResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(saved.data).toMatchObject({
      experience: 'intermediate',
      goal: 'prepare_for_coding_interviews',
      onboardingCompleted: true,
    })
  })

  it('persists an optional recommendation note separately and clears it by omission', async () => {
    const baseUrl = startApp()
    const withPreference = await saveProfile(baseUrl, {
      ...validProfile,
      additionalConsiderations: 'Keep weekday sessions short.',
      recommendationPreference: 'Prefer graph revision this week.',
    })
    const saved = LearnerProfileResponseSchema.parse(
      await withPreference.json(),
    )

    expect(saved.data).toMatchObject({
      additionalConsiderations: 'Keep weekday sessions short.',
      recommendationPreference: 'Prefer graph revision this week.',
    })

    const clearedResponse = await saveProfile(baseUrl, validProfile)
    const cleared = LearnerProfileResponseSchema.parse(
      await clearedResponse.json(),
    )
    expect(cleared.data).not.toHaveProperty('recommendationPreference')
    expect(cleared.data).not.toHaveProperty('additionalConsiderations')
  })

  it('returns a stable validation error and rejects browser-supplied ownership', async () => {
    const baseUrl = startApp()
    const response = await saveProfile(baseUrl, {
      ...validProfile,
      userId: secondSubject,
    })
    const error = ApiErrorResponseSchema.parse(await response.json())

    expect(response.status).toBe(400)
    expect(error.error.code).toBe('INVALID_LEARNER_PROFILE')

    const getResponse = await fetch(`${baseUrl}/api/learner-profile`, {
      headers: firstAuthorization,
    })
    expect(
      LearnerProfileResponseSchema.parse(await getResponse.json()).data,
    ).toBeNull()
  })

  it('isolates profiles by the verified JWT subject', async () => {
    const baseUrl = startApp()
    await saveProfile(baseUrl, validProfile, firstAuthorization)

    const secondUserResponse = await fetch(`${baseUrl}/api/learner-profile`, {
      headers: secondAuthorization,
    })

    expect(
      LearnerProfileResponseSchema.parse(await secondUserResponse.json()).data,
    ).toBeNull()
  })
})
