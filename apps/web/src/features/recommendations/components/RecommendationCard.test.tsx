import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { RecommendationItem } from '@algomemtor/shared-contracts'

vi.mock('@/features/progress/components/ProblemLearningControls', () => ({
  ProblemLearningControls: () => null,
}))

import { RecommendationCard } from './RecommendationCard'

const item: RecommendationItem = {
  id: '00000000-0000-4000-8000-000000000001',
  provider: 'codeforces',
  externalId: '100A',
  position: 1,
  score: 0.9,
  reason: 'Practises your focus topic: graphs.',
  problem: {
    provider: 'codeforces',
    externalId: '100A',
    title: 'Graph practice',
    canonicalUrl: 'https://codeforces.com/problemset/problem/100/A',
    providerDifficulty: 1200,
    normalizedDifficulty: 'medium',
    providerTags: ['graphs'],
    topics: ['graphs'],
    learnerStatus: 'attempted',
    fetchedAt: '2026-09-10T00:00:00.000Z',
  },
}

describe('RecommendationCard', () => {
  it('renders the reason, attribution, feedback controls, and safe outbound link', () => {
    const markup = renderToStaticMarkup(
      <RecommendationCard
        isDismissPending={false}
        isFeedbackPending={false}
        item={item}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
      />,
    )

    expect(markup).toContain('Why this fits')
    expect(markup).toContain('Practises your focus topic: graphs.')
    expect(markup).toContain('Attempted')
    expect(markup).not.toContain('>attempted</span>')
    expect(markup).toContain('Solve on Codeforces')
    expect(markup).toContain('Useful')
    expect(markup).toContain('Too hard')
    expect(markup).toContain('rel="noopener noreferrer"')
    expect(markup).toContain('Dismiss Graph practice')
  })
})
