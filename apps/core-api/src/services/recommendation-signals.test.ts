import type {
  ImprovementRoadmap,
  ImprovementTopic,
  ProviderRatingChange,
} from '@algomemtor/shared-contracts'
import { describe, expect, it } from 'vitest'

import {
  deriveRecommendationSignals,
  learnerDayKey,
  SIGNAL_TOPIC_LIMIT,
} from './recommendation-signals.js'

const now = new Date('2026-09-24T12:00:00.000Z')

const topic = (
  slug: string,
  lane: ImprovementTopic['lane'],
  assessment: ImprovementTopic['assessment'],
  score = 0.5,
): ImprovementTopic => ({
  topic: slug,
  name: slug,
  lane,
  assessment,
  score,
  confidence: 0.6,
  reason: 'Test topic.',
  evidence: {
    uniqueProblems: 0,
    solvedProblems: 0,
    attemptedProblems: 0,
    acceptedSubmissions: 0,
    totalSubmissions: 0,
    contestSignals: 0,
    recentDays: 0,
    completeness: 'complete',
    stale: false,
  },
  prerequisites: [],
  suggestions: [],
  updatedAt: now.toISOString(),
})

const roadmap = (topics: ImprovementTopic[]): ImprovementRoadmap => ({
  id: '00000000-0000-4000-8000-000000000099',
  version: 1,
  assessmentVersion: 'topic-assessment-v1',
  topics,
  dataCompleteness: 'complete',
  staleProviders: [],
  generatedAt: now.toISOString(),
})

const ratingChange = (
  provider: ProviderRatingChange['provider'],
  daysAgo: number,
  newRating: number,
  delta: number,
): ProviderRatingChange => ({
  provider,
  eventId: `${provider}-${daysAgo}`,
  occurredAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
  oldRating: newRating - delta,
  newRating,
  delta,
  provenance: {
    provider,
    providerId: `${provider}-${daysAgo}`,
    canonicalUrl: 'https://codeforces.com/contests',
    sourceUrl: 'https://codeforces.com/api/user.rating',
    extractionStrategy: 'official_json',
    schemaVersion: 'test-v1',
    completeness: 'complete',
    fetchedAt: now.toISOString(),
    stale: false,
  },
})

describe('deriveRecommendationSignals', () => {
  it('orders the plan, weak and thin topics without overlap or skipped topics', () => {
    const signals = deriveRecommendationSignals({
      roadmap: roadmap([
        topic('graphs', 'current_focus', 'developing'),
        topic('greedy', 'needs_more_practice', 'needs_practice', 0.2),
        topic('strings', 'needs_more_practice', 'needs_practice', 0.1),
        topic('segment-trees', 'recommended_next', 'insufficient_evidence'),
        topic('geometry', 'recommended_next', 'insufficient_evidence'),
        topic('trees', 'practiced_comfortable', 'insufficient_evidence'),
        topic('sorting', 'revisit_later', 'revisit'),
      ]),
      topicStatuses: {
        'dynamic-programming': 'working_on',
        geometry: 'skip_for_now',
      },
      topicEvidence: [
        {
          topic: 'math',
          observedAttemptedProblems: 5,
          observedSolvedProblems: 1,
        },
        {
          topic: 'graphs',
          observedAttemptedProblems: 6,
          observedSolvedProblems: 0,
        },
        {
          topic: 'implementation',
          observedAttemptedProblems: 4,
          observedSolvedProblems: 4,
        },
      ],
      ratingChanges: [],
      excludedTopics: [],
      now,
    })

    expect(signals.roadmapFocusTopics).toEqual([
      'dynamic-programming',
      'graphs',
      'sorting',
    ])
    // The roadmap's weakest topic first; graphs is already in the plan.
    expect(signals.weakTopics).toEqual(['strings', 'greedy', 'math'])
    // Skipped (geometry) and comfortable (trees) topics are not pushed.
    expect(signals.underPracticedTopics).toEqual(['segment-trees'])
    expect(signals.contestSummary).toBeUndefined()
  })

  it('canonicalizes aliases and honors exclusions', () => {
    const signals = deriveRecommendationSignals({
      roadmap: null,
      topicStatuses: { dp: 'working_on', graph: 'working_on' },
      topicEvidence: [],
      ratingChanges: [],
      excludedTopics: ['graphs'],
      now,
    })

    expect(signals.roadmapFocusTopics).toEqual(['dynamic-programming'])
  })

  it('bounds every topic list', () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      topic(`topic-${index}`, 'current_focus', 'developing'),
    )
    const signals = deriveRecommendationSignals({
      roadmap: roadmap(many),
      topicStatuses: {},
      topicEvidence: [],
      ratingChanges: [],
      excludedTopics: [],
      now,
    })

    expect(signals.roadmapFocusTopics).toHaveLength(SIGNAL_TOPIC_LIMIT)
  })

  it('summarizes the last 90 days of contests and the latest Codeforces rating', () => {
    const signals = deriveRecommendationSignals({
      roadmap: null,
      topicStatuses: {},
      topicEvidence: [],
      ratingChanges: [
        ratingChange('codeforces', 200, 1500, 40),
        ratingChange('codeforces', 30, 1760, 60),
        ratingChange('codeforces', 5, 1806, 46),
        ratingChange('codechef', 10, 1650, -20),
      ],
      excludedTopics: [],
      now,
    })

    expect(signals.contestSummary).toEqual({
      contestsLast90Days: 3,
      currentRating: 1806,
      ratingChange90Days: 106,
      trend: 'rising',
    })
    expect(signals.observedCodeforcesRating).toBe(1806)
  })
})

describe('learnerDayKey', () => {
  it('uses the learner time zone and tolerates an invalid zone', () => {
    const late = new Date('2026-09-24T20:30:00.000Z')

    expect(learnerDayKey(late, 'UTC')).toBe('2026-09-24')
    expect(learnerDayKey(late, 'Asia/Kolkata')).toBe('2026-09-25')
    expect(learnerDayKey(late, 'Not/AZone')).toBe('2026-09-24')
  })
})
