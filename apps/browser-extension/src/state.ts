import { DEFAULT_API_URL } from './config.js'
import type { SyncProvider } from './types.js'
import type { CsesTaskStatus } from './cses.js'

export type LeetCodeBackfill =
  | { phase: 'not_started' }
  | { phase: 'running'; offset: number; lastKey: string }
  | { phase: 'done' }

export type SyncOutcome = {
  status: 'synced' | 'signed_out' | 'rate_limited' | 'unpaired' | 'error'
  message: string
  at: string
  handle?: string
  uploadedSubmissions: number
  historyComplete: boolean
  // True when more history is waiting; the connector runs again soon.
  continueSoon: boolean
}

export type ConnectorState = {
  leetcode: { handle?: string; newestId?: number; backfill: LeetCodeBackfill }
  cses: { userId?: string; fetched: Record<string, CsesTaskStatus> }
  outcomes: Partial<Record<SyncProvider, SyncOutcome>>
}

export type ConnectorSettings = {
  apiUrl: string
  secret?: string
  tokenLabel?: string
  providers: Record<SyncProvider, boolean>
  intervalMinutes: number
  // Show a browser notification when a sync finishes.
  notify: boolean
  lastRunAt?: string
  // Manual syncs (popup or website button) are limited to one per 15 minutes.
  lastManualSyncAt?: string
}

export const DEFAULT_SETTINGS: ConnectorSettings = {
  apiUrl: DEFAULT_API_URL,
  providers: { leetcode: true, cses: true, codeforces: true, codechef: true },
  intervalMinutes: 60,
  notify: true,
}

export const emptyState = (): ConnectorState => ({
  leetcode: { backfill: { phase: 'not_started' } },
  cses: { fetched: {} },
  outcomes: {},
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// Storage can hold data from an older version; anything unexpected restarts
// that provider's sync, which only re-uploads (never loses) history.
export const parseState = (value: unknown): ConnectorState => {
  const state = emptyState()
  if (!isRecord(value)) return state
  const leetcode = value.leetcode
  if (isRecord(leetcode)) {
    if (typeof leetcode.handle === 'string')
      state.leetcode.handle = leetcode.handle
    if (typeof leetcode.newestId === 'number')
      state.leetcode.newestId = leetcode.newestId
    const backfill = leetcode.backfill
    if (isRecord(backfill)) {
      if (backfill.phase === 'done') state.leetcode.backfill = { phase: 'done' }
      if (
        backfill.phase === 'running' &&
        typeof backfill.offset === 'number' &&
        typeof backfill.lastKey === 'string'
      ) {
        state.leetcode.backfill = {
          phase: 'running',
          offset: backfill.offset,
          lastKey: backfill.lastKey,
        }
      }
    }
  }
  const cses = value.cses
  if (isRecord(cses)) {
    if (typeof cses.userId === 'string') state.cses.userId = cses.userId
    if (isRecord(cses.fetched)) {
      for (const [id, status] of Object.entries(cses.fetched)) {
        if (status === 'solved' || status === 'attempted')
          state.cses.fetched[id] = status
      }
    }
  }
  if (isRecord(value.outcomes)) {
    state.outcomes = value.outcomes as ConnectorState['outcomes']
  }
  return state
}

export const parseSettings = (value: unknown): ConnectorSettings => {
  if (!isRecord(value)) return { ...DEFAULT_SETTINGS }
  const providers = isRecord(value.providers) ? value.providers : {}
  const interval = Number(value.intervalMinutes)
  return {
    apiUrl:
      typeof value.apiUrl === 'string' ? value.apiUrl : DEFAULT_SETTINGS.apiUrl,
    ...(typeof value.secret === 'string' ? { secret: value.secret } : {}),
    ...(typeof value.tokenLabel === 'string'
      ? { tokenLabel: value.tokenLabel }
      : {}),
    providers: {
      leetcode: providers.leetcode !== false,
      cses: providers.cses !== false,
      codeforces: providers.codeforces !== false,
      codechef: providers.codechef !== false,
    },
    intervalMinutes:
      Number.isFinite(interval) && interval >= 15 && interval <= 1440
        ? Math.round(interval)
        : DEFAULT_SETTINGS.intervalMinutes,
    notify: value.notify !== false,
    ...(typeof value.lastRunAt === 'string'
      ? { lastRunAt: value.lastRunAt }
      : {}),
    ...(typeof value.lastManualSyncAt === 'string'
      ? { lastManualSyncAt: value.lastManualSyncAt }
      : {}),
  }
}
