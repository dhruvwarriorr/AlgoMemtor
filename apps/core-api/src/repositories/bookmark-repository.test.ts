import { describe, expect, it } from 'vitest'

import { InMemoryBookmarkRepository } from './bookmark-repository.js'

const firstUserId = '00000000-0000-4000-8000-000000000101'
const secondUserId = '00000000-0000-4000-8000-000000000102'
const bookmark = { provider: 'codeforces' as const, externalId: '1900A' }

describe('InMemoryBookmarkRepository', () => {
  it('isolates bookmarks by authenticated subject', async () => {
    const repository = new InMemoryBookmarkRepository()

    const saved = await repository.saveByAuthUserId(firstUserId, bookmark)

    await expect(repository.listByAuthUserId(secondUserId)).resolves.toEqual([])
    await expect(
      repository.deleteByAuthUserId(
        secondUserId,
        bookmark.provider,
        bookmark.externalId,
      ),
    ).resolves.toBe(false)
    await expect(repository.listByAuthUserId(firstUserId)).resolves.toEqual([
      saved,
    ])
  })

  it('saves a user bookmark idempotently', async () => {
    const createdAt = new Date('2026-09-10T10:00:00.000Z')
    const repository = new InMemoryBookmarkRepository(() => createdAt)

    const firstSave = await repository.saveByAuthUserId(firstUserId, {
      provider: 'codeforces',
      externalId: ' 1900A ',
    })
    const duplicateSave = await repository.saveByAuthUserId(
      firstUserId,
      bookmark,
    )

    expect(duplicateSave).toEqual(firstSave)
    await expect(repository.listByAuthUserId(firstUserId)).resolves.toEqual([
      firstSave,
    ])
  })
})
