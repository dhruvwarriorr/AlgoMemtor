import { describe, expect, it } from 'vitest'

import {
  LearnerProfileAnswersSchema,
  LearnerProfileResponseSchema,
  PlatformPreferencesSchema,
  TopicPreferenceSchema,
} from '../src/learner-profile.js'
import { ProviderKeySchema } from '../src/problem-catalog.js'

const validAnswers = {
  experience: 'intermediate',
  difficultyComfort: 'medium',
  goal: 'improve_contest_rating',
  target: {
    rating: { platform: 'codeforces', value: 1_600 },
    event: 'Codeforces Round practice target',
    date: '2026-12-31',
  },
  topicPreference: {
    mode: 'selected',
    topics: ['graphs', 'dynamic-programming'],
  },
  practiceAvailability: {
    frequency: 'three_or_four_days',
    sessionLengthMinutes: 60,
  },
  platformPreferences: {
    platforms: ['codeforces', 'leetcode'],
    standings: [
      { platform: 'codeforces', metric: 'rating', value: 1_350 },
      { platform: 'leetcode', metric: 'ranking', value: 85_000 },
    ],
  },
  learningPreferences: ['learn_concept_then_solve', 'practice_weak_areas'],
  additionalConsiderations: 'Keep weekday sessions short.',
} as const

describe('learner profile contracts', () => {
  it('accepts the complete onboarding questionnaire data', () => {
    expect(LearnerProfileAnswersSchema.parse(validAnswers)).toEqual(
      validAnswers,
    )
  })

  it('supports topic suggestions and onboarding without a platform account', () => {
    const { target: _target, ...answersWithoutTarget } = validAnswers
    const result = LearnerProfileAnswersSchema.parse({
      ...answersWithoutTarget,
      topicPreference: { mode: 'let_algomemtor_suggest' },
      platformPreferences: { platforms: [] },
    })

    expect(result.platformPreferences).toEqual({
      platforms: [],
      standings: [],
    })
  })

  it('rejects an empty or oversized selected-topic choice', () => {
    expect(
      TopicPreferenceSchema.safeParse({ mode: 'selected', topics: [] }).success,
    ).toBe(false)

    expect(
      TopicPreferenceSchema.safeParse({
        mode: 'selected',
        topics: [
          'implementation',
          'math',
          'sorting',
          'binary-search',
          'graphs',
        ],
        otherTopic: 'Game theory',
      }).success,
    ).toBe(false)
  })

  it('rejects ratings for unselected platforms and duplicate standings', () => {
    expect(
      PlatformPreferencesSchema.safeParse({
        platforms: ['codeforces'],
        standings: [{ platform: 'leetcode', metric: 'rating', value: 1_500 }],
      }).success,
    ).toBe(false)

    expect(
      PlatformPreferencesSchema.safeParse({
        platforms: ['codeforces'],
        standings: [
          { platform: 'codeforces', metric: 'rating', value: 1_200 },
          { platform: 'codeforces', metric: 'rating', value: 1_300 },
        ],
      }).success,
    ).toBe(false)
  })

  it('does not treat unsupported platform preferences as provider support', () => {
    const result = PlatformPreferencesSchema.parse({
      platforms: ['codechef', 'atcoder', 'leetcode', 'cses', 'hackerrank'],
    })

    expect(result.platforms).not.toContain('codeforces')
    expect(ProviderKeySchema.safeParse('codechef').success).toBe(false)
  })

  it('does not accept provider-linking credentials as profile data', () => {
    expect(
      LearnerProfileAnswersSchema.safeParse({
        ...validAnswers,
        providerAccessToken: 'must-not-enter-the-profile-contract',
      }).success,
    ).toBe(false)
  })

  it('allows rankings only for the questionnaire LeetCode field', () => {
    expect(
      PlatformPreferencesSchema.safeParse({
        platforms: ['codeforces'],
        standings: [
          { platform: 'codeforces', metric: 'ranking', value: 1_000 },
        ],
      }).success,
    ).toBe(false)
  })

  it('validates availability and optional text boundaries', () => {
    expect(
      LearnerProfileAnswersSchema.safeParse({
        ...validAnswers,
        practiceAvailability: {
          frequency: 'every_day',
          sessionLengthMinutes: 0,
        },
      }).success,
    ).toBe(false)

    expect(
      LearnerProfileAnswersSchema.safeParse({
        ...validAnswers,
        additionalConsiderations: 'x'.repeat(1_001),
      }).success,
    ).toBe(false)
  })

  it('represents both missing and completed learner profiles', () => {
    expect(LearnerProfileResponseSchema.parse({ data: null })).toEqual({
      data: null,
    })

    expect(
      LearnerProfileResponseSchema.parse({
        data: { ...validAnswers, onboardingCompleted: true },
      }).data?.onboardingCompleted,
    ).toBe(true)
  })
})
