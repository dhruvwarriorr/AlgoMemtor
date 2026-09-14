import { describe, expect, it, vi } from 'vitest'

import { CodeChefProvider } from './codechef-provider.js'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const htmlResponse = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })

const validPayload = {
  status: 'success',
  count: 2,
  data: [
    {
      code: 'FLOW001',
      name: 'Flow Problem',
      difficulty_rating: 900,
      total_submissions: 1000,
      successful_submissions: 250,
      contest_code: 'START1',
    },
    {
      code: 'GRAPH001',
      name: 'Graph Problem',
      difficulty_rating: '1700',
      total_submissions: '500',
      distinct_successful_submissions: '50',
    },
  ],
} as const

const createProvider = (fetchImpl: typeof fetch) =>
  new CodeChefProvider({
    baseUrl: 'https://mock.codechef.test',
    fetchImpl,
    maxAttempts: 1,
    minRequestIntervalMs: 0,
    cacheTtlMs: 1000,
    contentCacheTtlMs: 1000,
  })

describe('CodeChefProvider', () => {
  it('normalizes the public catalog with safe attribution', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(validPayload))
    const provider = createProvider(fetchMock)

    const result = await provider.search({})

    expect(result.problems).toHaveLength(2)
    expect(result.problems[0]).toMatchObject({
      provider: 'codechef',
      externalId: 'FLOW001',
      canonicalUrl: 'https://www.codechef.com/problems/FLOW001',
      normalizedDifficulty: 'easy',
      solvedCount: 250,
      acceptanceRate: 25,
      extractionStrategy: 'official_json',
      completeness: 'complete',
      contentAvailable: true,
    })
    expect(result.problems[1]?.normalizedDifficulty).toBe('hard')
    expect(result.freshness).toMatchObject({
      provider: 'codechef',
      availability: 'available',
      stale: false,
    })
  })

  it('returns valid partial data when a record fails validation', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        ...validPayload,
        data: [validPayload.data[0], { code: 'BROKEN' }],
      }),
    )
    const provider = createProvider(fetchMock)

    const result = await provider.search({})

    expect(result.problems).toHaveLength(1)
    expect(result.problems[0]?.completeness).toBe('partial')
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_PROVIDER_RECORDS' }),
      ]),
    )
  })

  it('sanitizes public problem HTML and rejects anti-bot pages', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        htmlResponse(
          '<h1>Flow Problem</h1><p>Statement</p><script>alert(1)</script><pre>Input: 1\nOutput: 2</pre>',
        ),
      )
      .mockResolvedValueOnce(htmlResponse('<title>Just a moment...</title>'))
    const provider = createProvider(fetchMock)

    const content = await provider.getContent('FLOW001')

    expect(content.content?.statementText).toContain('Statement')
    expect(content.content?.statementHtml).not.toContain('<script>')
    await expect(provider.getContent('GRAPH001')).rejects.toMatchObject({
      code: 'PROVIDER_BLOCKED',
    })
  })
})
