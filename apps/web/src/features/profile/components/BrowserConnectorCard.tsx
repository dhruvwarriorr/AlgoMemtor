import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, PlugZap, Trash2 } from 'lucide-react'

import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { Button } from '@/components/ui/button'
import { InstallExtensionSteps } from '@/features/connector/InstallExtensionSteps'
import { detectExtension } from '@/features/connector/extension-bridge'
import { pairExtension } from '@/features/connector/pair-extension'

import { providerAccountErrorMessage } from '../api/provider-accounts'
import {
  useConnectorTokenActions,
  useConnectorTokens,
} from '../hooks/useConnectorTokens'

type Phase =
  | { kind: 'detecting' }
  | { kind: 'missing' }
  | { kind: 'connecting' }
  | { kind: 'connected'; justNow: boolean }
  | { kind: 'error'; message: string }

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

// Detects the AlgoMemtor Connector in this browser and connects it to the
// signed-in learner automatically; the extension opens this section right
// after it is installed.
export function BrowserConnectorCard({ idPrefix }: { idPrefix: string }) {
  const queryClient = useQueryClient()
  const tokens = useConnectorTokens()
  const { revoke } = useConnectorTokenActions()
  const [phase, setPhase] = useState<Phase>({ kind: 'detecting' })
  const started = useRef(false)

  const connect = async () => {
    setPhase({ kind: 'connecting' })
    try {
      await pairExtension()
      setPhase({ kind: 'connected', justNow: true })
    } catch (error) {
      setPhase({ kind: 'error', message: providerAccountErrorMessage(error) })
    }
    await queryClient.invalidateQueries({ queryKey: ['connector-tokens'] })
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      const ready = await detectExtension()
      if (ready === null) setPhase({ kind: 'missing' })
      else if (ready.paired) setPhase({ kind: 'connected', justNow: false })
      else await connect()
    })()
    // Runs once per visit; `connect` only updates local state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section
      aria-labelledby={`${idPrefix}-connector-heading`}
      className="flex w-full max-w-4xl min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
      id="connector"
    >
      <div className="flex min-w-0 items-start gap-3">
        <PlugZap
          aria-hidden="true"
          className="mt-1 size-5 shrink-0 text-primary"
        />
        <div className="min-w-0">
          <h2
            className="text-xl font-semibold tracking-tight text-foreground"
            id={`${idPrefix}-connector-heading`}
          >
            Browser connector
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Syncs your full LeetCode history and your CSES progress, and
            verifies and syncs Codeforces and CodeChef, from your own signed-in
            browser. Passwords, cookies, and your code stay in the browser; only
            problems, verdicts, times, and languages are sent.
          </p>
        </div>
      </div>

      <div aria-live="polite" className="flex min-w-0 flex-col gap-3">
        {phase.kind === 'detecting' || phase.kind === 'connecting' ? (
          <p className="flex items-center gap-2 text-sm text-foreground">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            {phase.kind === 'detecting'
              ? 'Looking for the extension in this browser…'
              : 'Connecting the extension…'}
          </p>
        ) : null}

        {phase.kind === 'connected' ? (
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <CheckCircle2
                aria-hidden="true"
                className="size-4 shrink-0 text-go-foreground"
              />
              {phase.justNow
                ? 'Connected. The first sync has started; you will get a notification when it finishes.'
                : 'The extension in this browser is connected and syncs every hour.'}
            </p>
            {phase.justNow ? null : (
              <Button
                onClick={() => void connect()}
                size="sm"
                type="button"
                variant="ghost"
              >
                Reconnect
              </Button>
            )}
          </div>
        ) : null}

        {phase.kind === 'error' ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="text-sm text-destructive" role="alert">
              {phase.message}
            </p>
            <Button onClick={() => void connect()} size="sm" type="button">
              Try again
            </Button>
          </div>
        ) : null}

        {phase.kind === 'missing' ? (
          <>
            <p className="text-sm text-foreground">
              The extension is not installed or is turned off in this browser.
            </p>
            <InstallExtensionSteps />
          </>
        ) : null}
      </div>

      {revoke.error ? (
        <p className="text-xs text-destructive" role="alert">
          {providerAccountErrorMessage(revoke.error)}
        </p>
      ) : null}

      <h3 className="text-sm font-medium text-foreground">
        Connected browsers
      </h3>
      {tokens.isPending ? (
        <PageSkeleton label="Loading connected browsers" rows={1} />
      ) : tokens.isError ? (
        <ErrorState
          message={providerAccountErrorMessage(tokens.error)}
          onRetry={() => void tokens.refetch()}
          title="Connected browsers unavailable"
        />
      ) : tokens.data.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No connected browsers yet.
        </p>
      ) : (
        <ul className="flex min-w-0 flex-col divide-y divide-border rounded-lg border border-border">
          {tokens.data.data.map((token) => (
            <li
              className="flex min-w-0 items-center justify-between gap-3 px-3 py-2"
              key={token.id}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {token.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  Connected {formatDate(token.createdAt)}
                  {token.lastUsedAt === undefined
                    ? ' · not synced yet'
                    : ` · last sync ${formatDate(token.lastUsedAt)}`}
                </p>
              </div>
              <Button
                aria-label={`Disconnect ${token.label}`}
                disabled={revoke.isPending}
                onClick={() =>
                  void revoke.mutateAsync(token.id).catch(() => undefined)
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <Trash2 className="mr-1.5 size-3.5" />
                Disconnect
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
