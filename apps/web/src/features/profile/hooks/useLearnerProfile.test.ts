import { describe, expect, it } from 'vitest'

import { learnerProfileQueryKey } from './useLearnerProfile'

describe('learnerProfileQueryKey', () => {
  it('partitions cached profiles by authenticated user', () => {
    expect(learnerProfileQueryKey('learner-a')).not.toEqual(
      learnerProfileQueryKey('learner-b'),
    )
  })
})
