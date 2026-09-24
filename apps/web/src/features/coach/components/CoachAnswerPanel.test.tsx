import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  CoachMessageSchema,
  CoachRichContentSchema,
} from '@algomemtor/shared-contracts'

import { CoachMessageContent } from './CoachMessageContent'
import { answerDetails, answerDetailsSummary } from '../answer-details'
import { CoachAnswerPanel } from './CoachAnswerPanel'

const timestamp = '2026-09-17T12:00:00.000Z'

const panelProps = {
  pending: false,
  dismissedProblemKeys: new Set<string>(),
  confirmPending: false,
  onDismissProblem: vi.fn(),
  onConfirmProposal: vi.fn(),
}

describe('CoachAnswerPanel', () => {
  it('moves problems, code, web links and charts out of the chat, without follow-ups or sources', () => {
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

    const message = CoachMessageSchema.parse({
      id: '00000000-0000-4000-8000-000000000123',
      role: 'assistant',
      content:
        'Use a prefix sum.\n\n```cpp\nint main() { return 0; }\n```\n\nThen test n = 1.',
      evidence: [
        {
          source: 'activity',
          label: 'Recent failed attempts',
          detail: '3 wrong answers on prefix-sum problems.',
          completeness: 'complete',
          stale: false,
        },
      ],
      proposals: [],
      richContent: content,
      createdAt: timestamp,
    })

    const panel = renderToStaticMarkup(
      <CoachAnswerPanel {...panelProps} message={message} />,
    )

    expect(panel).toContain('Answer details')
    expect(panel).toContain('Tabular data for Topic readiness')
    expect(panel).toContain('Trusted next problems')
    expect(panel).toContain('Codeforces')
    expect(panel).toContain('Web-grounded')
    expect(panel).toContain('Two Sum practice problem')
    expect(panel).toContain('Code from your coach')
    expect(panel).toContain('int main() { return 0; }')
    expect(panel).not.toContain('Ask next')
    expect(panel).not.toContain('Give me a progressive hint.')
    expect(panel).not.toContain('Sources')
    expect(panel).not.toContain('Recent failed attempts')
    expect(panel).not.toContain('Continue the coaching thread')
    expect(panel).not.toContain('About this personalized answer')
    expect(panel).not.toContain('Sources used for this answer')

    const chat = renderToStaticMarkup(
      <CoachMessageContent
        content={message.content}
        onCodeBlock={vi.fn()}
        role="assistant"
      />,
    )
    expect(chat).toContain('Use a prefix sum.')
    expect(chat).toContain('C++ code')
    expect(chat).not.toContain('int main()')

    expect(answerDetailsSummary(answerDetails(message))).toBe(
      '1 problem · 1 code block · 1 web link · 2 charts',
    )
  })

  it('explains an empty panel for a text-only answer', () => {
    const message = CoachMessageSchema.parse({
      id: '00000000-0000-4000-8000-000000000124',
      role: 'assistant',
      content: 'Hey! What are we working on today?',
      evidence: [],
      proposals: [],
      createdAt: timestamp,
    })
    const panel = renderToStaticMarkup(
      <CoachAnswerPanel {...panelProps} message={message} />,
    )
    expect(panel).toContain('This answer is text only.')
    expect(answerDetails(message).hasContent).toBe(false)
  })
})
