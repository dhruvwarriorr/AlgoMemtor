import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import { useLocation } from 'react-router-dom'

import { useAuth } from '@/features/auth/useAuth'

import {
  pauseTimer,
  resolveTimer,
  resumeTimer,
  startProblemTimer,
} from '../api/progress'
import type { ProblemReference } from '../contracts'
import { ProblemTimerSessionSchema } from '../contracts'
import {
  dataResetEventName,
  MAX_TIMER_SECONDS,
  timerProblemMatches,
} from './timer-utils'
import { TimerContext, type LocalTimer, type TimerError } from './timer-context'

const storageKey = (userId: string) => `algomemtor:timer:${userId}`

function requestErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function readStoredTimer(userId: string): LocalTimer | null {
  try {
    const value = window.localStorage.getItem(storageKey(userId))
    if (!value) return null
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed !== 'object' || parsed === null || !('timer' in parsed)) {
      return null
    }
    const timerValue = parsed.timer
    if (typeof timerValue !== 'object' || timerValue === null) return null
    const result = ProblemTimerSessionSchema.safeParse(timerValue)
    if (!result.success) return null
    const lastResumedAt =
      'lastResumedAt' in timerValue && isDateString(timerValue.lastResumedAt)
        ? timerValue.lastResumedAt
        : undefined
    return {
      ...result.data,
      ...(lastResumedAt === undefined ? {} : { lastResumedAt }),
    }
  } catch {
    return null
  }
}

function writeStoredTimer(userId: string, timer: LocalTimer | null) {
  if (timer === null) {
    window.localStorage.removeItem(storageKey(userId))
    return
  }
  window.localStorage.setItem(storageKey(userId), JSON.stringify({ timer }))
}

function timerElapsed(timer: LocalTimer | null, now = Date.now()) {
  if (timer === null) return 0
  if (timer.state !== 'running') return timer.durationSeconds
  const resumedAt = Date.parse(timer.lastResumedAt ?? timer.startedAt)
  if (Number.isNaN(resumedAt)) return timer.durationSeconds
  return Math.min(
    MAX_TIMER_SECONDS,
    timer.durationSeconds + Math.max(0, Math.floor((now - resumedAt) / 1000)),
  )
}

