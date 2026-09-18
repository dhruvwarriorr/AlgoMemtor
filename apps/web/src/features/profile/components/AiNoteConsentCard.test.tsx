import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  refetch: vi.fn(),
}))

vi.mock('@/app/useNotification', () => ({
  useNotification: () => ({ notify: vi.fn() }),
}))

vi.mock('../hooks/useLearnerSettings', () => ({
  useAiConsent: () => ({
    data: { data: null },
    isError: false,
    isPending: false,
    refetch: mocks.refetch,
  }),
  useSaveAiConsent: () => ({
    isPending: false,
    mutateAsync: mocks.mutateAsync,
  }),
}))

import { AiNoteConsentCard } from './AiNoteConsentCard'

describe('AiNoteConsentCard', () => {
  it('states the personalized-coaching boundary and explicit save requirement', () => {
    const markup = renderToStaticMarkup(<AiNoteConsentCard />)

    expect(markup).toContain('personalized AI coaching and learner memory')
    expect(markup).toContain(
      'Reflection-note text is shared only when you explicitly choose to allow it and save that choice.',
    )
    expect(markup).toContain('free-form text of your reflection notes')
    expect(markup).toContain('Structured progress signals')
    expect(markup).toContain('Enable personalized coaching and learner memory')
    expect(markup).toContain('Keep personalized AI coaching disabled')
    expect(markup).toContain('no retained learner context is sent to Gemini.')
    expect(markup).not.toContain(
      'Existing AI memory processing is not used for new events.',
    )
  })
})
