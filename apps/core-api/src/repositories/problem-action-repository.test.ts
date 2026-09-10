import { describe, expect, it } from 'vitest'

import {
  InMemoryProblemActionRepository,
  type AppendProblemActionInput,
} from './problem-action-repository.js'

const firstUserId = '00000000-0000-4000-8000-000000000111'
const secondUserId = '00000000-0000-4000-8000-000000000112'

type StatusEvidenceFields = Pick<
  AppendProblemActionInput,
  'actionType' | 'learnerStatus' | 'evidenceSource'
>

describe('InMemoryProblemActionRepository', () => {
  it('keeps actions append-only and isolated by authenticated subject', async () => {
    const repository = new InMemoryProblemActionRepository()
    const firstOccurredAt = new Date('2026-09-10T10:00:00.000Z')
    const secondOccurredAt = new Date('2026-09-10T10:01:00.000Z')
    const input: AppendProblemActionInput = {
      provider: 'codeforces',
      externalId: '1900A',
      actionType: 'opened',
      occurredAt: firstOccurredAt,
    }

    const firstAction = await repository.appendByAuthUserId(firstUserId, input)
    const secondAction = await repository.appendByAuthUserId(firstUserId, {
      ...input,
      occurredAt: secondOccurredAt,
    })

    expect(secondAction.id).not.toBe(firstAction.id)
    await expect(repository.listByAuthUserId(firstUserId)).resolves.toEqual([
      firstAction,
      secondAction,
    ])
    await expect(repository.listByAuthUserId(secondUserId)).resolves.toEqual([])
  })

  it('requires status changes to carry matching evidence', async () => {
    const repository = new InMemoryProblemActionRepository()

    const action = await repository.appendByAuthUserId(firstUserId, {
      provider: 'codeforces',
      externalId: '1900B',
      actionType: 'status_changed',
      learnerStatus: 'solved',
      evidenceSource: 'provider_verified',
    })

    expect(action).toMatchObject({
      actionType: 'status_changed',
      learnerStatus: 'solved',
      evidenceSource: 'provider_verified',
    })
  })

  it('records a dismissal restoration as an append-only action', async () => {
    const repository = new InMemoryProblemActionRepository()

    const action = await repository.appendByAuthUserId(firstUserId, {
      provider: 'codeforces',
      externalId: '1900D',
      actionType: 'dismissal_restored',
    })

    expect(action).toMatchObject({
      actionType: 'dismissal_restored',
      provider: 'codeforces',
      externalId: '1900D',
    })
  })

  it.each([
    {
      actionType: 'status_changed',
    },
    {
      actionType: 'status_changed',
      learnerStatus: 'attempted',
    },
    {
      actionType: 'status_changed',
      evidenceSource: 'manual',
    },
    {
      actionType: 'opened',
      learnerStatus: 'attempted',
      evidenceSource: 'manual',
    },
  ] satisfies StatusEvidenceFields[])(
    'rejects invalid status/evidence combinations',
    async (statusFields) => {
      const repository = new InMemoryProblemActionRepository()

      await expect(
        repository.appendByAuthUserId(firstUserId, {
          provider: 'codeforces',
          externalId: '1900C',
          ...statusFields,
        }),
      ).rejects.toThrow()
      await expect(repository.listByAuthUserId(firstUserId)).resolves.toEqual(
        [],
      )
    },
  )
})
