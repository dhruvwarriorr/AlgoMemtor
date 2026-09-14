import { describe, expect, it, vi } from 'vitest'

import { CodeChefActivityFetcher } from './codechef-activity.js'
import { LeetCodeActivityFetcher } from './leetcode-activity.js'
import { RequestGate } from '../../utils/request-gate.js'

const response = (body: string, contentType: string, status = 200) =>
  new Response(body, { status, headers: { 'content-type': contentType } })

describe('provider solved-problem tag enrichment', () => {
  it('normalizes CodeChef recent accepted rows and problem tags', async () => {
    const recentHtml = `<table><tr><td title='08:00 PM 09/09/26'></td><td title='FLOW'><a href='/START1/problems/FLOW'>Flow</a></td><td><span title='accepted'></span></td><td title='C++'>C++</td><td title='View'><a href='/viewsolution/7'>View</a></td></tr></table>`
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('/users/')) {
        return response('<html><body>profile</body></html>', 'text/html')
      }
      if (url.includes('/recent/user')) {
        return response(
          JSON.stringify({ max_page: 1, content: recentHtml }),
          'text/html',
        )
      }
      return response(
        JSON.stringify({
          problem_code: 'FLOW',
          problem_name: 'Flow',
          computed_tags: ['graphs'],
          user_tags: ['shortest path'],
        }),
        'application/json',
      )
    })
    const fetcher = new CodeChefActivityFetcher({
      baseUrl: 'https://mock.codechef.test/users/',
      fetchImpl: fetchMock,
      maxAttempts: 1,
      requestGate: new RequestGate({ minIntervalMs: 0 }),
    })

    const result = await fetcher.fetchActivityData('learner')

    expect(result.submissions).toHaveLength(1)
    expect(result.solvedProblems[0]).toMatchObject({
      externalId: 'FLOW',
      providerTags: ['graphs', 'shortest path'],
      topics: ['graphs', 'shortest-path'],
      occurredAt: '2026-09-09T14:30:00.000Z',
    })
  })

  it('hydrates LeetCode topic tags from public question records', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
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
        return response(
          JSON.stringify({
            data: {
              q0: {
                questionId: '1',
                title: 'Two Sum',
                titleSlug: 'two-sum',
                topicTags: [{ name: 'Array', slug: 'array' }],
              },
            },
          }),
          'application/json',
        )
      }
      return response(
        JSON.stringify({ data: { userContestRankingHistory: [] } }),
        'application/json',
      )
    })
    const fetcher = new LeetCodeActivityFetcher({
      endpoint: 'https://mock.leetcode.test/graphql',
      fetchImpl: fetchMock,
      maxAttempts: 1,
      requestGate: new RequestGate({ minIntervalMs: 0 }),
      recentLimit: 20,
    })

    const result = await fetcher.fetchActivityData('learner')

    expect(result.solvedProblems[0]).toMatchObject({
      externalId: '1',
      providerTags: ['Array'],
      topics: ['array'],
    })
  })
})
