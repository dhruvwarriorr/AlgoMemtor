import { describe, expect, it, vi } from 'vitest'

import {
  CodeChefActivityFetcher,
  codeChefTopicTags,
} from './codechef-activity.js'
import { CodeforcesPublicStatsFetcher } from './codeforces-public-stats.js'
import { LeetCodeActivityFetcher } from './leetcode-activity.js'
import { RequestGate } from '../../utils/request-gate.js'

const response = (body: string, contentType: string, status = 200) =>
  new Response(body, { status, headers: { 'content-type': contentType } })

const noWaitGate = () => new RequestGate({ minIntervalMs: 0 })

const codeChefRow = (
  code: string,
  solutionId: number,
  time: string,
  verdict: 'accepted' | 'wrong answer',
) =>
  `<tr><td title='${time}'></td><td title='${code}'><a href='/START1/problems/${code}'>${code}</a></td><td><span title='${verdict}'></span></td><td title='C++'>C++</td><td title='View'><a href='/viewsolution/${solutionId}'>View</a></td></tr>`

const codeChefFetcher = (pages: string[][], detail?: unknown) => {
  const requestedPages: number[] = []
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input))
    if (url.pathname.startsWith('/users/')) {
      return response('<html><body>profile</body></html>', 'text/html')
    }
    if (url.pathname === '/recent/user') {
      const page = Number(url.searchParams.get('page'))
      requestedPages.push(page)
      return response(
        JSON.stringify({
          max_page: pages.length - 1,
          content: `<table>${(pages[page] ?? []).join('')}</table>`,
        }),
        'text/html',
      )
    }
    return response(JSON.stringify(detail ?? {}), 'application/json')
  })
  const fetcher = new CodeChefActivityFetcher({
    baseUrl: 'https://mock.codechef.test/users/',
    fetchImpl: fetchMock,
    maxAttempts: 1,
    requestGate: noWaitGate(),
  })
  return { fetcher, fetchMock, requestedPages }
}

