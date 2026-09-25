import type { LearnerProfile } from '@algomemtor/shared-contracts'
import { describe, expect, it } from 'vitest'

import { calibratedRatingBand } from './recommendation-service.js'

const profile = (answers: Partial<LearnerProfile> = {}): LearnerProfile => ({
  experience: 'beginner',
  difficultyComfort: 'new_to_rated_problems',
  goal: 'improve_problem_solving',
  topicPreference: { mode: 'let_algomemtor_suggest' },
  preferredTopics: [],
  platformPreferences: { platforms: ['codeforces'], standings: [] },
  learningPreferences: ['mixed_approach'],
  onboardingCompleted: true,
  ...answers,
})

const beginnerBand = { min: 800, max: 900 }

describe('recommendation rating band', () => {
  it('follows the observed rating once the onboarding comfort is outgrown', () => {
    // Picked "new to rated problems" at onboarding, now rated 1665.
    expect(calibratedRatingBand(profile(), beginnerBand, 1665)).toEqual({
      min: 1600,
      max: 1900,
    })
  })

  it('keeps the chosen comfort band while it still fits', () => {
    expect(calibratedRatingBand(profile(), beginnerBand, 1100)).toEqual(
      beginnerBand,
    )
  })

  it('always keeps an explicit rating range', () => {
    const chosen = { min: 1000, max: 1200 }
    expect(
      calibratedRatingBand(
        profile({
          ratingComfortRange: { platform: 'codeforces', ...chosen },
        }),
        chosen,
        1900,
      ),
    ).toEqual(chosen)
  })

  it('uses the observed rating when the learner lets AlgoMemtor decide', () => {
    expect(
      calibratedRatingBand(
        profile({ difficultyComfort: 'let_algomemtor_decide' }),
        { min: 1100, max: 1500 },
        1450,
      ),
    ).toEqual({ min: 1400, max: 1700 })
  })
})
