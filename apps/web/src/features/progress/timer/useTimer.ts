import { use } from 'react'

import { TimerContext } from './timer-context'

export function useTimer() {
  const value = use(TimerContext)
  if (value === null)
    throw new Error('useTimer must be used inside TimerProvider')
  return value
}