export function TimerProvider({ children }: PropsWithChildren) {
  const { user } = useAuth()
  const location = useLocation()
  const userId = user?.id ?? null
  const [timer, setTimer] = useState<LocalTimer | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [isMutating, setIsMutating] = useState(false)
  const [timerError, setTimerError] = useState<TimerError | null>(null)
  const hydratedUserId = useRef<string | null>(null)
  const previousUserId = useRef<string | null>(null)
  const timerRef = useRef<LocalTimer | null>(null)
  const previousLocation = useRef<string | null>(null)
  const capRequest = useRef<string | null>(null)

  useEffect(() => {
    timerRef.current = timer
  }, [timer])

  useEffect(() => {
    const previousId = previousUserId.current
    if (previousId !== null && previousId !== userId) {
      window.localStorage.removeItem(storageKey(previousId))
    }
    previousUserId.current = userId

    const storedTimer = userId ? readStoredTimer(userId) : null
    hydratedUserId.current = null
    capRequest.current = null
    const updateTimer = window.setTimeout(() => {
      hydratedUserId.current = userId
      setTimerError(null)
      setTimer(storedTimer)
    }, 0)
    return () => window.clearTimeout(updateTimer)
  }, [userId])

  useEffect(() => {
    if (!userId || hydratedUserId.current !== userId) return
    writeStoredTimer(userId, timer)
  }, [timer, userId])

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (!userId || event.key !== storageKey(userId)) return
      setTimer(readStoredTimer(userId))
      setTimerError(null)
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [userId])

  useEffect(() => {
    function handleDataReset() {
      if (userId) window.localStorage.removeItem(storageKey(userId))
      capRequest.current = null
      setTimerError(null)
      setTimer(null)
    }

    window.addEventListener(dataResetEventName, handleDataReset)
    return () => window.removeEventListener(dataResetEventName, handleDataReset)
  }, [userId])

  const elapsedSeconds = timerElapsed(timer, now)

  const resolveCappedTimer = useCallback(async () => {
    const currentTimer = timer
    const currentElapsedSeconds = timerElapsed(currentTimer)
    if (
      !currentTimer ||
      currentTimer.state !== 'running' ||
      currentElapsedSeconds < MAX_TIMER_SECONDS ||
      capRequest.current === currentTimer.id
    ) {
      return null
    }

    capRequest.current = currentTimer.id
    setIsMutating(true)
    try {
      const response = await pauseTimer(currentTimer.id)
      const next = {
        ...response.data,
        durationSeconds: MAX_TIMER_SECONDS,
        state: 'capped' as const,
        requiresResolution: true,
        pausedAt: response.data.pausedAt ?? new Date().toISOString(),
      }
      if (timerRef.current?.id === currentTimer.id) {
        setTimer(next)
        setTimerError(null)
      }
      capRequest.current = null
      return next
    } catch (error) {
      if (timerRef.current?.id === currentTimer.id) {
        setTimerError({
          action: 'cap',
          message: requestErrorMessage(
            error,
            'The timer could not be paused at the four-hour cap. It is still running.',
          ),
          timerId: currentTimer.id,
        })
      }
      throw error
    } finally {
      setIsMutating(false)
    }
  }, [timer])

  useEffect(() => {
    if (timer?.state !== 'running') return
    const interval = window.setInterval(() => {
      const timestamp = Date.now()
      setNow(timestamp)
      if (timerElapsed(timer, timestamp) >= MAX_TIMER_SECONDS) {
        void resolveCappedTimer().catch(() => undefined)
      }
    }, 1_000)
    return () => window.clearInterval(interval)
  }, [resolveCappedTimer, timer])

  useEffect(() => {
    const currentLocation = `${location.pathname}${location.search}${location.hash}`
    if (
      previousLocation.current !== null &&
      previousLocation.current !== currentLocation &&
      timer?.state === 'running'
    ) {
      const timerId = timer.id
      setIsMutating(true)
      void pauseTimer(timerId)
        .then((response) => {
          if (timerRef.current?.id !== timerId) return
          setTimer(response.data)
          setTimerError(null)
        })
        .catch((error: unknown) => {
          if (timerRef.current?.id !== timerId) return
          setTimerError({
            action: 'pause',
            message: requestErrorMessage(
              error,
              'The timer could not be paused while leaving this page. It is still running.',
            ),
            timerId,
          })
        })
        .finally(() => setIsMutating(false))
    }
    previousLocation.current = currentLocation
  }, [location.hash, location.pathname, location.search, timer])

  const start = useCallback(
    async (problem: ProblemReference, confirmSwitch = false) => {
      setTimerError(null)
      setIsMutating(true)
      try {
        const response =
          timer !== null &&
          timerProblemMatches(timer, problem) &&
          timer.state === 'paused' &&
          !timer.requiresResolution
            ? await resumeTimer(timer.id)
            : await startProblemTimer(problem, { confirmSwitch })
        const next: LocalTimer = {
          ...response.data,
          ...(response.data.state === 'running'
            ? { lastResumedAt: new Date().toISOString() }
            : {}),
        }
        setTimer(next)
        capRequest.current = null
        setNow(Date.now())
        return next
      } finally {
        setIsMutating(false)
      }
    },
    [timer],
  )

  const pause = useCallback(async () => {
    if (!timer) return null
    const timerId = timer.id
    setIsMutating(true)
    try {
      const response = await pauseTimer(timerId)
      const next = response.data
      if (timerRef.current?.id === timerId) {
        setTimer(next)
        setTimerError(null)
      }
      return next
    } catch (error) {
      if (timerRef.current?.id === timerId) {
        setTimerError({
          action: 'pause',
          message: requestErrorMessage(error, 'The timer could not be paused.'),
          timerId,
        })
      }
      throw error
    } finally {
      setIsMutating(false)
    }
  }, [timer])

  const resolve = useCallback(
    async (resolution: 'complete' | 'discard') => {
      if (!timer) return null
      const timerId = timer.id
      setIsMutating(true)
      try {
        const response = await resolveTimer(timerId, { resolution })
        if (
          response.data.state === 'completed' ||
          response.data.state === 'discarded'
        ) {
          if (timerRef.current?.id === timerId) {
            setTimer(null)
            setTimerError(null)
          }
          return null
        }
        if (timerRef.current?.id === timerId) {
          setTimer(response.data)
          setTimerError(null)
        }
        return response.data
      } catch (error) {
        if (timerRef.current?.id === timerId) {
          setTimerError({
            action: resolution,
            message: requestErrorMessage(
              error,
              resolution === 'complete'
                ? 'The timer time could not be saved.'
                : 'The timer could not be discarded.',
            ),
            timerId,
          })
        }
        throw error
      } finally {
        setIsMutating(false)
      }
    },
    [timer],
  )

  const retry = useCallback(async () => {
    if (!timerError || timerRef.current?.id !== timerError.timerId) {
      return null
    }

    if (timerError.action === 'cap') {
      capRequest.current = null
      return resolveCappedTimer()
    }

    if (timerError.action === 'pause') return pause()
    return resolve(timerError.action)
  }, [pause, resolve, resolveCappedTimer, timerError])

  const value = useMemo(
    () => ({
      timer,
      elapsedSeconds,
      isMutating,
      retry,
      start,
      pause,
      resolve,
      timerError,
    }),
    [
      elapsedSeconds,
      isMutating,
      pause,
      resolve,
      retry,
      start,
      timer,
      timerError,
    ],
  )

  return <TimerContext value={value}>{children}</TimerContext>
}
