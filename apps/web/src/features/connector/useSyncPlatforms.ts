import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { requestProviderSync } from '@/features/platform/api'
import { useProviderAccounts } from '@/features/profile/hooks/useProviderAccounts'

import { requestJobPump } from '@/features/jobs/job-pump'
import { endPetActivity, startPetActivity } from '@/features/pet/mello-events'
import { petLines } from '@/features/pet/pet-lines'

import { detectExtension, requestExtensionSync } from './extension-bridge'

// Manual syncs are limited to one per 15 minutes, matching the extension and
// the server's manual-sync cooldown.
export const MANUAL_SYNC_COOLDOWN_MS = 15 * 60 * 1000

export type SyncPlatformsState =
  | { kind: 'idle'; nextAllowedAt?: string }
  | { kind: 'syncing' }
  | { kind: 'done'; message: string; nextAllowedAt: string }
  | { kind: 'error'; message: string }

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

// Syncs every linked platform from the website: through the browser extension
// when it is installed and connected (it reads LeetCode and CSES with the
// learner's session), otherwise through AlgoMemtor's server for the public
// platforms.
export function useSyncPlatforms() {
  const queryClient = useQueryClient()
  const accounts = useProviderAccounts()
  const [extension, setExtension] = useState<'unknown' | 'paired' | 'absent'>(
    'unknown',
  )
  const [state, setState] = useState<SyncPlatformsState>({ kind: 'idle' })
  // Ticks so the cooldown ends without a reload.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    void detectExtension().then((ready) => {
      if (cancelled) return
      setExtension(ready?.paired === true ? 'paired' : 'absent')
      if (ready?.nextManualSyncAt !== undefined)
        setState({ kind: 'idle', nextAllowedAt: ready.nextManualSyncAt })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const refreshData = () => queryClient.invalidateQueries()

  const sync = async () => {
    setState({ kind: 'syncing' })
    // The pet reads along while the sync runs, on whichever page this is.
    startPetActivity('sync', 'reading', petLines.syncStarted)
    if (extension === 'paired') {
      const result = await requestExtensionSync()
      // The extension's uploads may queue server work; drain it now.
      requestJobPump()
      if (result.ok) {
        await refreshData()
        const problems = result.results.filter(
          (item) => item.status !== 'synced',
        )
        endPetActivity(
          'sync',
          problems.length === 0 ? petLines.syncDone : petLines.syncFailed,
        )
        setState({
          kind: 'done',
          nextAllowedAt: result.nextAllowedAt,
          message:
            problems.length === 0
              ? 'All platforms synced.'
              : `Synced, but ${problems
                  .map((item) => `${item.provider}: ${item.message}`)
                  .join(' ')}`,
        })
      } else if (result.reason === 'cooldown' && result.nextAllowedAt) {
        endPetActivity('sync', petLines.syncCooldown)
        setState({
          kind: 'idle',
          nextAllowedAt: result.nextAllowedAt,
        })
      } else {
        endPetActivity('sync', petLines.syncFailed)
        setState({
          kind: 'error',
          message:
            result.reason === 'timeout'
              ? 'The extension did not finish in time. It keeps syncing in the background.'
              : result.reason === 'unpaired'
                ? 'The extension is not connected. Use Reconnect in Settings.'
                : `The extension could not sync${result.message === undefined ? '' : `: ${result.message}`}.`,
        })
      }
      return
    }
    // Without the extension, ask the server to sync the public platforms.
    const linked = (accounts.data?.data ?? []).filter(
      (account) => account.provider !== 'cses',
    )
    const results = await Promise.allSettled(
      linked.map((account) => requestProviderSync(account.provider)),
    )
    // The server runs queued syncs while this page keeps waking it.
    requestJobPump()
    await refreshData()
    const queued = results.filter(
      (item) => item.status === 'fulfilled' && item.value.data.accepted,
    ).length
    endPetActivity(
      'sync',
      queued > 0
        ? {
            message: 'Sync started. I’ll keep reading as new data arrives.',
            state: 'reading',
            ms: 5_000,
          }
        : petLines.syncCooldown,
    )
    setState({
      kind: 'done',
      nextAllowedAt: new Date(
        new Date().getTime() + MANUAL_SYNC_COOLDOWN_MS,
      ).toISOString(),
      message:
        queued > 0
          ? 'Sync started. New data appears within a minute or two.'
          : 'These platforms were synced recently.',
    })
  }

  const nextAllowedAt =
    state.kind === 'idle' || state.kind === 'done'
      ? state.nextAllowedAt
      : undefined
  const coolingDown =
    nextAllowedAt !== undefined && Date.parse(nextAllowedAt) > now

  return {
    state,
    extension,
    coolingDown,
    nextAllowedLabel:
      nextAllowedAt === undefined ? undefined : time(nextAllowedAt),
    sync,
  }
}
