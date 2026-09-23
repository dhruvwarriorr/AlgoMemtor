import { RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { useSyncPlatforms } from './useSyncPlatforms'

// One button that syncs every linked platform, through the browser extension
// when it is connected. Manual syncs are limited to one per 15 minutes.
export function SyncPlatformsButton({
  compact = false,
}: {
  compact?: boolean
}) {
  const { state, extension, coolingDown, nextAllowedLabel, sync } =
    useSyncPlatforms()
  const syncing = state.kind === 'syncing'
  const status =
    state.kind === 'syncing'
      ? extension === 'paired'
        ? 'Syncing through the browser extension…'
        : 'Starting sync…'
      : state.kind === 'error'
        ? state.message
        : state.kind === 'done'
          ? state.message
          : coolingDown && nextAllowedLabel !== undefined
            ? `Synced recently. Next sync available at ${nextAllowedLabel}.`
            : undefined

  return (
    <div
      className={
        compact
          ? 'flex min-w-0 items-center gap-2'
          : 'flex min-w-0 flex-wrap items-center gap-3'
      }
    >
      <Button
        disabled={syncing || coolingDown || extension === 'unknown'}
        onClick={() => void sync()}
        size="sm"
        title={
          coolingDown && nextAllowedLabel !== undefined
            ? `Next sync available at ${nextAllowedLabel}`
            : 'Sync all linked platforms now'
        }
        type="button"
        variant="outline"
      >
        <RefreshCw
          aria-hidden="true"
          className={`mr-1.5 size-3.5 ${syncing ? 'animate-spin' : ''}`}
        />
        {syncing ? 'Syncing…' : 'Sync platforms'}
      </Button>
      {status === undefined ? null : (
        <p
          aria-live="polite"
          className={`min-w-0 text-xs ${
            state.kind === 'error'
              ? 'text-destructive'
              : 'text-muted-foreground'
          } ${compact ? 'sr-only sm:not-sr-only sm:max-w-56' : ''}`}
        >
          {status}
        </p>
      )}
    </div>
  )
}
