import { describe, expect, it } from 'vitest'

import { problemCatalogQueryKey } from '@/features/discovery/hooks/useProblemCatalog'
import { parseCatalogSearchParams } from '@/features/discovery/utils/catalogSearchParams'
import { recommendationsQueryKey } from '@/features/recommendations/hooks/useRecommendations'

describe('browser navigation state contracts', () => {
  it('keeps catalog filters and pagination in the URL and query cache key', () => {
    const filters = parseCatalogSearchParams(
      new URLSearchParams(
        'topic=graphs&minRating=800&maxRating=1200&page=3&pageSize=20',
      ),
    )

    expect(filters).toMatchObject({
      topic: 'graphs',
      minRating: 800,
      maxRating: 1200,
      page: 3,
      pageSize: 20,
    })
    expect(problemCatalogQueryKey(filters)).toContainEqual(
      expect.objectContaining({ page: 3, pageSize: 20 }),
    )
    expect(problemCatalogQueryKey({ ...filters, page: 4 })).not.toEqual(
      problemCatalogQueryKey(filters),
    )
  })

  it('keeps recommendation cache state scoped to the learner across route back navigation', () => {
    expect(recommendationsQueryKey('learner-a')).toEqual([
      'recommendations',
      'learner-a',
    ])
    expect(recommendationsQueryKey('learner-a')).not.toEqual(
      recommendationsQueryKey('learner-b'),
    )
  })
})
