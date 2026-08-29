import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { SaveLearnerProfileRequest } from '@algomemtor/shared-contracts'

import { LearnerProfileForm } from './LearnerProfileForm'

const onSubmit = vi.fn<(profile: SaveLearnerProfileRequest) => Promise<void>>(
  () => Promise.resolve(),
)

const baseProps = {
  idPrefix: 'test-profile',
  initialProfile: null,
  onSubmit,
  submitLabel: 'Save learner profile',
}

describe('LearnerProfileForm', () => {
  it('renders an accessible loading state before profile data is ready', () => {
    const markup = renderToStaticMarkup(
      <LearnerProfileForm {...baseProps} isLoading />,
    )

    expect(markup).toContain('Loading learner profile')
    expect(markup).not.toContain('<form')
  })

  it('renders a retryable load error state', () => {
    const markup = renderToStaticMarkup(
      <LearnerProfileForm
        {...baseProps}
        loadError="The profile service is unavailable."
        onRetryLoad={() => undefined}
      />,
    )

    expect(markup).toContain('Learner profile unavailable')
    expect(markup).toContain('The profile service is unavailable.')
    expect(markup).toContain('Try again')
  })

  it('renders required labels and honest optional-provider guidance', () => {
    const markup = renderToStaticMarkup(<LearnerProfileForm {...baseProps} />)

    expect(markup).toContain('Current competitive-programming experience')
    expect(markup).toContain('Main learning goal')
    expect(markup).toContain('Preferred ways to learn')
    expect(markup).toContain('Linking a public provider profile is optional')
    expect(markup).toContain('Save learner profile')
    expect(markup).not.toContain('Rating platform')
    expect(markup).not.toContain('Target rating')
    expect(markup).not.toContain('Contest, interview, or event')
    expect(markup).not.toContain('Target date')
    expect(markup).not.toContain('Another topic')
    expect(markup).not.toContain('Practice availability')
    expect(markup).not.toContain('type="email"')
  })

  it('renders saving, success, and save-error feedback states', () => {
    const markup = renderToStaticMarkup(
      <LearnerProfileForm
        {...baseProps}
        isSaving
        saveError="The profile could not be saved."
        successMessage="The profile was saved."
      />,
    )

    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain('Saving profile…')
    expect(markup).toContain('The profile could not be saved.')
    expect(markup).toContain('The profile was saved.')
  })
})
