import { ProviderSyncStatusResponseSchema } from '@algomemtor/shared-contracts'
import { describe, expect, it } from 'vitest'

import {
  activeProviderSyncStatus,
  providerSyncRefetchInterval,
} from './provider-sync-status'

const now = Date.parse('2026-09-21T09:00:00.000Z')

function status(
  jobStatus: 'queued' | 'running' | 'completed',
  runAfter: string,
) {
  return ProviderSyncStatusResponseSchema.parse({
    data: {
      provider: 'codeforces',
      state: {
        provider: 'codeforces',
        capability: 'linked_user_sync',
        status: 'complete',
        attempts: 1,
        completeness: 'complete',
        stale: false,
      },
      job: {
        id: '00000000-0000-4000-8000-000000000001',
        provider: 'codeforces',
        capability: 'linked_user_sync',
        status: jobStatus,
        queuedAt: '2026-09-21T08:59:00.000Z',
        runAfter,
        attempts: 0,
      },
    },
  })
}

describe('provider sync polling', () => {
  it('follows an immediate queued job even while the prior state is complete', () => {
    const response = status('queued', '2026-09-21T08:59:00.000Z')

    expect(activeProviderSyncStatus(response, now)).toBe('queued')
    expect(providerSyncRefetchInterval(response, now)).toBe(5_000)
  })

  it('waits until a future hourly job is due', () => {
    const response = status('queued', '2026-09-21T10:00:00.000Z')

    expect(activeProviderSyncStatus(response, now)).toBeNull()
    expect(providerSyncRefetchInterval(response, now)).toBe(60 * 60 * 1000)
  })

  it('stops polling after completion', () => {
    const response = status('completed', '2026-09-21T08:59:00.000Z')

    expect(activeProviderSyncStatus(response, now)).toBeNull()
    expect(providerSyncRefetchInterval(response, now)).toBe(false)
  })
})
