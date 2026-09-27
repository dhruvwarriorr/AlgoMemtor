import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  JobPumpResponseSchema,
  type JobPumpRequest,
} from '@algomemtor/shared-contracts'

import { useAuth } from '@/features/auth/useAuth'
import { requestJson } from '@/features/discovery/api/client'

// AlgoMemtor runs no background workers. Queued server work (platform syncs,
// learner memory) runs while a signed-in page is open: the page wakes the
// server on arrival, after the learner does something, and every so often
// while work is pending. With the tab hidden or closed, the work waits,
// durably, for the next visit.

const wakeListeners = new Set<() => void>()

// Ask the page's pump to wake the server soon (after an action that may
// have queued work).
export function requestJobPump() {
  for (const listener of wakeListeners) listener()
}

export function pumpJobs(request: JobPumpRequest) {
  return requestJson('/api/jobs/pump', {
    authentication: 'required',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    schema: JobPumpResponseSchema,
  })
}

// Tabs share one pump: a tab skips a wake another tab made moments ago.
const lastWakeKey = 'algomemtor-job-pump-at'
const sharedGapMs = 3_000
// A tab hidden this long counts as a new visit when it comes back.
const newVisitAfterMs = 10 * 60 * 1000
const soonMs = 600

function recentlyWokenElsewhere(now: number) {
  try {
    const last = Number(window.localStorage.getItem(lastWakeKey))
    return Number.isFinite(last) && now - last < sharedGapMs
  } catch {
    return false
  }
}

function markWoken(now: number) {
  try {
    window.localStorage.setItem(lastWakeKey, String(now))
  } catch {
    // Without storage each tab wakes on its own; the server limits it.
  }
}

export function useJobPump() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const userId = user?.id

  useEffect(() => {
    if (userId === undefined) return
    let timer = 0
    let stopped = false
    let inFlight = false
    let pending = false
    let visit = true
    let hiddenAt: number | null = null

    const schedule = (ms: number) => {
      window.clearTimeout(timer)
      if (!stopped) timer = window.setTimeout(() => void wake(), ms)
    }

    const wake = async () => {
      if (stopped || inFlight || document.visibilityState !== 'visible') return
      const now = Date.now()
      if (!visit && recentlyWokenElsewhere(now)) {
        schedule(sharedGapMs)
        return
      }
      inFlight = true
      markWoken(now)
      try {
        const response = await pumpJobs(visit ? { visit: true } : {})
        visit = false
        const wasPending = pending
        pending = response.data.pending
        // Finished work changes the learner's data; show it.
        if (wasPending && !pending) void queryClient.invalidateQueries()
        schedule(response.data.nextPollAfterMs)
      } catch {
        // Offline or signed out: try again later.
        schedule(60_000)
      } finally {
        inFlight = false
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        window.clearTimeout(timer)
        return
      }
      if (hiddenAt !== null && Date.now() - hiddenAt >= newVisitAfterMs)
        visit = true
      hiddenAt = null
      schedule(soonMs)
    }

    const onRequest = () => schedule(soonMs)

    // A successful action may have queued work (a coach turn, a solve).
    const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
      if (
        event.type === 'updated' &&
        event.action.type === 'success' &&
        event.mutation.options.mutationKey?.[0] !== 'job-pump'
      ) {
        schedule(soonMs)
      }
    })

    wakeListeners.add(onRequest)
    document.addEventListener('visibilitychange', onVisibility)
    schedule(0)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      wakeListeners.delete(onRequest)
      document.removeEventListener('visibilitychange', onVisibility)
      unsubscribe()
    }
  }, [queryClient, userId])
}
