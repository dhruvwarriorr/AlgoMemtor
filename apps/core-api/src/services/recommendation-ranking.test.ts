import {
  LearnerProfileSchema,
  type ExternalProblemSummary,
} from '@algomemtor/shared-contracts'
import { describe, expect, it } from 'vitest'

import type { ProblemActionRecord } from '../repositories/problem-action-repository.js'
import {
  deriveRankingProfile,
  deriveRecommendationHistory,
  rankRecommendations,
} from './recommendation-ranking.js'

const authId = '00000000-0000-4000-8000-000000000001'

const problem = (
  externalId: string,
  rating: number,
  topics: string[],
  solvedCount = 100,
): ExternalProblemSummary => ({
  provider: 'codeforces',
  externalId,
  title: `Problem ${externalId}`,
  canonicalUrl: `https://codeforces.com/problemset/problem/${externalId.slice(0, -1)}/${externalId.slice(-1)}`,
  providerDifficulty: rating,
  normalizedDifficulty:
    rating <= 1000 ? 'easy' : rating <= 1500 ? 'medium' : 'hard',
  providerTags: topics,
  topics,
  solvedCount,
  fetchedAt: '2026-09-10T00:00:00.000Z',
})

const action = (
  externalId: string,
  actionType: ProblemActionRecord['actionType'],
  occurredAt: string,
  options: Partial<
    Pick<ProblemActionRecord, 'learnerStatus' | 'evidenceSource'>
  > = {},
): ProblemActionRecord => ({
  id: crypto.randomUUID(),
  provider: 'codeforces',
  externalId,
  actionType,
  occurredAt: new Date(occurredAt),
  ...(options.learnerStatus === undefined
    ? {}
    : { learnerStatus: options.learnerStatus }),
  ...(options.evidenceSource === undefined
    ? {}
    : { evidenceSource: options.evidenceSource }),
})

const profile = LearnerProfileSchema.parse({
  experience: 'beginner',
  difficultyComfort: 'let_algomemtor_decide',
  goal: 'improve_problem_solving',
  topicPreference: { mode: 'selected', topics: ['graphs'] },
  preferredTopics: ['strings'],
  platformPreferences: {
    platforms: ['codeforces'],
    standings: [],
  },
  ratingComfortRange: {
    platform: 'codeforces',
    min: 1200,
    max: 1400,
  },
  learningPreferences: ['solve_problems_directly'],
  onboardingCompleted: true,
})

