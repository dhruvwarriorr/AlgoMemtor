import { describe, expect, it } from 'vitest'

import { mixHex, ratingTiers, tierFor } from './dashboard-format'

describe('rating tiers', () => {
  it('places a Codeforces rating in its rank and names the next one', () => {
    const tiers = ratingTiers('codeforces')
    expect(tiers).toBeDefined()
    const standing = tierFor(tiers ?? [], 1366)
    expect(standing.tier?.name).toBe('Pupil')
    expect(standing.next?.name).toBe('Specialist')
    expect(standing.next?.min).toBe(1400)
  })

  it('has no next tier at the top and no bands for LeetCode', () => {
    const tiers = ratingTiers('codechef') ?? []
    expect(tierFor(tiers, 2600).next).toBeUndefined()
    expect(ratingTiers('leetcode')).toBeUndefined()
  })
})

describe('mixHex', () => {
  it('blends between two colours', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
  })
})
