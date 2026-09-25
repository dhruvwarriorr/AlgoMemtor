import {
  isSafeCoachPublicUrl,
  UpsolveContestSchema,
  type ProviderKey,
  type UpsolveContest,
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
  type AnalyzedContest,
} from './contest-analysis.js'

export const UPSOLVE_CONTEST_LIMIT = 12
const QUEUE_LIMIT = 30

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

export function buildUpsolve(input: {
  contests: readonly AnalyzedContest[]
  activity: LearnerActivity
  metadata: ReadonlyMap<string, ProblemMeta>
  skipped: ReadonlyMap<string, 'skipped'>
  now: Date
}): {
  queue: UpsolveItem[]
  contests: UpsolveContest[]
  summary: UpsolveSummary
  upsolved: UpsolvedProblem[]
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
  const allItems: (UpsolveItem & { contestStart?: Date })[] = []
  const upsolved: UpsolvedProblem[] = []
  const eligible = input.contests
    .filter((item) => item.metrics !== undefined && item.contest !== undefined)
    .slice(0, UPSOLVE_CONTEST_LIMIT)

  for (const [contestIndex, analyzed] of eligible.entries()) {
    const metrics = analyzed.metrics
    const contest = analyzed.contest
    if (metrics === undefined || contest?.startsAt === undefined) continue
    const provider = metrics.provider
    const contestEnd = new Date(
      contest.startsAt.getTime() +
        contestDurationMinutes(provider, contest) * 60_000,
    )
    const userRating = latestRating.get(provider)
    const target =
      (userRating ?? (provider === 'codeforces' ? 1_300 : 1_500)) + 100
    const solvedRatings = metrics.problems
      .filter((problem) => problem.solved)
      .map((problem) => problem.rating ?? 0)
    const ceiling = Math.max(userRating ?? 1_200, ...solvedRatings, 0) + 300
    const lastSolvedIndex = metrics.problems.reduce(
      (last, problem, index) => (problem.solved ? index : last),
      -1,
    )
    const items: UpsolveItem[] = []
    for (const [index, problem] of metrics.problems.entries()) {
      if (problem.solved) continue
      const attempted = problem.attempts > 0
      const nextAfterSolve =
        index > lastSolvedIndex && index <= lastSolvedIndex + 2
      const reachable =
        attempted ||
        (provider === 'codeforces' &&
          (nextAfterSolve ||
            (problem.rating !== undefined && problem.rating <= ceiling)))
      if (!reachable) continue
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
      const acceptedAfter = activity.submissions.find(
        (submission) =>
          submission.provider === provider &&
          submission.problemKey === problemKey &&
          submission.isAccepted &&
          submission.occurredAt.getTime() > contestEnd.getTime(),
      )
      const observation = solvedObservation.get(ref)
      const status = activity.statuses.get(ref)
      const upsolvedAt =
        acceptedAfter?.occurredAt ??
        (observation === undefined
          ? undefined
          : (observation.occurredAt ?? input.now)) ??
        (status?.status === 'solved' ? status.occurredAt : undefined)
      const statusSource: 'provider' | 'manual' | undefined =
        acceptedAfter !== undefined || observation !== undefined
          ? 'provider'
          : status?.status === 'solved'
            ? status.source === 'manual'
              ? 'manual'
              : 'provider'
            : undefined
      const state =
        upsolvedAt !== undefined
          ? 'upsolved'
          : input.skipped.has(ref)
            ? 'skipped'
            : 'pending'
      let priority = 40
      const reasons: [number, string][] = []
      if (attempted) {
        priority += 25 + Math.min(problem.wrongAttempts, 3) * 3
        reasons.push([
          30,
          problem.wrongAttempts > 0
            ? `You attempted this in the contest (${problem.wrongAttempts} wrong ${problem.wrongAttempts === 1 ? 'submission' : 'submissions'}); you were close.`
            : 'You started this during the contest; finish the idea while it is fresh.',
        ])
      }
      if (problem.rating !== undefined) {
        const distance = Math.abs(problem.rating - target)
        priority += Math.max(0, 20 - distance / 25)
        if (problem.rating > target + 400) priority -= 15
        if (distance <= 200) {
          reasons.push([
            20,
            `Rated ${problem.rating}, right at your stretch level.`,
          ])
        }
      }
      if (nextAfterSolve) {
        priority += 8
        reasons.push([15, 'The next problem after your highest solve here.'])
      }
      priority += Math.max(0, 10 - contestIndex * 2)
      reasons.sort((left, right) => right[0] - left[0])
      const editorial = editorialUrl(provider, problemKey, metrics.contestId)
      const tags = problem.tags.length > 0 ? problem.tags : (meta?.topics ?? [])
      const item: UpsolveItem = {
        id: `${provider}:${problemKey}`.slice(0, 200),
        provider,
        externalId: problem.externalId,
        title: (problem.title ?? meta?.title ?? problem.externalId).slice(
          0,
          512,
        ),
        canonicalUrl,
        position: problem.label,
        ...(problem.rating === undefined ? {} : { rating: problem.rating }),
        tags: tags.slice(0, 12),
        contestOutcome: attempted ? 'attempted' : 'unattempted',
        contestWrongAttempts: problem.wrongAttempts,
        status: state,
        ...(statusSource === undefined || state !== 'upsolved'
          ? {}
          : { statusSource }),
        ...(upsolvedAt === undefined || state !== 'upsolved'
          ? {}
          : { upsolvedAt: upsolvedAt.toISOString() }),
        priority: clamp(priority),
        priorityReason:
          reasons[0]?.[1] ?? 'An unsolved problem from a recent contest.',
        ...(editorial === undefined ? {} : { editorialUrl: editorial }),
        contest: {
          provider,
          contestId: metrics.contestId,
          name: metrics.name,
        },
      }
      items.push(item)
      allItems.push({ ...item, contestStart: contest.startsAt })
      if (state === 'upsolved' && upsolvedAt !== undefined) {
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
      coverage: metrics.coverage,
      ...(metrics.coverageNotes[0] === undefined
        ? {}
        : { coverageNote: metrics.coverageNotes[0].slice(0, 300) }),
      items: items.sort((left, right) => right.priority - left.priority),
    })
    if (parsed.success) upsolveContests.push(parsed.data)
  }

  const flagged = allItems.length
  const upsolvedCount = allItems.filter(
    (item) => item.status === 'upsolved',
  ).length
  const skipped = allItems.filter((item) => item.status === 'skipped').length
  const pending = allItems.filter((item) => item.status === 'pending').length
  const trend = new Map<string, { flagged: number; upsolved: number }>()
  for (const item of allItems) {
    if (item.contestStart === undefined) continue
    const key = monthKey(item.contestStart)
    const value = trend.get(key) ?? { flagged: 0, upsolved: 0 }
    value.flagged += 1
    if (item.status === 'upsolved') value.upsolved += 1
    trend.set(key, value)
  }
  const queue = allItems
    .filter((item) => item.status === 'pending')
    .sort((left, right) => right.priority - left.priority)
    .slice(0, QUEUE_LIMIT)
    .map(({ contestStart: _start, ...item }) => item)
  return {
    queue,
    contests: upsolveContests,
    summary: {
      flagged,
      upsolved: upsolvedCount,
      skipped,
      pending,
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
