import { describe, expect, it, vi } from 'vitest'

import type { AiMemoryClient } from '../integrations/ai/ai-memory-client.js'
import type { AiMentorClient } from '../integrations/ai/ai-mentor-client.js'
import type { ContestProblemLink } from '../integrations/providers/contest-problems.js'
import { InMemoryMentorRepository } from '../repositories/mentor-repository.js'
import { MentorService } from './mentor-service.js'

const learner = '00000000-0000-4000-8000-000000000031'
const start = new Date('2026-09-23T14:30:00.000Z')
const now = new Date('2026-09-25T10:00:00.000Z')

const links: ContestProblemLink[] = ['A', 'B', 'C', 'D'].map((position) => ({
  externalId: `START257${position}`,
  problemKey: `START257${position}`,
  title: `Problem ${position}`,
  canonicalUrl: `https://www.codechef.com/problems/START257${position}`,
  position,
}))

const service = (contestProblems: () => Promise<ContestProblemLink[]>) => {
  const repository = new InMemoryMentorRepository(() => now)
  repository.contests = [
    {
      provider: 'codechef',
      externalId: '70591',
      name: 'Starters 257 (Rated till 6 Star)',
      canonicalUrl: 'https://www.codechef.com/START257',
      startsAt: start,
      durationSeconds: 7_200,
    },
  ]
  repository.setActivity(learner, {
    linkedProviders: ['codechef'],
    participations: [
      {
        provider: 'codechef',
        contestId: 'rating-18',
        contestName: 'Starters 257 (Rated)',
        canonicalUrl: 'https://www.codechef.com/START257',
        attendedAt: new Date(start.getTime() + 120 * 60_000),
        completeness: 'partial',
      },
    ],
    submissions: [
      {
        provider: 'codechef',
        problemKey: 'START257A',
        externalId: 'START257A',
        canonicalUrl: 'https://www.codechef.com/problems/START257A',
        verdict: 'accepted',
        isAccepted: true,
        occurredAt: new Date(start.getTime() + 10 * 60_000),
      },
    ],
  })
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  return {
    repository,
    mentor: new MentorService({
      repository,
      aiMentorClient: {} as AiMentorClient,
      aiMemoryClient: {} as AiMemoryClient,
      learnerProfile: async () => null,
      roadmap: async () => null,
      problemContent: async () => null,
      contestProblems,
      logger,
      now: () => now,
    }),
  }
}

describe('upsolve queue when a platform times out', () => {
  it('keeps the queued problems of a contest whose list loaded before', async () => {
    const read = vi
      .fn<() => Promise<ContestProblemLink[]>>()
      .mockResolvedValueOnce(links)
      .mockRejectedValue(new Error('PROVIDER_TIMEOUT'))
    const { mentor } = service(read)
    const first = await mentor.upsolve(learner)
    const ids = first.queue.map((item) => item.id)
    expect(ids).toEqual([
      'codechef:START257B',
      'codechef:START257C',
      'codechef:START257D',
    ])
    // The platform now fails; the list that loaded is reused.
    const second = await mentor.upsolve(learner)
    expect(second.queue.map((item) => item.id)).toEqual(ids)
  })

  it('does not save a queue built while the problem list is missing', async () => {
    const read = vi
      .fn<() => Promise<ContestProblemLink[]>>()
      .mockRejectedValueOnce(new Error('PROVIDER_TIMEOUT'))
      .mockResolvedValue(links)
    const { mentor, repository } = service(read)
    await mentor.upsolve(learner)
    expect(
      await repository.getReport(learner, 'upsolve_queue', 'current'),
    ).toBeNull()
    const later = await mentor.upsolve(learner)
    expect(later.queue.map((item) => item.id)).toEqual([
      'codechef:START257B',
      'codechef:START257C',
      'codechef:START257D',
    ])
  })
})
