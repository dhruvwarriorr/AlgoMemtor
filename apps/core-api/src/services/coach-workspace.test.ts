import { describe, expect, it } from 'vitest'

import type {
  ExternalProblemSummary,
  ImprovementRoadmap,
  ProviderProfile,
  ProviderProvenance,
  ProviderSolvedProblem,
  ProviderSubmission,
} from '@algomemtor/shared-contracts'

import { buildCoachWorkspace, verdictGroup } from './coach-workspace.js'

const now = new Date('2026-09-20T12:00:00.000Z')

const provenance = (
  completeness: ProviderProvenance['completeness'] = 'complete',
): ProviderProvenance => ({
  provider: 'codeforces',
  providerId: 'codeforces',
  canonicalUrl: 'https://codeforces.com/',
  sourceUrl: 'https://codeforces.com/api',
  extractionStrategy: 'official_json',
  schemaVersion: 'v1',
  completeness,
  fetchedAt: now.toISOString(),
  stale: false,
})

const problem = (
  externalId: string,
  rating: number,
  tags: string[],
  topics: string[],
): ExternalProblemSummary => ({
  provider: 'codeforces',
  externalId,
  title: `Problem ${externalId}`,
  canonicalUrl: `https://codeforces.com/problemset/problem/${externalId.slice(0, -1)}/${externalId.slice(-1)}`,
  providerDifficulty: rating,
  providerTags: tags,
  topics,
  fetchedAt: now.toISOString(),
})

const catalog = [
  problem('1000A', 1200, ['dp'], ['dynamic-programming']),
  problem('1001B', 1500, ['greedy'], ['greedy']),
  problem('1002C', 1600, ['graphs'], ['graphs']),
  problem(
    '1003D',
    1700,
    ['dp', 'games'],
    ['dynamic-programming', 'game-theory'],
  ),
  problem('1004E', 3000, ['fft'], ['math']),
]

const solved: ProviderSolvedProblem[] = [
  {
    provider: 'codeforces',
    externalId: '1000A',
    canonicalUrl: 'https://codeforces.com/problemset/problem/1000/A',
    occurredAt: '2026-09-19T08:00:00.000Z',
    firstObservedAt: '2026-09-19T08:00:00.000Z',
    lastObservedAt: '2026-09-19T08:00:00.000Z',
    providerTags: ['dp'],
    completeness: 'complete',
    provenance: provenance(),
  },
]

const submissions: ProviderSubmission[] = [
  {
    provider: 'codeforces',
    externalId: '1001B',
    eventId: 's1',
    canonicalUrl: 'https://codeforces.com/problemset/problem/1001/B',
    verdict: 'WRONG_ANSWER',
    language: 'GNU C++17',
    occurredAt: '2026-09-18T08:00:00.000Z',
    isAccepted: false,
    completeness: 'complete',
    provenance: provenance(),
  },
  {
    provider: 'codeforces',
    externalId: '1001B',
    eventId: 's2',
    canonicalUrl: 'https://codeforces.com/problemset/problem/1001/B',
    verdict: 'TIME_LIMIT_EXCEEDED',
    language: 'GNU C++17',
    occurredAt: '2026-09-18T09:00:00.000Z',
    isAccepted: false,
    completeness: 'complete',
    provenance: provenance(),
  },
]

const profile = {
  provider: 'codeforces',
  externalId: 'handle',
  handle: 'learner_handle',
  profileUrl: 'https://codeforces.com/profile/learner_handle',
  rank: 'specialist',
  rating: 1450,
  solvedCount: 120,
  languageCounts: {},
  topicCounts: {},
  badges: [],
  calendar: {},
  completeness: 'complete',
  provenance: provenance(),
} satisfies ProviderProfile

const roadmap: ImprovementRoadmap = {
  id: 'roadmap-1',
  version: 1,
  assessmentVersion: 'topic-assessment-v1',
  topics: [],
  dataCompleteness: 'complete',
  staleProviders: [],
  generatedAt: now.toISOString(),
}

