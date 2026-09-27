import { describe, expect, it } from 'vitest'

import { codechefStars, platformTier } from '../src/index.js'

describe('platform tier', () => {
  it('derives CodeChef stars from the published bands', () => {
    expect(codechefStars(0)).toBe(1)
    expect(codechefStars(1399)).toBe(1)
    expect(codechefStars(1400)).toBe(2)
    expect(codechefStars(1799)).toBe(3)
    expect(codechefStars(1800)).toBe(4)
    expect(codechefStars(2199)).toBe(5)
    expect(codechefStars(2200)).toBe(6)
    expect(codechefStars(2500)).toBe(7)
    expect(
      platformTier({ provider: 'codechef', rating: 1650, rank: '12345' }),
    ).toMatchObject({ kind: 'stars', stars: 3, label: '3★' })
    expect(platformTier({ provider: 'codechef' })).toBeUndefined()
  })

  it('uses the LeetCode badge LeetCode reports', () => {
    expect(
      platformTier({ provider: 'leetcode', rating: 2200, rank: 'Guardian' }),
    ).toMatchObject({ kind: 'badge', badge: 'guardian' })
    expect(
      platformTier({ provider: 'leetcode', rating: 1900, rank: 'Knight' }),
    ).toMatchObject({ kind: 'badge', badge: 'knight' })
    expect(platformTier({ provider: 'leetcode', rating: 1600 })).toMatchObject({
      kind: 'badge',
      badge: 'none',
    })
    expect(platformTier({ provider: 'leetcode' })).toBeUndefined()
  })

  it('names Codeforces titles from the rank or the rating', () => {
    expect(
      platformTier({ provider: 'codeforces', rank: 'candidate master' }),
    ).toMatchObject({ label: 'Candidate Master' })
    expect(
      platformTier({ provider: 'codeforces', rating: 1450 }),
    ).toMatchObject({ label: 'Specialist' })
    expect(platformTier({ provider: 'cses', rating: 10 })).toBeUndefined()
  })
})
