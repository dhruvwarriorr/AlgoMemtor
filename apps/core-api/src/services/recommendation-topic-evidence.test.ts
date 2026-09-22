import { describe, expect, it } from 'vitest'

import { deriveRecommendationTopicEvidence } from './recommendation-topic-evidence.js'

const problems = [
  { provider: 'codeforces' as const, externalId: '100A', topics: ['greedy'] },
  { provider: 'codeforces' as const, externalId: '100B', topics: ['greedy'] },
  { provider: 'leetcode' as const, externalId: 'two-sum', topics: ['hashing'] },
]

describe('recommendation topic evidence', () => {
  it('deduplicates provider observations and respects manual status', () => {
    const evidence = deriveRecommendationTopicEvidence(
      problems,
      [
        {
          id: '00000000-0000-4000-8000-000000000001',
          provider: 'codeforces',
          externalId: '100A',
          actionType: 'status_changed',
          learnerStatus: 'attempted',
          evidenceSource: 'manual',
          occurredAt: new Date('2026-09-21T12:00:00Z'),
        },
      ],
      [
        { provider: 'codeforces', externalId: '100A', isAccepted: false },
        { provider: 'codeforces', externalId: '100A', isAccepted: false },
        { provider: 'codeforces', externalId: '100B', isAccepted: true },
      ],
      [
        { provider: 'codeforces', externalId: '100B', topics: ['greedy'] },
        { provider: 'leetcode', externalId: 'two-sum', topics: ['hashing'] },
      ],
      [],
    )

    expect(evidence).toEqual([
      {
        topic: 'greedy',
        observedAttemptedProblems: 1,
        observedSolvedProblems: 1,
      },
      {
        topic: 'hashing',
        observedAttemptedProblems: 0,
        observedSolvedProblems: 1,
      },
    ])
  })

  it('excludes learner-blocked and unknown topics', () => {
    const evidence = deriveRecommendationTopicEvidence(
      problems,
      [],
      [],
      [
        { provider: 'codeforces', externalId: '100A', topics: ['greedy'] },
        { provider: 'leetcode', externalId: 'unknown', topics: ['start255'] },
      ],
      ['greedy'],
    )
    expect(evidence).toEqual([])
  })
})
