import { createContext } from 'react'

import type { ProblemReference, ProblemTimerSession } from '../contracts'

export type LocalTimer = ProblemTimerSession & {
  lastResumedAt?: string
}

export type TimerError = {
  action: 'pause' | 'cap' | 'complete' | 'discard'
  message: string
  timerId: string
}

export type TimerContextValue = {
  timer: LocalTimer | null
  elapsedSeconds: number
  isMutating: boolean
  retry: () => Promise<LocalTimer | null>
  start: (
    problem: ProblemReference,
    confirmSwitch?: boolean,
  ) => Promise<LocalTimer>
  pause: () => Promise<LocalTimer | null>
  resolve: (resolution: 'complete' | 'discard') => Promise<LocalTimer | null>
  timerError: TimerError | null
}

export const TimerContext = createContext<TimerContextValue | null>(null)
