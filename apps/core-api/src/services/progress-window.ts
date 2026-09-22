import type {
  ProviderSolvedProblem,
  ProviderSubmission,
} from '@algomemtor/shared-contracts'

import type { ProblemActionRecord } from '../repositories/problem-action-repository.js'

type DatedProblem = {
  provider: string
  externalId: string
  occurredAt: string
  solved: boolean
}

export function progressWindow(
  actions: readonly ProblemActionRecord[],
  submissions: readonly ProviderSubmission[],
  solvedProblems: readonly ProviderSolvedProblem[],
  dates: readonly string[],
  localDate: (value: Date) => string,
) {
  const days = new Set(dates)
  const evidence: DatedProblem[] = [
    ...actions
      .filter(
        (action) =>
          action.actionType === 'status_changed' &&
          action.learnerStatus !== 'unsolved',
      )
      .map((action) => ({
        provider: action.provider,
        externalId: action.externalId,
        occurredAt: action.occurredAt.toISOString(),
        solved: action.learnerStatus === 'solved',
      })),
    ...submissions.flatMap((submission) =>
      submission.occurredAt === undefined
        ? []
        : [
            {
              provider: submission.provider,
              externalId: submission.externalId,
              occurredAt: submission.occurredAt,
              solved: submission.isAccepted,
            },
          ],
    ),
    ...solvedProblems.flatMap((problem) =>
      problem.occurredAt === null
        ? []
        : [
            {
              provider: problem.provider,
              externalId: problem.externalId,
              occurredAt: problem.occurredAt,
              solved: true,
            },
          ],
    ),
  ]
  const byDay = new Map<
    string,
    { attempted: Set<string>; solved: Set<string> }
  >()
  const firstSolve = new Map<string, number>()
  for (const item of evidence) {
    if (!item.solved) continue
    const timestamp = new Date(item.occurredAt).getTime()
    if (Number.isNaN(timestamp) || timestamp > Date.now()) continue
    const key = `${item.provider}:${item.externalId}`
    firstSolve.set(key, Math.min(firstSolve.get(key) ?? timestamp, timestamp))
  }
  const attempted = new Set<string>()
  const solved = new Set<string>()
  const solvedDays = new Set<string>()
  for (const item of evidence) {
    const date = new Date(item.occurredAt)
    if (Number.isNaN(date.getTime()) || date.getTime() > Date.now()) continue
    const day = localDate(date)
    if (item.solved) solvedDays.add(day)
    if (!days.has(day)) continue
    const key = `${item.provider}:${item.externalId}`
    const entry = byDay.get(day) ?? {
      attempted: new Set<string>(),
      solved: new Set<string>(),
    }
    entry.attempted.add(key)
    attempted.add(key)
    if (item.solved && date.getTime() === firstSolve.get(key)) {
      entry.solved.add(key)
      solved.add(key)
    }
    byDay.set(day, entry)
  }
  return {
    attempted: attempted.size,
    solved: solved.size,
    attemptedProblemIds: [...attempted],
    solvedProblemIds: [...solved],
    solvedDays,
    trend: dates.map((date) => ({
      date,
      attempted: byDay.get(date)?.attempted.size ?? 0,
      solved: byDay.get(date)?.solved.size ?? 0,
    })),
  }
}