describe('deterministic recommendation ranking', () => {
  it('gives an explicit Codeforces range precedence over other difficulty signals', () => {
    expect(deriveRankingProfile(profile)).toMatchObject({
      focusTopics: ['graphs'],
      preferredTopics: ['strings'],
      ratingBand: { min: 1200, max: 1400 },
      providerPreferred: true,
    })
  })

  it('uses a safe cold-start profile', () => {
    expect(deriveRankingProfile(null)).toMatchObject({
      focusTopics: ['implementation', 'math', 'sorting', 'strings'],
      ratingBand: { min: 800, max: 1000 },
      profileSource: 'cold_start',
    })
  })

  it('uses the Codeforces standing for let-me-decide profiles', () => {
    const standingProfile = LearnerProfileSchema.parse({
      ...profile,
      platformPreferences: {
        platforms: ['codeforces'],
        standings: [{ platform: 'codeforces', metric: 'rating', value: 500 }],
      },
      ratingComfortRange: undefined,
    })

    expect(deriveRankingProfile(standingProfile).ratingBand).toEqual({
      min: 800,
      max: 800,
    })
  })

  it('removes explicitly excluded topics from the profile and candidates', () => {
    const excludedProfile = LearnerProfileSchema.parse({
      ...profile,
      topicPreference: { mode: 'selected', topics: ['linked-lists', 'graphs'] },
      preferredTopics: ['linked-lists', 'strings'],
      recommendationPreference:
        "I don't want practice linked list, so don't mention it anywhere.",
    })
    const rankingProfile = deriveRankingProfile(excludedProfile)
    const candidates = [
      problem('150A', 1300, ['linked-list']),
      problem('151A', 1300, ['linked-lists']),
      problem('152A', 1300, ['graphs']),
    ]

    expect(rankingProfile).toMatchObject({
      focusTopics: ['graphs'],
      preferredTopics: ['strings'],
      excludedTopics: ['linked-lists'],
    })
    expect(
      rankRecommendations({
        candidates,
        history: deriveRecommendationHistory([], [], candidates),
        profile: rankingProfile,
      }).map(({ problem: item }) => item.externalId),
    ).toEqual(['152A'])
  })

  it('excludes solved and dismissed records and rewards attempted-topic revision', () => {
    const candidates = [
      problem('100A', 1300, ['graphs'], 1_000),
      problem('101A', 1300, ['graphs'], 900),
      problem('102A', 1300, ['strings'], 800),
      problem('103A', 800, ['implementation'], 700),
    ]
    const actions = [
      action('100A', 'status_changed', '2026-09-01T00:00:00.000Z', {
        learnerStatus: 'solved',
        evidenceSource: 'manual',
      }),
      action('101A', 'dismissed', '2026-09-02T00:00:00.000Z'),
      action('102A', 'status_changed', '2026-09-03T00:00:00.000Z', {
        learnerStatus: 'attempted',
        evidenceSource: 'manual',
      }),
    ]
    const history = deriveRecommendationHistory(actions, [], candidates)
    const ranked = rankRecommendations({
      candidates,
      history,
      profile: deriveRankingProfile(profile),
    })

    expect(ranked.map(({ problem: item }) => item.externalId)).toEqual([
      '102A',
      '103A',
    ])
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0)
  })

  it('is reproducible and prefers a new mix on refresh', () => {
    const candidates = Array.from({ length: 20 }, (_, index) =>
      problem(
        `${200 + index}A`,
        800 + (index % 4) * 100,
        index % 2 === 0 ? ['graphs'] : ['strings'],
        100 + index,
      ),
    )
    const history = deriveRecommendationHistory([], [], candidates)
    const rankingProfile = deriveRankingProfile(profile)
    const first = rankRecommendations({
      candidates,
      history,
      profile: rankingProfile,
    })
    const refreshed = rankRecommendations({
      candidates,
      history: {
        ...history,
        recentRecommendationIds: new Set(
          first
            .slice(0, 3)
            .map(({ problem: item }) => `${item.provider}:${item.externalId}`),
        ),
      },
      profile: rankingProfile,
      preferNewItems: true,
    })

    expect(
      rankRecommendations({ candidates, history, profile: rankingProfile }).map(
        ({ problem: item, reason, score }) => [item.externalId, score, reason],
      ),
    ).toEqual(
      first.map(({ problem: item, reason, score }) => [
        item.externalId,
        score,
        reason,
      ]),
    )
    expect(
      refreshed.slice(0, 3).map(({ problem: item }) => item.externalId),
    ).not.toEqual(first.slice(0, 3).map(({ problem: item }) => item.externalId))
  })

  it('uses the requested tie-break order and exhausts refresh alternatives first', () => {
    const candidates = Array.from({ length: 12 }, (_, index) =>
      problem(
        `${300 + index}A`,
        index < 10 ? 800 : 2400,
        index < 10 ? ['implementation'] : ['graphs'],
        index < 10 ? 10_000 - index : 1,
      ),
    )
    const recentRecommendationIds = new Set(
      candidates
        .slice(0, 10)
        .map(({ provider, externalId }) => `${provider}:${externalId}`),
    )
    const rankingProfile = deriveRankingProfile(null)
    const refreshed = rankRecommendations({
      candidates,
      history: {
        attemptedProblemIds: new Set(),
        attemptedTopics: new Set(),
        solvedProblemIds: new Set(),
        dismissedProblemIds: new Set(),
        recentRecommendationIds,
      },
      profile: rankingProfile,
      preferNewItems: true,
    })

    expect(
      refreshed.slice(0, 2).map(({ problem: item }) => item.externalId),
    ).toEqual(['310A', '311A'])
  })

  it('can produce the bounded forty-candidate AI shortlist', () => {
    const candidates = Array.from({ length: 50 }, (_, index) =>
      problem(
        `${400 + index}A`,
        800 + (index % 8) * 100,
        index % 2 === 0 ? ['graphs'] : ['strings'],
        1_000 - index,
      ),
    )

    expect(
      rankRecommendations({
        candidates,
        history: deriveRecommendationHistory([], [], candidates),
        profile: deriveRankingProfile(profile),
        limit: 40,
      }),
    ).toHaveLength(40)
  })
})
