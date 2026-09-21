import type { ProviderSyncStatusResponse } from '@algomemtor/shared-contracts'

export function activeProviderSyncStatus(
  response: ProviderSyncStatusResponse | undefined,
  now = Date.now(),
): 'queued' | 'running' | null {
  const job = response?.data.job
  if (job?.status === 'running') return 'running'
  if (job?.status === 'queued') {
    return new Date(job.runAfter).getTime() <= now ? 'queued' : null
  }
  const status = response?.data.state.status
  return status === 'queued' || status === 'running' ? status : null
}

export function providerSyncRefetchInterval(
  response: ProviderSyncStatusResponse | undefined,
  now = Date.now(),
): number | false {
  const active = activeProviderSyncStatus(response, now)
  if (active !== null) return 5_000
  const job = response?.data.job
  if (job?.status !== 'queued') return false
  const delay = new Date(job.runAfter).getTime() - now
  return Number.isFinite(delay) ? Math.max(5_000, delay) : false
}
