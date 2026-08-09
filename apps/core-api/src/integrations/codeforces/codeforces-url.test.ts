import { describe, expect, it } from 'vitest'

import { createCodeforcesProblemUrl } from './codeforces-url.js'

describe('createCodeforcesProblemUrl', () => {
  it('constructs the canonical HTTPS problemset URL', () => {
    const value = createCodeforcesProblemUrl(1234, ' a1 ')
    const url = new URL(value)

    expect(value).toBe('https://codeforces.com/problemset/problem/1234/A1')
    expect(url.hostname).toBe('codeforces.com')
    expect(url.protocol).toBe('https:')
  })

  it.each([
    [0, 'A'],
    [-1, 'A'],
    [1.5, 'A'],
    [1, '../login'],
    [1, 'A?next=https://example.com'],
    [1, 'A#fragment'],
  ])('rejects unsafe identifiers (%s, %s)', (contestId, index) => {
    expect(() => createCodeforcesProblemUrl(contestId, index)).toThrow()
  })
})
