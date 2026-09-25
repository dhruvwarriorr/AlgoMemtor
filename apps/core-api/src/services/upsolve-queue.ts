import {
  isSafeCoachPublicUrl,
  UPSOLVE_CHART_WINDOW_DAYS,
  UpsolveContestSchema,
  type ProviderKey,
  type UpsolveContest,
  type UpsolveHistoryPoint,
  type UpsolveItem,
  type UpsolveSummary,
} from '@algomemtor/shared-contracts'

import {
  problemRef,
  type LearnerActivity,
  type ProblemMeta,
} from '../repositories/mentor-repository.js'
import {
  contestDurationMinutes,
  participationWindow,
  type AnalyzedContest,
} from './contest-analysis.js'

export const UPSOLVE_CONTEST_LIMIT = 12

export type UpsolvedProblem = {
  provider: ProviderKey
  externalId: string
  title: string
  canonicalUrl: string
  topics: string[]
  upsolvedAt: Date
}

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

export function editorialUrl(
  provider: ProviderKey,
  problemKey: string,
  contestId: string,
): string | undefined {
  const url =
    provider === 'codeforces' && /^\d+$/.test(contestId)
      ? `https://codeforces.com/contest/${contestId}`
      : provider === 'leetcode' && /^[a-z0-9-]+$/.test(problemKey)
        ? `https://leetcode.com/problems/${problemKey}/editorial/`
        : provider === 'codechef' && /^[A-Z0-9_]+$/i.test(problemKey)
          ? `https://discuss.codechef.com/search?q=${encodeURIComponent(problemKey)}`
          : undefined
  return url !== undefined && isSafeCoachPublicUrl(url) ? url : undefined
}

const monthKey = (date: Date) => date.toISOString().slice(0, 7)

// Per contest, the first two unsolved problems and the next two are
// candidates for the queue.
export const CANDIDATE_DEPTH = 4
const HISTORY_LIMIT = 12

export type UpsolveCandidate = UpsolveItem & {
  frontierRank: number
  contestIndex: number
  daysAgo: number
  score: number
}

const frontierDifficulty = [0.8, 0.65, 0.45, 0.35]

// Priority in the spirit of recency x difficulty fit x contest attempts:
// recent contests, problems near the learner's stretch rating, problems
// they fought with in the contest, and the first two unsolved problems of
// each contest rank highest.
export function upsolveScore(input: {
  daysAgo: number
  rating?: number
  userRating?: number
  frontierRank: number
  attempted: boolean
  wrongAttempts: number
}) {
  const recency = Math.exp(-input.daysAgo / 30)
  const difficulty =
    input.rating !== undefined && input.userRating !== undefined
      ? Math.exp(
          -((input.rating - (input.userRating + 100)) ** 2) / (2 * 300 ** 2),
        )
      : (frontierDifficulty[input.frontierRank] ?? 0.3)
  const attempt = Math.min(
    1,
    (input.attempted ? 0.25 : 0) + 0.2 * input.wrongAttempts,
  )
  const frontier = input.frontierRank < 2 ? 1 : 0.4
  return clamp(
    100 * (0.3 * recency + 0.3 * difficulty + 0.15 * attempt + 0.25 * frontier),
  )
}

