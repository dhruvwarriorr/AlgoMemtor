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
  it('states the note-sharing boundary and explicit save requirement', () => {
    const markup = renderToStaticMarkup(<AiNoteConsentCard />)

    expect(markup).toContain(
      'Reflection-note text is shared only when you explicitly choose to allow it and save that choice.',
    )
    expect(markup).toContain('free-form text of your reflection notes')
    expect(markup).toContain('Structured progress signals')
    expect(markup).toContain('Allow reflection-note sharing with Gemini')
    expect(markup).toContain('Keep reflection notes private from Gemini')
    expect(markup).toContain(
      'may still be processed separately for learner-memory suggestions.',
    )
    expect(markup).not.toContain(
      'Existing AI memory processing is not used for new events.',
    )
  })
})
