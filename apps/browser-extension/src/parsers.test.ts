import { describe, expect, it } from 'vitest'

import { normalizeApiUrl } from './api.js'
import {
  helsinkiTimeToIso,
  parseCsesProblemset,
  parseCsesTaskSubmissions,
} from './cses.js'
import {
  normalizeLeetCodeSubmission,
  parseLeetCodeProblems,
  parseLeetCodeSubmissionPage,
} from './leetcode.js'

describe('LeetCode parsing', () => {
  it('reads the signed-in user and solved problems', () => {
    expect(
      parseLeetCodeProblems({
        user_name: 'learner_1',
        stat_status_pairs: [
          {
            status: 'ac',
            stat: {
              question__title_slug: 'two-sum',
              question__title: 'Two Sum',
            },
          },
          {
            status: 'notac',
            stat: { question__title_slug: 'add-two-numbers' },
          },
          { status: null, stat: { question__title_slug: 'lru-cache' } },
          { status: 'ac', stat: { question__title_slug: '../evil' } },
        ],
      }),
    ).toEqual({
      username: 'learner_1',
      solved: [{ externalId: 'two-sum', title: 'Two Sum' }],
      solvedComplete: true,
    })
    expect(
      parseLeetCodeProblems({ user_name: '', stat_status_pairs: [] }).username,
    ).toBeNull()
  })

  it('normalizes a submission and drops its source code', () => {
    const normalized = normalizeLeetCodeSubmission({
      id: 1234567,
      title: 'Two Sum',
      title_slug: 'two-sum',
      status_display: 'Wrong Answer',
      lang: 'cpp',
      lang_name: 'C++',
      timestamp: 1_700_000_000,
      runtime: 'N/A',
      memory: '9.1 MB',
      compare_result: '1110',
      code: 'int main() { return 0; }',
    })
    expect(normalized).toEqual({
      eventId: '1234567',
      externalId: 'two-sum',
      problemTitle: 'Two Sum',
      verdict: 'Wrong Answer',
      isAccepted: false,
      language: 'C++',
      occurredAt: '2023-11-14T22:13:20.000Z',
      memoryKb: 9318,
      passedTestCount: 3,
    })
    expect(JSON.stringify(normalized)).not.toContain('int main')
    expect(
      normalizeLeetCodeSubmission({
        id: 1,
        title_slug: 'two-sum',
        status_display: 'Accepted',
        timestamp: 1_700_000_000,
        runtime: '4 ms',
      }),
    ).toMatchObject({ isAccepted: true, runtimeMs: 4 })
  })

  it('reads pagination fields and skips malformed rows', () => {
    const page = parseLeetCodeSubmissionPage({
      submissions_dump: [
        {
          id: 2,
          title_slug: 'two-sum',
          status_display: 'Accepted',
          timestamp: 1_700_000_000,
        },
        { id: 'x', title_slug: 'two-sum' },
      ],
      has_next: true,
      last_key: 'abc',
    })
    expect(page).toMatchObject({ ids: [2], hasNext: true, lastKey: 'abc' })
    expect(() => parseLeetCodeSubmissionPage({ detail: 'no' })).toThrow()
  })
})

describe('CSES parsing', () => {
  const problemset = `
    <a class="account" href="/user/12345">learner</a>
    <h2>Introductory Problems</h2>
    <ul class="task-list">
      <li class="task"><a href="/problemset/task/1068">Weird Algorithm</a><span class="detail">1 / 2</span> <span class="task-score icon full"></span></li>
      <li class="task"><a href="/problemset/task/1083">Missing &amp; Number</a><span class="detail">1 / 2</span> <span class="task-score icon zero"></span></li>
      <li class="task"><a href="/problemset/task/1069">Repetitions</a><span class="detail">1 / 2</span> <span class="task-score icon "></span></li>
    </ul>`

  it('reads the user ID and task statuses', () => {
    expect(parseCsesProblemset(problemset)).toEqual({
      userId: '12345',
      tasks: [
        {
          id: '1068',
          title: 'Weird Algorithm',
          status: 'solved',
          section: 'Introductory Problems',
        },
        {
          id: '1083',
          title: 'Missing & Number',
          status: 'attempted',
          section: 'Introductory Problems',
        },
        {
          id: '1069',
          title: 'Repetitions',
          status: 'none',
          section: 'Introductory Problems',
        },
      ],
    })
    expect(
      parseCsesProblemset('<a class="account" href="/login">Login</a>').userId,
    ).toBeNull()
  })

  it('reads submissions from a task page in Helsinki time', () => {
    const html = `<h4>Your submissions</h4><table>
      <tr><td><a href="/problemset/result/900/">2026-01-15 12:00:00</a></td><td><span class="task-score icon zero"></span></td></tr>
      <tr><td><a href="/problemset/result/901/">2026-07-15 12:00:00</a></td><td><span class="task-score icon full"></span></td></tr>
    </table>`
    expect(parseCsesTaskSubmissions(html, '1068', 'Weird Algorithm')).toEqual([
      {
        eventId: '900',
        externalId: '1068',
        problemTitle: 'Weird Algorithm',
        verdict: 'NOT ACCEPTED',
        isAccepted: false,
        occurredAt: '2026-01-15T10:00:00.000Z',
      },
      {
        eventId: '901',
        externalId: '1068',
        problemTitle: 'Weird Algorithm',
        verdict: 'ACCEPTED',
        isAccepted: true,
        occurredAt: '2026-07-15T09:00:00.000Z',
      },
    ])
    expect(helsinkiTimeToIso('not a time')).toBeNull()
  })
})

describe('API address', () => {
  it('allows https and local http only', () => {
    expect(normalizeApiUrl('http://localhost:3003/')).toBe(
      'http://localhost:3003',
    )
    expect(normalizeApiUrl('https://api.example.com/x')).toBe(
      'https://api.example.com',
    )
    expect(() => normalizeApiUrl('http://example.com')).toThrow()
  })
})