export function buildUpsolve(input: {
  contests: readonly AnalyzedContest[]
  activity: LearnerActivity
  metadata: ReadonlyMap<string, ProblemMeta>
  states: ReadonlyMap<string, 'skipped' | 'solved'>
  now: Date
}): {
  candidates: UpsolveCandidate[]
  contests: UpsolveContest[]
  history: UpsolveHistoryPoint[]
  summary: UpsolveSummary
  upsolved: UpsolvedProblem[]
  // A recent contest whose problem list could not be loaded; a queue built
  // now would miss its problems.
  incomplete: boolean
} {
  const { activity } = input
  const latestRating = new Map<ProviderKey, number>()
  for (const change of activity.ratingChanges) {
    latestRating.set(change.provider, change.newRating)
  }
  const solvedObservation = new Map(
    activity.solved.map((item) => [
      problemRef(item.provider, item.problemKey),
      item,
    ]),
  )
  const upsolveContests: UpsolveContest[] = []
  const history: UpsolveHistoryPoint[] = []
  const candidates: UpsolveCandidate[] = []
  const unsolvedItems: (UpsolveItem & { contestStart: Date })[] = []
  const upsolved: UpsolvedProblem[] = []
  const eligible = input.contests
    .filter((item) => item.metrics !== undefined && item.contest !== undefined)
    .slice(0, UPSOLVE_CONTEST_LIMIT)
  // Totals and charts cover the last UPSOLVE_CHART_WINDOW_DAYS; the queue
  // and contest cards still draw on every recent contest.
  const windowStart =
    input.now.getTime() - UPSOLVE_CHART_WINDOW_DAYS * 86_400_000

  for (const [contestIndex, analyzed] of eligible.entries()) {
    const metrics = analyzed.metrics
    const contest = analyzed.contest
    if (metrics === undefined || contest?.startsAt === undefined) continue
    const provider = metrics.provider
    // A solve after the contest ended is an upsolve, unless it came in the
    // learner's own sitting: the contest itself, or their first practice
    // session on it (whose solves count as solved in that sitting).
    const officialEnd =
      contest.startsAt.getTime() +
      contestDurationMinutes(provider, contest) * 60_000
    const sitting = participationWindow(analyzed.participation, contest) ?? {
      start: contest.startsAt.getTime(),
      end: officialEnd,
    }
    const isUpsolveTime = (time: number) =>
      time > officialEnd && !(time >= sitting.start && time <= sitting.end)
    const daysAgo = Math.max(
      0,
      (input.now.getTime() - contest.startsAt.getTime()) / 86_400_000,
    )
    const userRating = latestRating.get(provider)
    const inWindow = contest.startsAt.getTime() >= windowStart
    const items: UpsolveItem[] = []
    let frontierRank = 0
    let solvedInContest = 0
    let upsolvedHere = 0
    for (const problem of metrics.problems) {
      const problemKey =
        provider === 'leetcode'
          ? problem.externalId.toLowerCase()
          : problem.externalId
      const ref = problemRef(provider, problemKey)
      const meta =
        input.metadata.get(ref) ??
        analyzed.contestProblems.find((item) => item.problemKey === problemKey)
      const submissionUrl = activity.submissions.find(
        (submission) =>
          submission.provider === provider &&
          submission.problemKey === problemKey,
      )?.canonicalUrl
      const canonicalUrl = meta?.canonicalUrl ?? submissionUrl
      if (canonicalUrl === undefined || !isSafeCoachPublicUrl(canonicalUrl)) {
        continue
      }
      const attempted = problem.attempts > 0
      const tags = problem.tags.length > 0 ? problem.tags : (meta?.topics ?? [])
      const editorial = editorialUrl(provider, problemKey, metrics.contestId)
      const base = {
        id: `${provider}:${problemKey}`.slice(0, 200),
        provider,
        externalId: problemKey,
        title: (problem.title ?? meta?.title ?? problem.externalId).slice(
          0,
          512,
        ),
        canonicalUrl,
        position: problem.label,
        ...(problem.rating === undefined ? {} : { rating: problem.rating }),
        tags: tags.slice(0, 12),
        contestOutcome: attempted
          ? ('attempted' as const)
          : ('unattempted' as const),
        contestWrongAttempts: problem.wrongAttempts,
        ...(editorial === undefined ? {} : { editorialUrl: editorial }),
        contest: {
          provider,
          contestId: metrics.contestId,
          name: metrics.name,
        },
      }
      if (problem.solved) {
        solvedInContest += 1
        items.push({
          ...base,
          status: 'solved_in_contest',
          priority: 0,
          priorityReason: 'Solved during the contest.',
        })
        continue
      }
      const acceptedAfter = activity.submissions.find(
        (submission) =>
          submission.provider === provider &&
          submission.problemKey === problemKey &&
          submission.isAccepted &&
          isUpsolveTime(submission.occurredAt.getTime()),
      )
      const observation = solvedObservation.get(ref)
      const status = activity.statuses.get(ref)
      const learnerState = input.states.get(ref)
      const after = (date: Date | undefined) =>
        date !== undefined && isUpsolveTime(date.getTime())
      // An upsolve is a solve after the learner's sitting, or an explicit
      // "mark solved". Solve evidence from before, during, or with no time is
      // not an upsolve: the problem simply counts as already solved.
      const upsolvedAt =
        acceptedAfter?.occurredAt ??
        (after(observation?.occurredAt)
          ? observation?.occurredAt
          : undefined) ??
        (status?.status === 'solved' && after(status.occurredAt)
          ? status.occurredAt
          : undefined) ??
        (learnerState === 'solved' ? input.now : undefined)
      const solvedOtherwise =
        upsolvedAt === undefined &&
        (observation !== undefined ||
          status?.status === 'solved' ||
          activity.submissions.some(
            (submission) =>
              submission.provider === provider &&
              submission.problemKey === problemKey &&
              submission.isAccepted,
          ))
      if (solvedOtherwise) {
        solvedInContest += 1
        items.push({
          ...base,
          status: 'solved_in_contest',
          priority: 0,
          priorityReason: 'Already solved.',
        })
        continue
      }
      const statusSource: 'provider' | 'manual' | undefined =
        acceptedAfter !== undefined || after(observation?.occurredAt)
          ? 'provider'
          : learnerState === 'solved' ||
              (status?.status === 'solved' && status.source === 'manual')
            ? 'manual'
            : upsolvedAt !== undefined
              ? 'provider'
              : undefined
      const state =
        upsolvedAt !== undefined
          ? 'upsolved'
          : learnerState === 'skipped'
            ? 'skipped'
            : 'pending'
      const rank = state === 'pending' ? frontierRank++ : -1
      const score =
        state === 'pending'
          ? upsolveScore({
              daysAgo,
              ...(problem.rating === undefined
                ? {}
                : { rating: problem.rating }),
              ...(userRating === undefined ? {} : { userRating }),
              frontierRank: rank,
              attempted,
              wrongAttempts: problem.wrongAttempts,
            })
          : 0
      const reason = attempted
        ? problem.wrongAttempts > 0
          ? `You attempted this in the contest (${problem.wrongAttempts} wrong ${problem.wrongAttempts === 1 ? 'submission' : 'submissions'}); you were close.`
          : 'You started this during the contest; finish the idea while it is fresh.'
        : rank === 0
          ? 'The first problem you did not solve in this contest.'
          : rank === 1
            ? 'The second unsolved problem in this contest.'
            : 'Next in line in this contest.'
      const item: UpsolveItem = {
        ...base,
        status: state,
        ...(statusSource === undefined || state !== 'upsolved'
          ? {}
          : { statusSource }),
        ...(upsolvedAt === undefined || state !== 'upsolved'
          ? {}
          : { upsolvedAt: upsolvedAt.toISOString() }),
        priority: score,
        priorityReason: reason,
      }
      items.push(item)
      if (inWindow) {
        unsolvedItems.push({ ...item, contestStart: contest.startsAt })
      }
      if (state === 'pending' && rank < CANDIDATE_DEPTH) {
        candidates.push({
          ...item,
          frontierRank: rank,
          contestIndex,
          daysAgo: Math.round(daysAgo),
          score,
        })
      }
      if (state === 'upsolved' && upsolvedAt !== undefined) {
        upsolvedHere += 1
        upsolved.push({
          provider,
          externalId:
            provider === 'leetcode'
              ? (meta?.externalId ?? problem.externalId)
              : problem.externalId,
          title: item.title,
          canonicalUrl,
          topics: item.tags,
          upsolvedAt,
        })
      }
    }
    if (inWindow && history.length < HISTORY_LIMIT) {
      history.push({
        provider,
        contestId: metrics.contestId.slice(0, 128),
        name: metrics.name.slice(0, 512),
        startsAt: contest.startsAt.toISOString(),
        total: items.length,
        solvedInContest,
        upsolved: upsolvedHere,
        ...(analyzed.participation.mode === undefined
          ? {}
          : { participation: analyzed.participation.mode }),
      })
    }
    const parsed = UpsolveContestSchema.safeParse({
      provider,
      contestId: metrics.contestId,
      name: metrics.name,
      canonicalUrl: metrics.canonicalUrl,
      startsAt: metrics.startsAt,
      ...(metrics.rank === undefined ? {} : { rank: metrics.rank }),
      ...(metrics.ratingChange === undefined
        ? {}
        : { ratingChange: metrics.ratingChange }),
      solvedInContest: metrics.solvedCount,
      ...(analyzed.participation.mode === undefined
        ? {}
        : { participation: analyzed.participation.mode }),
      coverage: metrics.coverage,
      ...(metrics.coverageNotes[0] === undefined
        ? {}
        : { coverageNote: metrics.coverageNotes[0].slice(0, 300) }),
      // The whole contest in contest order.
      items: items.slice(0, 26),
    })
    if (parsed.success) upsolveContests.push(parsed.data)
  }

  const flagged = unsolvedItems.length
  const upsolvedCount = unsolvedItems.filter(
    (item) => item.status === 'upsolved',
  ).length
  const skipped = unsolvedItems.filter(
    (item) => item.status === 'skipped',
  ).length
  const pending = unsolvedItems.filter(
    (item) => item.status === 'pending',
  ).length
  const trend = new Map<string, { flagged: number; upsolved: number }>()
  for (const item of unsolvedItems) {
    const key = monthKey(item.contestStart)
    const value = trend.get(key) ?? { flagged: 0, upsolved: 0 }
    value.flagged += 1
    if (item.status === 'upsolved') value.upsolved += 1
    trend.set(key, value)
  }
  const incomplete = eligible
    .slice(0, 6)
    .some(
      (item) =>
        item.participation.provider !== 'codeforces' &&
        item.contestProblems.length === 0,
    )
  return {
    incomplete,
    candidates: candidates.sort((left, right) => right.score - left.score),
    contests: upsolveContests,
    history,
    summary: {
      windowDays: UPSOLVE_CHART_WINDOW_DAYS,
      flagged,
      upsolved: upsolvedCount,
      skipped,
      pending,
      byProvider: [
        ...unsolvedItems
          .reduce((counts, item) => {
            const entry = counts.get(item.provider) ?? { upsolved: 0, open: 0 }
            if (item.status === 'upsolved') entry.upsolved += 1
            if (item.status === 'pending') entry.open += 1
            counts.set(item.provider, entry)
            return counts
          }, new Map<ProviderKey, { upsolved: number; open: number }>())
          .entries(),
      ].map(([provider, counts]) => ({ provider, ...counts })),
      completionRate:
        flagged - skipped > 0
          ? Math.round((upsolvedCount / (flagged - skipped)) * 1_000) / 1_000
          : null,
      trend: [...trend]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .slice(-12)
        .map(([month, value]) => ({ month, ...value })),
    },
    upsolved,
  }
}

