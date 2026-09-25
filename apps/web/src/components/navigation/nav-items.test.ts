import { describe, expect, it } from 'vitest'

import { accountMenuGroups, accountMenuPaths } from './nav-items'

describe('account menu navigation', () => {
  it('keeps a single profile destination in the menu experience', () => {
    const items = accountMenuGroups.flatMap((group) => group.items)

    expect(items.map((item) => item.label)).not.toContain('Profile')
    expect(items.map((item) => item.label)).toEqual(
      expect.arrayContaining(['Memory', 'Settings']),
    )
    expect(accountMenuPaths).toContain('/profile')
  })
})
