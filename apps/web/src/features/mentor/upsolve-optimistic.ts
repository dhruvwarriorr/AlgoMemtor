import type {
  ProviderKey,
  UpdateUpsolveItemRequest,
  UpsolveItem,
  UpsolveResponse,
} from '@algomemtor/shared-contracts'

export type UpsolveStateChange = {
  provider: ProviderKey
  externalId: string
  state: UpdateUpsolveItemRequest['state']
}

const sameProblem = (item: UpsolveItem, change: UpsolveStateChange) =>
  item.provider === change.provider &&
  (change.provider === 'leetcode'
    ? item.externalId.toLowerCase() === change.externalId.toLowerCase()
    : item.externalId === change.externalId)

const withState = (
  item: UpsolveItem,
  state: UpsolveStateChange['state'],
  now: string,
): UpsolveItem => {
  // A problem solved in the contest keeps that status.
  if (item.status === 'solved_in_contest') return item
  const rest: UpsolveItem = { ...item }
  delete rest.statusSource
  delete rest.upsolvedAt
  if (state === 'solved') {
    return {
      ...rest,
      status: 'upsolved',
      statusSource: 'manual',
      upsolvedAt: now,
    }
  }
  return { ...rest, status: state === 'skipped' ? 'skipped' : 'pending' }
}

// The cached Upsolve view right after a state change, before the server
// rebuilds it: the problem leaves the queue when solved or skipped and its
// contest row shows the new status. The refetch that follows refills the
// queue and recounts the summary.
export function applyUpsolveState(
  data: UpsolveResponse,
  change: UpsolveStateChange,
  now: string = new Date().toISOString(),
): UpsolveResponse {
  return {
    data: {
      ...data.data,
      queue:
        change.state === 'pending'
          ? data.data.queue
          : data.data.queue.filter((item) => !sameProblem(item, change)),
      contests: data.data.contests.map((contest) => ({
        ...contest,
        items: contest.items.map((item) =>
          sameProblem(item, change) ? withState(item, change.state, now) : item,
        ),
      })),
    },
  }
}
