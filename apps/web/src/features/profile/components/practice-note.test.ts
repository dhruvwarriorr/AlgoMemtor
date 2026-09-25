import { describe, expect, it } from 'vitest'

import { combinedPracticeNote, splitPracticeNote } from './practice-note'

describe('settings practice note', () => {
  it('shows and preserves both existing profile notes in one editor', () => {
    const profile = {
      recommendationPreference: 'Avoid 800-rated problems.',
      additionalConsiderations: 'Keep weekday practice short.',
    }

    expect(splitPracticeNote(combinedPracticeNote(profile))).toEqual(profile)
  })

  it('keeps the two legacy fields at their maximum lengths', () => {
    const profile = {
      recommendationPreference: 'A'.repeat(500),
      additionalConsiderations: 'B'.repeat(1_000),
    }

    expect(splitPracticeNote(combinedPracticeNote(profile))).toEqual(profile)
  })

  it('keeps long notes within the two existing API field limits', () => {
    const notes = splitPracticeNote('A'.repeat(500) + 'B'.repeat(1_000))

    expect(notes.recommendationPreference).toHaveLength(500)
    expect(notes.additionalConsiderations).toHaveLength(1_000)
    expect(
      notes.recommendationPreference + notes.additionalConsiderations,
    ).toBe('A'.repeat(500) + 'B'.repeat(1_000))
  })

  it('clears both stored fields when the merged note is cleared', () => {
    expect(splitPracticeNote('  ')).toEqual({
      recommendationPreference: '',
      additionalConsiderations: '',
    })
  })
})
