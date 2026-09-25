import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/useNotification', () => ({
  useNotification: () => ({ notify: vi.fn() }),
}))

vi.mock('../hooks/useLearnerMemories', () => ({
  useCorrectLearnerMemory: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCreateLearnerMemory: () => ({ isPending: false, mutate: vi.fn() }),
  useLearnerMemories: () => ({
    data: { data: [], meta: { pendingJobs: 0 } },
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  }),
  useLearnerMemoryAction: () => ({
    isPending: false,
    mutate: vi.fn(),
    variables: undefined,
  }),
}))

import { LearnerMemoryPanel } from './LearnerMemoryPanel'

describe('LearnerMemoryPanel', () => {
  it('keeps the profile-embedded panel focused on review controls', () => {
    const markup = renderToStaticMarkup(<LearnerMemoryPanel />)

    expect(markup).not.toContain('Add a memory')
    expect(markup).toContain('No learner memory yet')
  })

  it('offers a direct user-instruction memory input in the empty state', () => {
    const markup = renderToStaticMarkup(<LearnerMemoryPanel showComposer />)

    expect(markup).toContain('Add a memory')
    expect(markup).toContain('What should AlgoMemtor remember?')
    expect(markup).toContain('Saved as a user instruction')
    expect(markup).toContain('aria-label="Add memory"')
    expect(markup).toContain('I prefer short hints before full explanations')
    expect(markup).toContain('No learner memory yet')
  })
})