const build = (
  overrides: Partial<Parameters<typeof buildCoachWorkspace>[0]> = {},
) =>
  buildCoachWorkspace({
    now,
    timezone: 'UTC',
    providerProfiles: [profile],
    solved,
    submissions,
    ratings: [
      {
        provider: 'codeforces',
        eventId: 'r1',
        contestName: 'Codeforces Round 1',
        occurredAt: '2026-09-01T00:00:00.000Z',
        oldRating: 1400,
        newRating: 1520,
        delta: 120,
        provenance: provenance(),
      },
    ],
    contests: [],
    catalog,
    roadmap,
    statuses: new Map(),
    manualSolvedAt: new Map(),
    dismissed: new Set(),
    bookmarks: [],
    excludedTopics: [],
    canonicalTopic: (value) => value.toLowerCase().replace(/\s+/g, '-'),
    ...overrides,
  })

describe('coach workspace', () => {
  it('enriches solved history and attempts with catalog metadata', () => {
    const { workspace } = build()
    expect(workspace.solved).toEqual([
      expect.objectContaining({
        id: 'codeforces:1000A',
        title: 'Problem 1000A',
        rating: 1200,
        tags: ['dp'],
        solvedAt: '2026-09-19T08:00:00.000Z',
      }),
    ])
    expect(workspace.attempted).toEqual([
      expect.objectContaining({
        id: 'codeforces:1001B',
        failedSubmissions: 2,
        rating: 1500,
      }),
    ])
    expect(workspace.accounts[0]).toMatchObject({
      handle: 'learner_handle',
      rating: 1450,
      maxRating: 1520,
      ratedContests: 1,
    })
    expect(workspace.digest.submissions.verdicts).toEqual({
      wrong_answer: 1,
      time_limit: 1,
    })
    expect(workspace.digest.activity).toMatchObject({
      solvedLast7Days: 1,
      currentStreakDays: 1,
    })
    expect(workspace.digest.weakTags).toEqual([])
  })

  it('builds a practice pool near the learner level without solved or excluded problems', () => {
    const { workspace, practiceProblems } = build({
      excludedTopics: ['graphs'],
      dismissed: new Set(['codeforces:1001B']),
    })
    const ids = workspace.practicePool.map((item) => item.id)
    expect(ids).toContain('codeforces:1003D')
    expect(ids).not.toContain('codeforces:1000A') // solved
    expect(ids).not.toContain('codeforces:1001B') // dismissed
    expect(ids).not.toContain('codeforces:1002C') // excluded topic
    expect(ids).not.toContain('codeforces:1004E') // far above level
    expect([...practiceProblems.keys()].sort()).toEqual([...ids].sort())
    expect(JSON.stringify(workspace)).not.toContain('https://')
  })

  it('keeps unrated practice at the observed level, not the onboarding comfort', () => {
    const leetcode = (
      externalId: string,
      difficulty: 'easy' | 'medium',
    ): ExternalProblemSummary => ({
      provider: 'leetcode',
      externalId,
      title: `Problem ${externalId}`,
      canonicalUrl: `https://leetcode.com/problems/${externalId}/`,
      providerDifficulty: difficulty === 'easy' ? 'Easy' : 'Medium',
      normalizedDifficulty: difficulty,
      providerTags: ['tree'],
      topics: ['trees'],
      fetchedAt: now.toISOString(),
    })
    const { workspace } = build({
      solved: [],
      providerProfiles: [{ ...profile, rating: 1650 }],
      difficultyComfort: 'new_to_rated_problems',
      catalog: [
        ...catalog,
        leetcode('same-tree', 'easy'),
        leetcode('path-sum-iii', 'medium'),
      ],
    })
    const ids = workspace.practicePool.map((item) => item.id)
    expect(ids).toContain('leetcode:path-sum-iii')
    expect(ids).not.toContain('leetcode:same-tree')
  })

  it('treats a manual unsolved status as authoritative over provider evidence', () => {
    const { workspace } = build({
      statuses: new Map([['codeforces:1000A', 'unsolved']]),
    })
    expect(workspace.solved).toEqual([])
  })

  it('groups verdicts without prefix collisions', () => {
    expect(verdictGroup('OK', true)).toBe('accepted')
    expect(verdictGroup('REJECTED', false)).toBe('other')
    expect(verdictGroup('RUNTIME_ERROR', false)).toBe('runtime_error')
    expect(verdictGroup('Compilation Error', false)).toBe('compile_error')
  })
})
