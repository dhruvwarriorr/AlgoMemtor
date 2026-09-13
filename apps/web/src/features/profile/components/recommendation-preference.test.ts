import { describe, expect, it } from 'vitest'

import { recommendationPreferenceForRequest } from './recommendation-preference'

describe('recommendationPreferenceForRequest', () => {
  it('trims an edited recommendation note', () => {
    expect(
      recommendationPreferenceForRequest('  Prefer arrays this week.  '),
    ).toBe('Prefer arrays this week.')
  })

  it('omits a cleared recommendation note', () => {
    expect(recommendationPreferenceForRequest('   ')).toBeUndefined()
  })
})
