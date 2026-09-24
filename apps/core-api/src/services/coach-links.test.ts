import { describe, expect, it } from 'vitest'

import {
  allowedCoachAnswerUrl,
  extractCoachUrls,
  leetcodeIdForSlug,
  providerProblemFromUrl,
} from './coach-links.js'

describe('coach links', () => {
  it('extracts public links and upgrades http', () => {
    expect(
      extractCoachUrls(
        'help me with https://codeforces.com/problemset/problem/2266/G, and http://example.com/a. Not https://localhost/x',
      ),
    ).toEqual([
      'https://codeforces.com/problemset/problem/2266/G',
      'https://example.com/a',
    ])
  })

  it.each([
    ['https://codeforces.com/problemset/problem/2266/G', 'codeforces', '2266G'],
    ['https://codeforces.com/contest/2266/problem/g', 'codeforces', '2266G'],
    [
      'https://www.codechef.com/START150A/problems/fallpr',
      'codechef',
      'FALLPR',
    ],
    ['https://cses.fi/problemset/task/1068', 'cses', '1068'],
  ])('maps %s to a platform problem', (url, provider, externalId) => {
    expect(providerProblemFromUrl(url)).toEqual({ url, provider, externalId })
  })

  it('maps LeetCode slugs through the catalog', () => {
    expect(
      providerProblemFromUrl(
        'https://leetcode.com/problems/numbers-with-same-consecutive-differences/description/',
      ),
    ).toMatchObject({
      provider: 'leetcode',
      leetcodeSlug: 'numbers-with-same-consecutive-differences',
    })
    expect(
      leetcodeIdForSlug('numbers-with-same-consecutive-differences', [
        {
          provider: 'leetcode',
          externalId: '1007',
          title: 'Numbers With Same Consecutive Differences',
          canonicalUrl:
            'https://leetcode.com/problems/numbers-with-same-consecutive-differences/',
          providerTags: [],
          topics: [],
          fetchedAt: '2026-09-24T00:00:00.000Z',
        },
      ]),
    ).toBe('1007')
  })

  it('ignores non-problem links', () => {
    expect(providerProblemFromUrl('https://codeforces.com/blog/entry/1')).toBe(
      null,
    )
    expect(providerProblemFromUrl('https://example.com/problems/x')).toBe(null)
  })

  it('keeps safe public answer links clickable', () => {
    expect(allowedCoachAnswerUrl('https://example.com/other')).toBe(true)
    expect(allowedCoachAnswerUrl('https://127.0.0.1/admin')).toBe(false)
    expect(allowedCoachAnswerUrl('javascript:alert(1)')).toBe(false)
    const allowed = new Set(['https://example.com/post'])
    expect(allowedCoachAnswerUrl('https://example.com/post/', allowed)).toBe(
      true,
    )
    expect(allowedCoachAnswerUrl('https://example.com/other', allowed)).toBe(
      false,
    )
  })
})