// Problems already queued stay in place while they are still open.
export function keptQueue(
  previous: readonly string[],
  candidates: readonly { id: string }[],
  size: number,
): string[] {
  const open = new Set(candidates.map((item) => item.id))
  return previous.filter((id) => open.has(id)).slice(0, size)
}

// Freed slots are filled at the bottom: the AI's picks first, then the
// best-scored remaining candidates.
export function fillQueue(
  kept: readonly string[],
  pool: readonly { id: string }[],
  picks: readonly string[],
  size: number,
): string[] {
  const ids = [...kept]
  const allowed = new Set(pool.map((item) => item.id))
  for (const id of [...picks, ...pool.map((item) => item.id)]) {
    if (ids.length >= size) break
    if (allowed.has(id) && !ids.includes(id)) ids.push(id)
  }
  return ids
}

const byContestThenRank = (
  left: { contestIndex: number; frontierRank: number },
  right: { contestIndex: number; frontierRank: number },
) =>
  left.contestIndex - right.contestIndex ||
  left.frontierRank - right.frontierRank

// A fresh queue: the first two unsolved problems of each contest, newest
// contest first, filled up the same way a replacement would be.
export function initialQueue(
  candidates: readonly UpsolveCandidate[],
  size: number,
): string[] {
  return replacementPool(candidates, [], size)
    .slice(0, size)
    .map((item) => item.id)
}

// What may replace a finished problem: the top-two unsolved problems of any
// contest, so the queue holds at most two open problems of one contest.
// Only when those run out does the latest contest with open problems
// offer its next two. Ordered newest contest first.
export function replacementPool(
  candidates: readonly UpsolveCandidate[],
  kept: readonly string[],
  need = 0,
): UpsolveCandidate[] {
  const open = candidates.filter((item) => !kept.includes(item.id))
  const frontier = open
    .filter((item) => item.frontierRank < 2)
    .sort(byContestThenRank)
  if (frontier.length >= need) return frontier
  const latest = Math.min(...open.map((item) => item.contestIndex))
  return [
    ...frontier,
    ...open
      .filter(
        (item) =>
          item.contestIndex === latest &&
          item.frontierRank >= 2 &&
          item.frontierRank < CANDIDATE_DEPTH,
      )
      .sort(byContestThenRank),
  ]
}
