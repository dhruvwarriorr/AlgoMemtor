import { describe, expect, it } from 'vitest'

import { hasVisibleImpression } from './useRecommendationImpression'

describe('recommendation impression visibility', () => {
  it('requires an intersecting ratio of at least fifty percent', () => {
    expect(
      hasVisibleImpression([{ intersectionRatio: 0.49, isIntersecting: true }]),
    ).toBe(false)
    expect(
      hasVisibleImpression([{ intersectionRatio: 0.5, isIntersecting: true }]),
    ).toBe(true)
    expect(
      hasVisibleImpression([{ intersectionRatio: 1, isIntersecting: false }]),
    ).toBe(false)
  })
})
