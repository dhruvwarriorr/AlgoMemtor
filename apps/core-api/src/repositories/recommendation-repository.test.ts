import { describe, expect, it } from 'vitest'

import {
  InMemoryRecommendationRepository,
  RecommendationOwnershipError,
  type SaveRecommendationBatchInput,
} from './recommendation-repository.js'

const firstUserId = '00000000-0000-4000-8000-000000000121'
const secondUserId = '00000000-0000-4000-8000-000000000122'

const firstItem = {
  provider: 'codeforces' as const,
  externalId: '1900A',
  position: 1,
  score: 0.9,
  reason: 'Matches the selected graph practice path.',
}

const secondItem = {
  provider: 'codeforces' as const,
  externalId: '1900B',
  position: 2,
  reason: 'Provides a second medium-difficulty practice option.',
}

const batchInput: SaveRecommendationBatchInput = {
  requestCriteria: {
    provider: 'codeforces',
    topics: ['graphs', 'shortest-paths'],
    difficulty: 'medium',
    minRating: 1000,
    maxRating: 1800,
    pageSize: 2,
  },
  rankingMode: 'deterministic',
  rankingVersion: 'baseline-v1',
  items: [firstItem, secondItem],
}

describe('InMemoryRecommendationRepository', () => {
  it('isolates recommendation batches by authenticated subject', async () => {
    const repository = new InMemoryRecommendationRepository()

    const savedBatch = await repository.saveBatchByAuthUserId(
      firstUserId,
      batchInput,
    )

    await expect(
      repository.listBatchesByAuthUserId(firstUserId),
    ).resolves.toEqual([savedBatch])
    await expect(
      repository.listBatchesByAuthUserId(secondUserId),
    ).resolves.toEqual([])
  })

  it.each([
    'unexpected',
    'statement',
    'examples',
    'constraints',
    'editorial',
    'starterCode',
  ])('rejects unknown or raw-content criteria key: %s', async (key) => {
    const repository = new InMemoryRecommendationRepository()
    const invalidInput = {
      ...batchInput,
      requestCriteria: {
        ...batchInput.requestCriteria,
        [key]: 'raw problem content must not be accepted',
      },
    }

    await expect(
      repository.saveBatchByAuthUserId(firstUserId, invalidInput),
    ).rejects.toThrow()
    await expect(
      repository.listBatchesByAuthUserId(firstUserId),
    ).resolves.toEqual([])
  })

  it('rejects duplicate problem identities in one batch', async () => {
    const repository = new InMemoryRecommendationRepository()
    const invalidInput = {
      ...batchInput,
      items: [firstItem, { ...secondItem, externalId: firstItem.externalId }],
    }

    await expect(
      repository.saveBatchByAuthUserId(firstUserId, invalidInput),
    ).rejects.toThrow('A problem can appear only once')
  })

  it('rejects duplicate positions in one batch', async () => {
    const repository = new InMemoryRecommendationRepository()
    const invalidInput = {
      ...batchInput,
      items: [firstItem, { ...secondItem, position: firstItem.position }],
    }

    await expect(
      repository.saveBatchByAuthUserId(firstUserId, invalidInput),
    ).rejects.toThrow('Recommendation positions must be unique')
  })

  it('updates feedback for an owned item without creating a second record', async () => {
    let currentTime = new Date('2026-09-10T10:00:00.000Z')
    const repository = new InMemoryRecommendationRepository(() => currentTime)
    const batch = await repository.saveBatchByAuthUserId(
      firstUserId,
      batchInput,
    )
    const firstBatchItem = batch.items[0]

    if (firstBatchItem === undefined) {
      throw new Error('The test batch should contain an item.')
    }

    currentTime = new Date('2026-09-10T10:01:00.000Z')
    const firstFeedback = await repository.saveFeedbackByAuthUserId(
      firstUserId,
      firstBatchItem.id,
      {
        usefulness: 'useful',
        perceivedDifficulty: 'about_right',
        notes: 'The recommendation fit the practice goal.',
      },
    )

    currentTime = new Date('2026-09-10T10:02:00.000Z')
    const updatedFeedback = await repository.saveFeedbackByAuthUserId(
      firstUserId,
      firstBatchItem.id,
      {
        usefulness: 'not_useful',
        perceivedDifficulty: 'too_hard',
        notes: 'The recommendation was harder than expected.',
      },
    )

    expect(updatedFeedback.id).toBe(firstFeedback.id)
    expect(updatedFeedback.createdAt).toEqual(firstFeedback.createdAt)
    expect(updatedFeedback.updatedAt).toEqual(currentTime)
    expect(updatedFeedback).toMatchObject({
      usefulness: 'not_useful',
      perceivedDifficulty: 'too_hard',
      notes: 'The recommendation was harder than expected.',
    })
    await expect(
      repository.listFeedbackByAuthUserId(firstUserId),
    ).resolves.toEqual([updatedFeedback])
  })

  it('rejects feedback from a different authenticated subject', async () => {
    const repository = new InMemoryRecommendationRepository()
    const batch = await repository.saveBatchByAuthUserId(
      firstUserId,
      batchInput,
    )
    const firstBatchItem = batch.items[0]

    if (firstBatchItem === undefined) {
      throw new Error('The test batch should contain an item.')
    }

    await expect(
      repository.saveFeedbackByAuthUserId(secondUserId, firstBatchItem.id, {
        usefulness: 'useful',
      }),
    ).rejects.toBeInstanceOf(RecommendationOwnershipError)
    await expect(
      repository.listFeedbackByAuthUserId(firstUserId),
    ).resolves.toEqual([])
    await expect(
      repository.listFeedbackByAuthUserId(secondUserId),
    ).resolves.toEqual([])
  })
})
