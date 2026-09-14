import { describe, expect, it, vi } from 'vitest'

import { RequestGate } from '../../utils/request-gate.js'
import {
  CodeChefPublicStatsFetcher,
  parseCodeChefSolvedCount,
} from './codechef-public-stats.js'
import { CodeforcesPublicStatsFetcher } from './codeforces-public-stats.js'
import { LeetCodePublicStatsFetcher } from './leetcode-public-stats.js'

const noWaitGate = () => new RequestGate({ minIntervalMs: 0 })
const fetchedAt = new Date('2026-08-27T12:00:00.000Z')

describe('public provider solved-count fetchers', () => {
  it('normalizes accepted Codeforces activity and keeps the earliest accepted event', async () => {
    const fetcher = new CodeforcesPublicStatsFetcher({
      baseUrl: 'https://codeforces.test/api',
      fetchImpl: vi.fn(async () =>
        Response.json({
          status: 'OK',
          result: [
            {
              id: 20,
              creationTimeSeconds: 1_700_000_100,
              verdict: 'OK',
              problem: { contestId: 1, index: 'A' },
            },
            {
              id: 10,
              creationTimeSeconds: 1_700_000_000,
              verdict: 'OK',
              problem: { contestId: 1, index: 'a' },
            },
            {
              id: 30,
              creationTimeSeconds: 1_700_001_000,
              verdict: 'WRONG_ANSWER',
              problem: { contestId: 2, index: 'B' },
            },
          ],
        }),
      ),
      requestGate: noWaitGate(),
      now: () => fetchedAt,
    })

    await expect(fetcher.fetchVerifiedActivity('tourist')).resolves.toEqual({
      events: [
        {
          externalId: '1A',
          providerEventId: '10',
          occurredAt: new Date('2023-11-14T22:13:20.000Z'),
        },
      ],
      complete: true,
      fetchedAt,
    })
  })

  it('deduplicates accepted Codeforces submissions by stable problem ID', async () => {
    const fetchImpl: typeof fetch = vi.fn(async () =>
      Response.json({
        status: 'OK',
        result: [
          {
            verdict: 'OK',
            problem: { contestId: 1, index: 'A' },
          },
          {
            verdict: 'OK',
            problem: { contestId: 1, index: 'A' },
          },
          {
            verdict: 'WRONG_ANSWER',
            problem: { contestId: 2, index: 'B' },
          },
          {
            verdict: 'OK',
            problem: { problemsetName: 'acmsguru', index: '100' },
          },
        ],
      }),
    )
    const fetcher = new CodeforcesPublicStatsFetcher({
      baseUrl: 'https://codeforces.test/api',
      fetchImpl,
      requestGate: noWaitGate(),
      maxSubmissions: 4,
      now: () => fetchedAt,
    })

    await expect(fetcher.fetchSolvedCount('tourist')).resolves.toEqual({
      solvedCount: 2,
      complete: false,
      source: 'codeforces_api',
      fetchedAt,
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining('handle=tourist'),
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('recognizes a missing Codeforces handle', async () => {
    const fetcher = new CodeforcesPublicStatsFetcher({
      baseUrl: 'https://codeforces.test/api',
      fetchImpl: vi.fn(async () =>
        Response.json({
          status: 'FAILED',
          comment: 'handle: User with handle missing not found',
        }),
      ),
      requestGate: noWaitGate(),
    })

    await expect(fetcher.fetchSolvedCount('missing')).rejects.toMatchObject({
      code: 'PROVIDER_ACCOUNT_NOT_FOUND',
      retryable: false,
    })
  })

  it('retries transient Codeforces activity failures but does not retry rate limits', async () => {
    let calls = 0
    const fetcher = new CodeforcesPublicStatsFetcher({
      baseUrl: 'https://codeforces.test/api',
      fetchImpl: vi.fn(async () => {
        calls += 1
        if (calls === 1) {
          throw new TypeError('temporary network failure')
        }
        return Response.json({
          status: 'OK',
          result: [
            {
              id: 1,
              creationTimeSeconds: 1_700_000_000,
              verdict: 'OK',
              problem: { contestId: 1, index: 'A' },
            },
          ],
        })
      }),
      requestGate: noWaitGate(),
      maxAttempts: 2,
      retryBaseDelayMs: 0,
      now: () => fetchedAt,
    })

    await expect(
      fetcher.fetchVerifiedActivity('tourist'),
    ).resolves.toMatchObject({
      complete: true,
      events: [expect.objectContaining({ externalId: '1A' })],
    })
    expect(calls).toBe(2)

    const rateLimitedFetch = vi.fn(async () =>
      Response.json({ status: 'FAILED', comment: 'call limit exceeded' }),
    )
    const rateLimited = new CodeforcesPublicStatsFetcher({
      baseUrl: 'https://codeforces.test/api',
      fetchImpl: rateLimitedFetch,
      requestGate: noWaitGate(),
      maxAttempts: 3,
      retryBaseDelayMs: 0,
    })
    await expect(
      rateLimited.fetchVerifiedActivity('tourist'),
    ).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMITED',
    })
    expect(rateLimitedFetch).toHaveBeenCalledTimes(1)
  })

  it('parses the CodeChef public profile solved total', async () => {
    const html = `
      <section class="rating-data-section problems-solved">
        <h3>Total Problems Solved: 1,234</h3>
      </section>
    `
    expect(parseCodeChefSolvedCount(html)).toBe(1234)
    const fetcher = new CodeChefPublicStatsFetcher({
      baseUrl: 'https://codechef.test/users/',
      fetchImpl: vi.fn(async () => new Response(html)),
      requestGate: noWaitGate(),
      now: () => fetchedAt,
    })

    await expect(fetcher.fetchSolvedCount('learner')).resolves.toEqual({
      solvedCount: 1234,
      complete: true,
      source: 'codechef_public_profile_html',
      fetchedAt,
    })
  })

  it('treats a CodeChef profile redirect as an unknown handle', async () => {
    const fetcher = new CodeChefPublicStatsFetcher({
      baseUrl: 'https://codechef.test/users/',
      fetchImpl: vi.fn(
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: 'https://codechef.test/' },
          }),
      ),
      requestGate: noWaitGate(),
    })

    await expect(fetcher.fetchSolvedCount('missing')).rejects.toMatchObject({
      code: 'PROVIDER_ACCOUNT_NOT_FOUND',
    })
  })

  it('reads LeetCode totals from the website GraphQL response', async () => {
    const fetchImpl: typeof fetch = vi.fn(async () =>
      Response.json({
        data: {
          matchedUser: {
            submitStatsGlobal: {
              acSubmissionNum: [
                { difficulty: 'All', count: 77 },
                { difficulty: 'Easy', count: 25 },
              ],
            },
          },
        },
      }),
    )
    const fetcher = new LeetCodePublicStatsFetcher({
      endpoint: 'https://leetcode.test/graphql',
      fetchImpl,
      requestGate: noWaitGate(),
      now: () => fetchedAt,
    })

    await expect(fetcher.fetchSolvedCount('learner')).resolves.toEqual({
      solvedCount: 77,
      complete: true,
      source: 'leetcode_website_graphql',
      fetchedAt,
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL('https://leetcode.test/graphql'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('recognizes a missing LeetCode handle', async () => {
    const fetcher = new LeetCodePublicStatsFetcher({
      endpoint: 'https://leetcode.test/graphql',
      fetchImpl: vi.fn(async () =>
        Response.json({
          errors: [{ message: 'That user does not exist.' }],
          data: { matchedUser: null },
        }),
      ),
      requestGate: noWaitGate(),
    })

    await expect(fetcher.fetchSolvedCount('missing')).rejects.toMatchObject({
      code: 'PROVIDER_ACCOUNT_NOT_FOUND',
      retryable: false,
    })
  })
})
