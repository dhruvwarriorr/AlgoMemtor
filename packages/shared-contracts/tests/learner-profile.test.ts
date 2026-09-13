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
  topicPreference: {
    mode: 'selected',
    topics: ['graphs', 'dynamic-programming'],
  },
  preferredTopics: ['strings', 'implementation'],
  platformPreferences: {
    platforms: ['codeforces', 'leetcode'],
    standings: [
      { platform: 'codeforces', metric: 'rating', value: 1_350 },
      { platform: 'leetcode', metric: 'ranking', value: 85_000 },
    ],
  },
  ratingComfortRange: {
    platform: 'codeforces',
    min: 1_200,
    max: 1_500,
  },
  learningPreferences: ['learn_concept_then_solve', 'practice_weak_areas'],
  additionalConsiderations: 'Keep weekday sessions short.',
} as const

const answersWithPreference = {
  ...validAnswers,
  recommendationPreference:
    'Prefer graph practice that fits into a focused study session.',
} as const

describe('learner profile contracts', () => {
  it('accepts the complete onboarding questionnaire data', () => {
    expect(LearnerProfileAnswersSchema.parse(validAnswers)).toEqual(
      validAnswers,
    )
  })

  it('supports topic suggestions and onboarding without a platform account', () => {
    const result = LearnerProfileAnswersSchema.parse({
      ...validAnswers,
      topicPreference: { mode: 'let_algomemtor_suggest' },
      platformPreferences: { platforms: [] },
    })

    expect(result.platformPreferences).toEqual({
      platforms: [],
      standings: [],
    })
  })

  it('keeps the saved recommendation preference optional and bounded', () => {
    const withoutPreference = LearnerProfileAnswersSchema.parse(validAnswers)

    expect(withoutPreference).not.toHaveProperty('recommendationPreference')
    expect(
      LearnerProfileAnswersSchema.parse({
        ...validAnswers,
        recommendationPreference: '  Prefer shorter graph problems.  ',
      }).recommendationPreference,
    ).toBe('Prefer shorter graph problems.')
    expect(
      LearnerProfileAnswersSchema.safeParse({
        ...validAnswers,
        recommendationPreference: 'x'.repeat(500),
      }).success,
    ).toBe(true)
    expect(
      LearnerProfileAnswersSchema.safeParse({
        ...validAnswers,
        recommendationPreference: '   ',
      }).success,
    ).toBe(false)
    expect(
      LearnerProfileAnswersSchema.safeParse({
        ...validAnswers,
        recommendationPreference: 'x'.repeat(501),
      }).success,
    ).toBe(false)
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
        anotherTopic: 'Game theory',
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

  it('rejects removed onboarding fields and validates optional text boundaries', () => {
    expect(
      LearnerProfileAnswersSchema.safeParse({
        ...validAnswers,
        target: { event: 'No longer collected' },
      }).success,
    ).toBe(false)

    expect(
      LearnerProfileAnswersSchema.safeParse({
        ...validAnswers,
        practiceAvailability: {
          frequency: 'every_day',
          weeklyMinutes: 120,
          sessionLengthMinutes: 30,
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

    expect(
      LearnerProfileResponseSchema.parse({
        data: { ...answersWithPreference, onboardingCompleted: true },
      }).data?.recommendationPreference,
    ).toBe(answersWithPreference.recommendationPreference)
  })
})