describe('CodeChef public activity', () => {
  it('reads every recent-activity page and returns a resume cursor', async () => {
    const { fetcher, requestedPages } = codeChefFetcher([
      [codeChefRow('FLOW', 30, '08:00 PM 09/09/26', 'accepted')],
      [
        codeChefRow('FLOW', 20, '07:00 PM 08/09/26', 'accepted'),
        codeChefRow('ADDIS', 10, '07:00 PM 01/09/26', 'wrong answer'),
      ],
    ])

    const result = await fetcher.fetchActivityData('learner')

    expect(requestedPages).toEqual([0, 1])
    expect(result.submissions).toHaveLength(3)
    expect(result.complete).toBe(true)
    expect(result.cursor).toBe('30')
    // The earliest accepted row is the solve event.
    expect(result.solvedProblems).toMatchObject([
      {
        externalId: 'FLOW',
        sourceSubmissionId: '20',
        occurredAt: '2026-09-08T13:30:00.000Z',
        completeness: 'complete',
      },
    ])
  })

  it('stops paging once it reaches already-stored submissions', async () => {
    const { fetcher, requestedPages } = codeChefFetcher([
      [codeChefRow('NEW', 40, '08:00 PM 09/09/26', 'accepted')],
      [codeChefRow('OLD', 30, '08:00 PM 01/09/26', 'accepted')],
      [codeChefRow('OLDER', 20, '08:00 PM 01/08/26', 'accepted')],
    ])

    const result = await fetcher.fetchActivityData('learner', undefined, {
      cursor: '30',
    })

    expect(requestedPages).toEqual([0, 1])
    expect(result.complete).toBe(true)
    expect(result.cursor).toBe('40')
  })

  it('records where to resume when a later page fails', async () => {
    const pages = [[codeChefRow('NEW', 40, '08:00 PM 09/09/26', 'accepted')]]
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input))
      if (url.pathname.startsWith('/users/')) {
        return response('<html></html>', 'text/html')
      }
      if (url.searchParams.get('page') === '0') {
        return response(
          JSON.stringify({
            max_page: 3,
            content: `<table>${pages[0]?.join('')}</table>`,
          }),
          'text/html',
        )
      }
      return response('not json', 'text/html')
    })
    const fetcher = new CodeChefActivityFetcher({
      baseUrl: 'https://mock.codechef.test/users/',
      fetchImpl: fetchMock,
      maxAttempts: 1,
      requestGate: noWaitGate(),
    })

    const result = await fetcher.fetchActivityData('learner')

    expect(result.submissions).toHaveLength(1)
    expect(result.complete).toBe(false)
    // The oldest page (3) failed, so the next run starts there.
    expect(result.cursor).toBe('v2:40:3:3')
    expect(result.continueAfterMs).toBe(5 * 60 * 1000)
  })

  it('backfills oldest first in parts without missing submissions', async () => {
    // A feed that grows between syncs: newest first, three rows per page.
    let newestId = 30
    const perPage = 3
    const requested: number[] = []
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input))
      if (url.pathname.startsWith('/users/')) {
        return response('<html></html>', 'text/html')
      }
      const page = Number(url.searchParams.get('page'))
      requested.push(page)
      const ids = Array.from(
        { length: newestId },
        (_, index) => newestId - index,
      )
      const rows = ids
        .slice(page * perPage, page * perPage + perPage)
        .map((id) =>
          codeChefRow(`P${id}`, id, '08:00 PM 09/09/26', 'wrong answer'),
        )
      return response(
        JSON.stringify({
          max_page: Math.ceil(newestId / perPage) - 1,
          content: `<table>${rows.join('')}</table>`,
        }),
        'text/html',
      )
    })
    const fetcher = new CodeChefActivityFetcher({
      baseUrl: 'https://mock.codechef.test/users/',
      fetchImpl: fetchMock,
      maxAttempts: 1,
      requestGate: noWaitGate(),
      maxPages: 4,
    })

    const seen = new Set<string>()
    let cursor: string | undefined
    let complete = false
    const firstRunPages: number[] = []
    for (let run = 0; run < 10 && !complete; run += 1) {
      requested.length = 0
      const result = await fetcher.fetchActivityData(
        'learner',
        undefined,
        cursor === undefined ? undefined : { cursor, backfillOnly: true },
      )
      if (run === 0) firstRunPages.push(...requested)
      for (const submission of result.submissions) seen.add(submission.eventId)
      cursor = result.cursor
      complete = result.complete
      // New submissions arrive between syncs.
      newestId += run % 2 === 0 ? 4 : 1
    }

    // Page 0 for the newest rows, then the oldest pages first.
    expect(firstRunPages).toEqual([0, 9, 8, 7])
    expect(complete).toBe(true)
    const expected = Array.from({ length: 30 }, (_, index) => String(index + 1))
    expect([...seen]).toEqual(expect.arrayContaining(expected))
    expect(cursor).toMatch(/^\d+$/)
  })

  it('continuation runs skip the profile page', async () => {
    const { fetcher, fetchMock } = codeChefFetcher([
      [codeChefRow('NEW', 40, '08:00 PM 09/09/26', 'accepted')],
    ])

    await fetcher.fetchActivityData('learner', undefined, {
      cursor: '30',
      backfillOnly: true,
    })

    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes('/users/')),
    ).toBe(false)
  })

  it('looks up tags for stored problems and drops non-topic labels', async () => {
    const { fetcher, fetchMock } = codeChefFetcher([[]], {
      problem_code: 'FLOW',
      computed_tags: ['Graphs'],
      user_tags: ['shortest path', 'start255', 'setter_adm', 'cakewalk'],
    })

    const tags = await fetcher.fetchProblemTags(['FLOW'])

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://mock.codechef.test/api/contests/PRACTICE/problems/FLOW',
    )
    expect(tags.get('FLOW')).toEqual({
      providerTags: ['Graphs', 'shortest path'],
      topics: ['graphs', 'shortest-path'],
    })
  })

  it('marks problems without usable tags as checked', async () => {
    const { fetcher } = codeChefFetcher([[]], {
      problem_code: 'FLOW',
      user_tags: ['start255'],
    })

    const tags = await fetcher.fetchProblemTags(['FLOW'])

    expect(tags.has('FLOW')).toBe(true)
    expect(tags.get('FLOW')).toBeNull()
  })

  it('keeps only topic-like tags', () => {
    expect(
      codeChefTopicTags(['Greedy', 'greedy', 'LTIME99', 'easy', 'a_adm']),
    ).toEqual({ providerTags: ['Greedy'], topics: ['greedy'] })
  })
})

