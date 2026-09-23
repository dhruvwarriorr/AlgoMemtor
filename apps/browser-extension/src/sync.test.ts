import { describe, expect, it, vi } from 'vitest'

import { emptyState } from './state.js'
import { syncCses, syncLeetCode, UploadError, type SyncDeps } from './sync.js'
import type { ConnectorUpload } from './types.js'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

// A LeetCode history of `total` submissions, newest first, 20 per page.
const leetCodeServer = (
  total: number,
  options: { rateLimitAfter?: number } = {},
) => {
  let pageRequests = 0
  const read = vi.fn(async (url: string) => {
    if (url.endsWith('/api/problems/all/')) {
      return json({
        user_name: 'learner',
        stat_status_pairs: [
          { status: 'ac', stat: { question__title_slug: 'two-sum' } },
        ],
      })
    }
    pageRequests += 1
    if (
      options.rateLimitAfter !== undefined &&
      pageRequests > options.rateLimitAfter
    ) {
      return json({}, 429)
    }
    const offset = Number(new URL(url).searchParams.get('offset'))
    const ids = Array.from(
      { length: 20 },
      (_, index) => total - offset - index,
    ).filter((id) => id > 0)
    return json({
      submissions_dump: ids.map((id) => ({
        id,
        title_slug: 'two-sum',
        status_display: 'Accepted',
        timestamp: 1_700_000_000 + id,
      })),
      has_next: offset + 20 < total,
      last_key: `k${offset}`,
    })
  })
  return { read, pageRequests: () => pageRequests }
}

const deps = (
  read: SyncDeps['read'],
  uploads: ConnectorUpload[],
  overrides: Partial<SyncDeps> = {},
): SyncDeps => ({
  read,
  upload: async (upload) => {
    uploads.push(upload)
  },
  sleep: async () => {},
  now: () => new Date('2026-09-23T12:00:00.000Z'),
  leetcodePageBudget: 3,
  ...overrides,
})

const uploadedIds = (uploads: ConnectorUpload[]) =>
  new Set(
    uploads.flatMap((upload) =>
      upload.submissions.map((row) => Number(row.eventId)),
    ),
  )

describe('LeetCode sync', () => {
  it('backfills the whole history in parts and then only catches up', async () => {
    const server = leetCodeServer(100)
    const uploads: ConnectorUpload[] = []
    let state = emptyState()
    for (let run = 0; run < 3; run += 1) {
      const result = await syncLeetCode(deps(server.read, uploads), state)
      state = result.state
      if (run < 1)
        expect(result.outcome).toMatchObject({
          continueSoon: true,
          historyComplete: false,
        })
    }
    expect(uploadedIds(uploads).size).toBe(100)
    expect(state.leetcode).toMatchObject({
      newestId: 100,
      backfill: { phase: 'done' },
    })
    expect(uploads[0]).toMatchObject({
      solvedProblems: [{ externalId: 'two-sum' }],
      solvedListComplete: true,
    })

    // Later runs read only until the newest stored submission.
    const newer = leetCodeServer(105)
    const before = newer.pageRequests()
    const result = await syncLeetCode(deps(newer.read, uploads), state)
    expect(newer.pageRequests() - before).toBe(1)
    // Only the five newer submissions are uploaded, not the whole page.
    expect(uploads.at(-1)?.submissions.map((row) => row.eventId)).toEqual([
      '105',
      '104',
      '103',
      '102',
      '101',
    ])
    expect(result.outcome.uploadedSubmissions).toBe(5)
    expect(result.state.leetcode.newestId).toBe(105)
    expect(result.outcome).toMatchObject({
      historyComplete: true,
      continueSoon: false,
    })
  })

  it('keeps progress but leaves no gap when rate limited', async () => {
    const uploads: ConnectorUpload[] = []
    const limited = leetCodeServer(100, { rateLimitAfter: 2 })
    const first = await syncLeetCode(deps(limited.read, uploads), emptyState())
    expect(first.outcome).toMatchObject({
      status: 'rate_limited',
      continueSoon: true,
    })
    expect(first.state.leetcode.backfill).toMatchObject({
      phase: 'running',
      offset: 40,
    })

    let state = first.state
    for (let run = 0; run < 3; run += 1) {
      state = (
        await syncLeetCode(deps(leetCodeServer(100).read, uploads), state)
      ).state
    }
    expect(uploadedIds(uploads).size).toBe(100)
  })

  it('does not move forward when the upload fails', async () => {
    const server = leetCodeServer(100)
    const result = await syncLeetCode(
      deps(server.read, [], {
        upload: async () => {
          throw new UploadError(true, 'revoked')
        },
      }),
      emptyState(),
    )
    expect(result.outcome.status).toBe('unpaired')
    expect(result.state).toEqual(emptyState())
  })

  it('reports a signed-out browser', async () => {
    const result = await syncLeetCode(
      deps(async () => json({ user_name: '', stat_status_pairs: [] }), []),
      emptyState(),
    )
    expect(result.outcome.status).toBe('signed_out')
  })
})

describe('CSES sync', () => {
  const page = (statuses: Record<string, string>) =>
    `<a class="account" href="/user/77">me</a>${Object.entries(statuses)
      .map(
        ([id, status]) =>
          `<li class="task"><a href="/problemset/task/${id}">Task ${id}</a><span class="detail">1</span> <span class="task-score icon ${status}"></span></li>`,
      )
      .join('')}`

  const server = (statuses: Record<string, string>) => {
    const tasks: string[] = []
    const read = vi.fn(async (url: string) => {
      if (url.endsWith('/problemset/')) return new Response(page(statuses))
      const id = /task\/(\d+)/.exec(url)?.[1] ?? ''
      tasks.push(id)
      return new Response(
        `<a href="/problemset/result/${id}0/">2026-09-01 10:00:00</a><span class="task-score icon full"></span>`,
      )
    })
    return { read, tasks }
  }

  it('reads task submissions earliest first, in parts, and only again on change', async () => {
    const uploads: ConnectorUpload[] = []
    const first = server({
      '1083': 'full',
      '1068': 'full',
      '1069': 'zero',
      '1070': '',
    })
    const run1 = await syncCses(
      deps(first.read, uploads, { csesTaskBudget: 2 }),
      emptyState(),
    )
    expect(first.tasks).toEqual(['1068', '1069'])
    expect(run1.outcome).toMatchObject({
      continueSoon: true,
      historyComplete: false,
    })
    expect(uploads[0]).toMatchObject({
      provider: 'cses',
      account: { handle: '77' },
      solvedProblems: [
        { externalId: '1068', title: 'Task 1068' },
        { externalId: '1083', title: 'Task 1083' },
      ],
    })

    const second = server({ '1083': 'full', '1068': 'full', '1069': 'zero' })
    const run2 = await syncCses(
      deps(second.read, uploads, { csesTaskBudget: 2 }),
      run1.state,
    )
    expect(second.tasks).toEqual(['1083'])
    expect(run2.outcome).toMatchObject({
      historyComplete: true,
      continueSoon: false,
    })

    // Solving an attempted task re-reads only that task.
    const third = server({ '1083': 'full', '1068': 'full', '1069': 'full' })
    await syncCses(deps(third.read, uploads, { csesTaskBudget: 2 }), run2.state)
    expect(third.tasks).toEqual(['1069'])
  })
})
