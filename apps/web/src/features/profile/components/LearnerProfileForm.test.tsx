import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  LearnerProfileSchema,
  type SaveLearnerProfileRequest,
} from '@algomemtor/shared-contracts'

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

const savedProfile = LearnerProfileSchema.parse({
  experience: 'beginner',
  difficultyComfort: 'introductory',
  goal: 'improve_problem_solving',
  topicPreference: { mode: 'selected', topics: ['implementation'] },
  preferredTopics: [],
  platformPreferences: { platforms: ['codeforces'], standings: [] },
  learningPreferences: ['solve_problems_directly'],
  recommendationPreference: 'Prefer short graph problems.',
  onboardingCompleted: true,
})

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
    expect(markup).toContain(
      'What should we keep in mind for your next recommendations?',
    )
    expect(markup).toContain('structured profile choices remain authoritative')
    expect(markup).toContain(
      'explicit topic exclusions here are respected by the coach',
    )
    expect(markup).toContain('Do not include personal or sensitive information')
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

  it('uses the compact major-topic picker shared by onboarding and settings', () => {
    const markup = renderToStaticMarkup(<LearnerProfileForm {...baseProps} />)

    expect(markup).toContain('Arrays')
    expect(markup).toContain('Dynamic Programming')
    expect(markup).toContain('Bit Manipulation')
    expect(markup).not.toContain('Sliding Window')
    expect(markup).not.toContain('Fenwick Trees')
    expect(markup).not.toContain('Minimum Spanning Trees')
    expect(markup).not.toContain('Advanced Dynamic Programming')
  })

  it('keeps previously saved specific topics visible and removable', () => {
    const profile = LearnerProfileSchema.parse({
      ...savedProfile,
      topicPreference: { mode: 'selected', topics: ['segment-trees'] },
      preferredTopics: ['geometry'],
    })
    const markup = renderToStaticMarkup(
      <LearnerProfileForm {...baseProps} initialProfile={profile} />,
    )

    expect(markup.match(/Saved specific topics/g)).toHaveLength(2)
    expect(markup).toContain('Segment Trees')
    expect(markup).toContain('aria-label="Remove Segment Trees"')
    expect(markup).toContain('Geometry')
    expect(markup).toContain('aria-label="Remove Geometry"')
  })

  it('hydrates a saved recommendation note for editing', () => {
    const markup = renderToStaticMarkup(
      <LearnerProfileForm {...baseProps} initialProfile={savedProfile} />,
    )

    expect(markup).toContain('Prefer short graph problems.')
    expect(markup).toContain('maxLength="500"')
  })

  it('shows one note field in settings and includes both saved notes', () => {
    const profile = LearnerProfileSchema.parse({
      ...savedProfile,
      additionalConsiderations: 'Keep weekday practice short.',
    })
    const markup = renderToStaticMarkup(
      <LearnerProfileForm
        {...baseProps}
        combinePracticeNotes
        initialProfile={profile}
      />,
    )

    expect(markup).toContain('Practice preferences and considerations')
    expect(markup).toContain(
      'Prefer short graph problems.\n\nKeep weekday practice short.',
    )
    expect(markup).not.toContain('Other practice considerations')
    expect(markup.match(/<textarea/g)).toHaveLength(1)
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
