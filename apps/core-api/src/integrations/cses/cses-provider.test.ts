import { describe, expect, it, vi } from 'vitest'

import { CsesProvider } from './cses-provider.js'

describe('CsesProvider', () => {
  it('normalizes the public CSES task catalog into attributed problems', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          '<h2>Introductory Problems</h2><ul class="task-list"><li><a href="/problemset/task/1068">Weird Algorithm</a></li></ul>',
          { headers: { 'content-type': 'text/html; charset=utf-8' } },
        ),
    )
    const provider = new CsesProvider({
      baseUrl: 'https://mock.cses.test',
      fetchImpl: fetchMock,
      minRequestIntervalMs: 0,
      cacheTtlMs: 1000,
    })

    const result = await provider.search({})

    expect(result.problems).toMatchObject([
      {
        provider: 'cses',
        externalId: '1068',
        title: 'Weird Algorithm',
        canonicalUrl: 'https://cses.fi/problemset/task/1068/',
        topics: ['cses', 'introductory-problems'],
      },
    ])
  })
})
