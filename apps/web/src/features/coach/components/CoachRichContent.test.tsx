import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CoachRichContentSchema } from '@algomemtor/shared-contracts'

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
        {
          type: 'web_problem_list',
          title: 'Problems found for this question',
          reason: 'Grounded through public search metadata.',
          problems: [
            {
              citationId: 'web-1',
              title: 'Two Sum practice problem',
              url: 'https://example.com/problems/two-sum',
              publisher: 'Example judge',
            },
          ],
        },
      ],
      citations: [
        {
          id: 'web-1',
          source: 'web',
          title: 'Two Sum practice problem',
          url: 'https://example.com/problems/two-sum',
          publisher: 'Example judge',
          retrievedAt: timestamp,
          stale: false,
        },
      ],
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
    expect(markup).toContain('Web-grounded')
    expect(markup).toContain('Two Sum practice problem')
    expect(markup).toContain('Continue the coaching thread')
    expect(markup).toContain('About this personalized answer')
    expect(markup).not.toContain('partial or stale')
    expect(markup).not.toContain('may be stale')
  })
})
