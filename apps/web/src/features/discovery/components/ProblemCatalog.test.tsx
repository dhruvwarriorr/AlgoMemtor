import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type {
  ExternalProblemSummary,
  ProviderWarning,
} from '@algomemtor/shared-contracts'

import { NotificationContext } from '@/app/notification-context'

vi.mock('@/features/progress/components/ProblemLearningControls', () => ({
  ProblemLearningControls: () => null,
}))

vi.mock('@/features/recommendations/hooks/useRecommendations', () => ({
  useDismissProblem: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}))

import { ProblemCatalog } from './ProblemCatalog'

const problem: ExternalProblemSummary = {
  provider: 'codeforces',
  externalId: '100A',
  title: 'A valid problem',
  canonicalUrl: 'https://codeforces.com/problemset/problem/100/A',
  providerTags: ['implementation'],
  topics: ['implementation'],
  fetchedAt: '2026-09-10T00:00:00.000Z',
}

function renderCatalog(warnings: ProviderWarning[]) {
  return renderToStaticMarkup(
    <NotificationContext.Provider value={{ notify: () => undefined }}>
      <ProblemCatalog
        isFetching={false}
        problems={[problem]}
        warnings={warnings}
      />
    </NotificationContext.Provider>,
  )
}

describe('ProblemCatalog', () => {
  it('keeps provider diagnostics out of the browsing experience', () => {
    const markup = renderCatalog([
      {
        provider: 'codeforces',
        code: 'INVALID_RESPONSE',
        message: 'A provider record was skipped.',
      },
      {
        provider: 'codeforces',
        code: 'STALE_DATA',
        message: 'Cached data is being shown.',
      },
    ])

    expect(markup).not.toContain('Catalog data may be stale.')
    expect(markup).not.toContain('Some provider results are unavailable.')
    expect(markup).not.toContain('A provider record was skipped.')
    expect(markup).toContain('A valid problem')
  })
})
