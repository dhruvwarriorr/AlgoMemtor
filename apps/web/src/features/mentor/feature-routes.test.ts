import type { CoachMessage } from '@algomemtor/shared-contracts'
import { describe, expect, it } from 'vitest'

import {
  answerDetails,
  featureRedirects,
} from '@/features/coach/answer-details'

import { insightTargetPath, mentorToolPath } from './feature-routes'

describe('mentor tool routes', () => {
  it('maps features to known in-app paths and carries a problem link', () => {
    expect(mentorToolPath('upsolve')).toBe('/upsolve')
    expect(mentorToolPath('progress_report')).toBe('/progress/report')
    expect(
      mentorToolPath(
        'doubt_helper',
        'https://codeforces.com/problemset/problem/2266/G',
      ),
    ).toBe(
      '/doubt-helper?problem=https%3A%2F%2Fcodeforces.com%2Fproblemset%2Fproblem%2F2266%2FG',
    )
    expect(insightTargetPath('recommendations')).toBe('/recommendations')
    expect(insightTargetPath('upsolve')).toBe('/upsolve')
  })

  it('renders section redirects inline instead of in the details panel', () => {
    const message: CoachMessage = {
      id: '00000000-0000-4000-8000-000000000001',
      role: 'assistant',
      content: 'Head to Contest Analysis.',
      evidence: [],
      proposals: [],
      richContent: {
        version: 'coach-rich-v2',
        blocks: [
          {
            type: 'feature_redirect',
            feature: 'contest_analysis',
            title: 'Contest Analysis',
            description: 'Time use and strategy per contest.',
            actionLabel: 'Analyze my contests',
          },
        ],
        citations: [],
        suggestedQuestions: [],
        generatedAt: '2026-09-24T00:00:00.000Z',
        dataAsOf: '2026-09-24T00:00:00.000Z',
        completeness: 'complete',
        stale: false,
      },
      createdAt: '2026-09-24T00:00:00.000Z',
    }
    expect(featureRedirects(message).map((block) => block.feature)).toEqual([
      'contest_analysis',
    ])
    expect(answerDetails(message).hasContent).toBe(false)
  })
})
