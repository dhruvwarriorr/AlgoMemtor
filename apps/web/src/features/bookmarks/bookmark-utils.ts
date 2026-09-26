import type { Bookmark } from '@algomemtor/shared-contracts'

const difficultyRating = { easy: 1000, medium: 1600, hard: 2200 } as const

// A rating to draw with: the provider's number when there is one, otherwise
// a stand-in from the normalized difficulty.
export function bookmarkRating(bookmark: Bookmark) {
  const { problem } = bookmark
  if (typeof problem.providerDifficulty === 'number') {
    return problem.providerDifficulty
  }
  return problem.normalizedDifficulty
    ? difficultyRating[problem.normalizedDifficulty]
    : 1200
}

export const DAY = 86_400_000
