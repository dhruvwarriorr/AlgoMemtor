import { describe, expect, it } from 'vitest'

import {
  emptyCodeChefState,
  parseCodeChefProfile,
  parseCodeChefRecentRows,
  parseCodeChefTime,
  parseContestProblems,
  parseDifficultyRating,
  syncCodeChef,
} from './codechef.js'
import type { ConnectorUpload } from './types.js'

const row = (options: {
  path: string
  title: string
  time: string
  accepted: boolean
  solution: string
}) => `
<tr>
  <td title="${options.time}">${options.time}</td>
  <td title="${options.title}"><a href="${options.path}">${options.title}</a></td>
  <td title="${options.accepted ? 'accepted' : 'wrong answer'}"><span title="${options.accepted ? 'accepted' : 'wrong answer'}"></span></td>
  <td title="C++17">C++17</td>
  <td title="View"><a href="/viewsolution/${options.solution}">View</a></td>
</tr>`

const feed = (rows: string[], maxPage = 0) =>
  JSON.stringify({
    max_page: maxPage,
    content: `<table>${rows.join('')}</table>`,
  })

describe('CodeChef parsers', () => {
  it('reads feed rows and tells contest from practice solves', () => {
    const rows = parseCodeChefRecentRows(
      [
        row({
          path: '/START150C/problems/ABCD',
          title: 'Contest One',
          time: '07:15 PM 21/09/26',
          accepted: true,
          solution: '9001',
        }),
        row({
          path: '/problems/FLOW001',
          title: 'Add Two Numbers',
          time: '10:00 AM 20/09/26',
          accepted: false,
          solution: '9000',
        }),
      ].join(''),
    )
    expect(rows).toEqual([
      {
        code: 'ABCD',
        contestCode: 'START150C',
        title: 'Contest One',
        occurredAt: '2026-09-21T13:45:00.000Z',
        accepted: true,
        verdict: 'accepted',
        language: 'C++17',
        solutionId: '9001',
      },
      expect.objectContaining({
        code: 'FLOW001',
        accepted: false,
        verdict: 'wrong answer',
      }),
    ])
    expect(rows[1]?.contestCode).toBeUndefined()
  })

  it('converts India time to UTC', () => {
    expect(parseCodeChefTime('12:05 AM 01/01/26')).toBe(
      '2025-12-31T18:35:00.000Z',
    )
    expect(parseCodeChefTime('not a time')).toBeNull()
  })

  it('reads the profile’s contest solves and rated contest codes', () => {
    const profile = parseCodeChefProfile(`
      <script>var all_rating = [{"code":"START150C","name":"Starters 150 (Rated)","rating":"1500"}];</script>
      <section class="rating-data-section problems-solved">
        <h3>Contests (1)</h3>
        <div class="content"><h5>Starters 150 (Rated)</h5><p><span>Contest One</span>, <span>Two</span></p></div>
      </section>`)
    expect(profile.contestCodes.get('starters 150 (rated)')).toBe('START150C')
    expect(profile.contestSolves).toEqual([
      { name: 'Starters 150 (Rated)', titles: ['Contest One', 'Two'] },
    ])
  })

  it('maps contest problem titles to codes and reads ratings', () => {
    const titles = parseContestProblems({
      problems: { ABCD: { code: 'ABCD', name: 'Contest One' } },
    })
    expect(titles.get('contest one')).toEqual(['ABCD'])
    expect(parseDifficultyRating({ difficulty_rating: '1712' })).toBe(1712)
    expect(parseDifficultyRating({ difficulty_rating: '-1' })).toBe(0)
  })
})

describe('syncCodeChef', () => {
  it('uploads solves with their context and the rating of contest solves', async () => {
    const uploads: ConnectorUpload[] = []
    const responses: Record<string, string> = {
      '/recent/user?page=0&user_handle=chef': feed([
        row({
          path: '/START150C/problems/ABCD',
          title: 'Contest One',
          time: '07:15 PM 21/09/26',
          accepted: true,
          solution: '9001',
        }),
        row({
          path: '/problems/FLOW001',
          title: 'Add Two Numbers',
          time: '10:00 AM 20/09/26',
          accepted: true,
          solution: '9000',
        }),
      ]),
      '/users/chef': '<section class="problems-solved"></section>',
      '/api/contests/START150C/problems/ABCD': JSON.stringify({
        difficulty_rating: '1450',
      }),
    }
    const result = await syncCodeChef(
      {
        read: async (url) => {
          const parsed = new URL(url)
          const body = responses[`${parsed.pathname}${parsed.search}`]
          return body === undefined
            ? new Response('missing', { status: 404 })
            : new Response(body, { status: 200 })
        },
        upload: async (upload) => {
          uploads.push(upload)
        },
        sleep: async () => {},
        now: () => new Date('2026-09-27T00:00:00.000Z'),
      },
      emptyCodeChefState(),
      'chef',
    )

    expect(result.outcome.status).toBe('synced')
    expect(result.outcome.historyComplete).toBe(true)
    expect(result.state.newestId).toBe(9001)
    expect(uploads).toHaveLength(1)
    expect(uploads[0]?.provider).toBe('codechef')
    expect(uploads[0]?.submissions.map((item) => item.eventId)).toEqual([
      '9001',
      '9000',
    ])
    expect(uploads[0]?.solvedProblems).toEqual(
      expect.arrayContaining([
        {
          externalId: 'ABCD',
          title: 'Contest One',
          solveContext: 'contest',
          contestCode: 'START150C',
          difficultyRating: 1450,
        },
        {
          externalId: 'FLOW001',
          title: 'Add Two Numbers',
          solveContext: 'practice',
        },
      ]),
    )
  })

  it('keeps the old state when CodeChef rate limits the first page', async () => {
    const previous = { ...emptyCodeChefState(), handle: 'chef', newestId: 5 }
    const result = await syncCodeChef(
      {
        read: async () => new Response('slow down', { status: 429 }),
        upload: async () => {},
        sleep: async () => {},
        now: () => new Date('2026-09-27T00:00:00.000Z'),
      },
      previous,
      'chef',
    )
    expect(result.outcome.status).toBe('rate_limited')
    expect(result.outcome.continueSoon).toBe(true)
    expect(result.state.newestId).toBe(5)
  })

  it('uploads queued contest ratings before a rate-limited history backfill', async () => {
    const uploads: ConnectorUpload[] = []
    const requests: string[] = []
    const result = await syncCodeChef(
      {
        read: async (url) => {
          const path = new URL(url).pathname
          requests.push(path)
          return path === '/api/contests/START150C/problems/ABCD'
            ? new Response(JSON.stringify({ difficulty_rating: 1450 }), {
                status: 200,
              })
            : new Response('slow down', { status: 429 })
        },
        upload: async (upload) => {
          uploads.push(upload)
        },
        sleep: async () => {},
        now: () => new Date('2026-09-27T00:00:00.000Z'),
      },
      {
        ...emptyCodeChefState(),
        handle: 'chef',
        newestId: 9001,
        backfill: { phase: 'running', next: 1 },
        pendingRatings: ['START150C:ABCD'],
      },
      'chef',
    )

    expect(requests[0]).toBe('/api/contests/START150C/problems/ABCD')
    expect(result.outcome.status).toBe('rate_limited')
    expect(result.state.pendingRatings).toEqual([])
    expect(uploads[0]?.solvedProblems).toContainEqual({
      externalId: 'ABCD',
      solveContext: 'contest',
      contestCode: 'START150C',
      difficultyRating: 1450,
    })
  })
})
