import { describe, expect, it, vi } from 'vitest'

import { LeetCodeProvider } from './leetcode-provider.js'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const pagePayload = {
  data: {
    questionList: {
      totalNum: 1,
      data: [
        {
          questionId: 1,
          title: 'Two Sum',
          titleSlug: 'two-sum',
          difficulty: 'Easy',
          isPaidOnly: false,
          acRate: 51.2,
          topicTags: [{ name: 'Array', slug: 'array' }],
        },
      ],
    },
  },
} as const

const createProvider = (fetchImpl: typeof fetch) =>
  new LeetCodeProvider({
    baseUrl: 'https://mock.leetcode.test/graphql',
    fetchImpl,
    maxAttempts: 1,
    minRequestIntervalMs: 0,
    cacheTtlMs: 1000,
    contentCacheTtlMs: 1000,
  })

describe('LeetCodeProvider', () => {
  it('normalizes a public GraphQL problem page', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(pagePayload))
    const provider = createProvider(fetchMock)

    const result = await provider.search({})

    expect(result.problems[0]).toMatchObject({
      provider: 'leetcode',
      externalId: '1',
      title: 'Two Sum',
      canonicalUrl: 'https://leetcode.com/problems/two-sum/',
      normalizedDifficulty: 'easy',
      providerTags: ['leetcode', 'array'],
      acceptanceRate: 51.2,
      contentAvailable: true,
      extractionStrategy: 'public_graphql',
      completeness: 'complete',
    })
  })

  it('fetches and sanitizes free problem content', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(pagePayload))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            question: {
              questionId: 1,
              title: 'Two Sum',
              content:
                '<p>Find the answer.</p><script>alert(1)</script><pre>Input: 1\nOutput: 2</pre>',
              isPaidOnly: false,
              hints: ['Use a map.'],
            },
          },
        }),
      )
    const provider = createProvider(fetchMock)

    const content = await provider.getContent('1')

    expect(content.content).toMatchObject({
      title: 'Two Sum',
      isPaidOnly: false,
      hints: ['Use a map.'],
    })
    expect(content.content?.statementHtml).not.toContain('<script>')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps paid problems metadata-only', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        data: {
          questionList: {
            totalNum: 1,
            data: [
              {
                questionId: 2,
                title: 'Paid Problem',
                titleSlug: 'paid-problem',
                difficulty: 'Hard',
                isPaidOnly: true,
              },
            ],
          },
        },
      }),
    )
    const provider = createProvider(fetchMock)

    const result = await provider.search({})

    expect(result.problems[0]).toMatchObject({
      isPaidOnly: true,
      contentAvailable: false,
    })
    const content = await provider.getContent('2')
    expect(content.content).toBeNull()
  })
})