describe('LeetCode public activity', () => {
  const leetCodeFetcher = (details: unknown) =>
    new LeetCodeActivityFetcher({
      endpoint: 'https://mock.leetcode.test/graphql',
      fetchImpl: vi.fn<typeof fetch>(async (_input, init) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          query?: string
        }
        if (body.query?.includes('recentSubmissionList')) {
          return response(
            JSON.stringify({
              data: {
                recentSubmissionList: [
                  {
                    title: 'Two Sum',
                    titleSlug: 'two-sum',
                    timestamp: '1700000000',
                    statusDisplay: 'Accepted',
                    lang: 'cpp',
                  },
                ],
              },
            }),
            'application/json',
          )
        }
        if (body.query?.includes('recentQuestionDetails')) {
          return response(JSON.stringify(details), 'application/json')
        }
        return response(
          JSON.stringify({ data: { userContestRankingHistory: [] } }),
          'application/json',
        )
      }),
      maxAttempts: 1,
      requestGate: noWaitGate(),
    })

  it('keys activity by slug and hydrates topic tags', async () => {
    const result = await leetCodeFetcher({
      data: {
        q0: {
          questionId: '1',
          title: 'Two Sum',
          titleSlug: 'two-sum',
          topicTags: [{ name: 'Array', slug: 'array' }],
        },
      },
    }).fetchActivityData('learner')

    expect(result.complete).toBe(false)
    expect(result.solvedProblems[0]).toMatchObject({
      externalId: 'two-sum',
      providerTags: ['Array'],
      topics: ['array'],
    })
  })

  it('keeps the slug identity when the detail lookup fails', async () => {
    const result = await leetCodeFetcher({
      errors: [{ message: 'rate limited' }],
    }).fetchActivityData('learner')

    expect(result.solvedProblems[0]).toMatchObject({ externalId: 'two-sum' })
    expect(result.solvedProblems[0]?.providerTags).toBeUndefined()
  })

  it('keeps resolved questions beside a GraphQL error', async () => {
    const tags = await leetCodeFetcher({
      data: {
        q0: { topicTags: [{ name: 'Array', slug: 'array' }] },
        q1: null,
      },
      errors: [{ message: 'That question does not exist.' }],
    }).fetchProblemTags(['two-sum', 'removed-problem', 'not a slug'])

    expect(tags.get('two-sum')).toEqual({
      providerTags: ['Array'],
      topics: ['array'],
    })
    expect(tags.get('removed-problem')).toBeNull()
    expect(tags.has('not a slug')).toBe(false)
  })
})

describe('Codeforces activity', () => {
  const submission = (id: number, verdict = 'OK') => ({
    id,
    creationTimeSeconds: 1_700_000_000 + id,
    verdict,
    programmingLanguage: 'GNU C++20 (64)',
    passedTestCount: 4,
    timeConsumedMillis: 46,
    memoryConsumedBytes: 262_144,
    problem: { contestId: 10, index: 'A', name: 'Watermelon', tags: ['math'] },
  })

  const codeforcesFetcher = (history: unknown[]) => {
    const counts: string[] = []
    const fetcher = new CodeforcesPublicStatsFetcher({
      baseUrl: 'https://codeforces.test/api',
      fetchImpl: vi.fn(async (input) => {
        const url = new URL(String(input))
        if (url.pathname.endsWith('user.rating')) {
          return Response.json({ status: 'OK', result: [] })
        }
        const count = Number(url.searchParams.get('count'))
        counts.push(String(count))
        return Response.json({ status: 'OK', result: history.slice(0, count) })
      }),
      requestGate: noWaitGate(),
      now: () => new Date('2026-09-23T00:00:00.000Z'),
    })
    return { fetcher, counts }
  }

  it('stores judge details and returns a cursor after a full fetch', async () => {
    const { fetcher, counts } = codeforcesFetcher([
      submission(7, 'WRONG_ANSWER'),
      submission(5),
    ])

    const result = await fetcher.fetchActivityData('tourist')

    expect(counts).toEqual(['10000'])
    expect(result.cursor).toBe('7')
    expect(result.submissions[0]).toMatchObject({
      problemTitle: 'Watermelon',
      verdict: 'WRONG_ANSWER',
      language: 'GNU C++20 (64)',
      runtimeMs: 46,
      memoryKb: 256,
      passedTestCount: 4,
    })
  })

  it('fetches only the newest window when it reaches the cursor', async () => {
    const history = Array.from({ length: 300 }, (_, index) =>
      submission(1000 - index),
    )
    const { fetcher, counts } = codeforcesFetcher(history)

    const result = await fetcher.fetchActivityData('tourist', undefined, {
      cursor: '850',
    })

    expect(counts).toEqual(['200'])
    expect(result.complete).toBe(true)
    expect(result.cursor).toBe('1000')
  })

  it('falls back to the full history when the window misses the cursor', async () => {
    const history = Array.from({ length: 300 }, (_, index) =>
      submission(1000 - index),
    )
    const { fetcher, counts } = codeforcesFetcher(history)

    const result = await fetcher.fetchActivityData('tourist', undefined, {
      cursor: '10',
    })

    expect(counts).toEqual(['200', '10000'])
    expect(result.submissions).toHaveLength(300)
  })
})
