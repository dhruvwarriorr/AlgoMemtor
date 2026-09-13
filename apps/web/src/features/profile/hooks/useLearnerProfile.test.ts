import { describe, expect, it } from 'vitest'

import {
  learnerProfileInvalidationKeys,
  learnerProfileQueryKey,
} from './useLearnerProfile'

describe('learnerProfileQueryKey', () => {
  it('partitions cached profiles by authenticated user', () => {
    expect(learnerProfileQueryKey('learner-a')).not.toEqual(
      learnerProfileQueryKey('learner-b'),
    )
  })

  it('invalidates the saved profile and only that learner recommendation feed', () => {
    expect(learnerProfileInvalidationKeys('learner-a')).toEqual([
      ['learner-profile', 'learner-a'],
      ['recommendations', 'learner-a'],
    ])
    expect(learnerProfileInvalidationKeys('learner-a')).not.toContainEqual([
      'recommendations',
      'learner-b',
    ])
  })
})
