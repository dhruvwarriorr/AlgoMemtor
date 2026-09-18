import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CoachRichContentSchema } from '@algomemtor/shared-contracts'

vi.mock('@/features/progress/api/progress', () => ({
  recordProblemAction: vi.fn(),
}))

import { CoachRichContent } from './CoachRichContent'

const timestamp = '2026-09-17T12:00:00.000Z'

describe('CoachRichContent', () => {
  it('renders accessible data fallbacks, trusted problems, and follow-ups', () => {
    const content = CoachRichContentSchema.parse({
      version: 'coach-rich-v2',
      blocks: [
        {
          type: 'metric_grid',
          title: 'Your current signal',
          metrics: [
            {
              label: 'Observed solves',
              value: 8,
              detail: 'Observed records.',
              citationIds: [],
            },
          ],
        },
        {
          type: 'chart',
          datasetId: 'topic-assessments',
          chartType: 'bar',
          title: 'Topic readiness',
          summary: 'Deterministic assessment signals.',
          series: [{ key: 'score', label: 'Score' }],
          points: [{ label: 'Arrays', values: { score: 70 } }],
          citationIds: [],
        },
        {
          type: 'problem_list',
          title: 'Trusted next problems',
          reason: 'Validated catalog candidates.',
          problems: [
            {
              provider: 'codeforces',
              externalId: '100A',
              title: 'Arrays exercise',
              canonicalUrl: 'https://codeforces.com/problemset/problem/100/A',
              providerTags: ['arrays'],
              topics: ['arrays'],
              fetchedAt: timestamp,
            },
          ],
        },
      ],
      citations: [],
      suggestedQuestions: ['Give me a progressive hint.'],
      generatedAt: timestamp,
      dataAsOf: timestamp,
      completeness: 'partial',
      stale: true,
    })

    const markup = renderToStaticMarkup(
      <CoachRichContent content={content} onSuggestedQuestion={vi.fn()} />,
    )

    expect(markup).toContain('Tabular data for Topic readiness')
    expect(markup).toContain('Trusted next problems')
    expect(markup).toContain('Codeforces')
    expect(markup).toContain('Continue the coaching thread')
    expect(markup).toContain('partial or stale')
  })
})
