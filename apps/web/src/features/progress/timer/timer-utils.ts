import type { ProblemReference, ProblemTimerSession } from '../contracts'

export const MAX_TIMER_SECONDS = 4 * 60 * 60
export const dataResetEventName = 'algomemtor:data-reset'

export function formatTimerDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return [hours, minutes, remainder]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}

export function timerProblemMatches(
  timer: ProblemTimerSession | null,
  problem: ProblemReference,
) {
  return (
    timer?.problem.provider === problem.provider &&
    timer.problem.externalId === problem.externalId
  )
}
