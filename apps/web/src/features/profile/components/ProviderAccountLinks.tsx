import { useState, type FormEvent } from 'react'
import {
  LinkProviderAccountRequestSchema,
  type LinkableProvider,
  type ProviderAccount,
} from '@algomemtor/shared-contracts'
import {
  ExternalLink,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Unplug,
} from 'lucide-react'

import { useNotification } from '@/app/useNotification'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { Button } from '@/components/ui/button'
import {
  useDeleteProviderHistory,
  useProviderSync,
  useProviderSyncStatus,
} from '@/features/platform/hooks'

import { providerAccountErrorMessage } from '../api/provider-accounts'
import {
  useDisconnectProviderAccount,
  useLinkProviderAccount,
  useProviderAccounts,
} from '../hooks/useProviderAccounts'

const providers: readonly {
  provider: LinkableProvider
  label: string
  example: string
}[] = [
  { provider: 'codeforces', label: 'Codeforces', example: 'tourist' },
  { provider: 'codechef', label: 'CodeChef', example: 'your_username' },
  { provider: 'leetcode', label: 'LeetCode', example: 'your-username' },
]

const inputClassName =
  'h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-60'

function formatRelativeTime(dateString: string) {
  const seconds = Math.floor(
    (Date.now() - new Date(dateString).getTime()) / 1000,
  )
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function solvedLabel(account: ProviderAccount) {
  const stats = account.publicStats
  if (stats.status === 'not_synced') return null
  if (stats.status === 'unavailable') return null
  return `${stats.complete ? '' : '≥'}${stats.solvedCount.toLocaleString()} solved`
}

function LinkedProviderCard({
  account,
  label,
  provider,
}: {
  account: ProviderAccount
  label: string
  provider: LinkableProvider
}) {
  const { notify } = useNotification()
  const disconnectAccount = useDisconnectProviderAccount()
  const deleteHistory = useDeleteProviderHistory()
  const providerSync = useProviderSync(provider)
  const providerSyncStatus = useProviderSyncStatus(provider, true)
  const [menuOpen, setMenuOpen] = useState(false)
  const isBusy =
    disconnectAccount.isPending ||
    providerSync.isPending ||
    deleteHistory.isPending

  const syncState = providerSyncStatus.data?.data.state
  const lastSynced = syncState?.lastSucceededAt
    ? formatRelativeTime(syncState.lastSucceededAt)
    : null
  const solved = solvedLabel(account)
  const hasError =
    syncState?.lastErrorCode !== undefined && syncState?.lastErrorCode !== null

  async function handleSync() {
    try {
      const result = await providerSync.mutateAsync()
      notify({
        title: result.data.accepted
          ? `${label} sync queued`
          : `${label} sync recently requested`,
        description: result.data.accepted
          ? 'Data will refresh in the background.'
          : 'A new manual sync will be available after the cooldown.',
        tone: result.data.accepted ? 'success' : 'info',
      })
    } catch {
      // Error rendered via mutation state.
    }
  }

  async function handleDisconnect() {
    try {
      await disconnectAccount.mutateAsync(provider)
      notify({
        title: `${label} disconnected`,
        description: 'Handle removed.',
        tone: 'success',
      })
    } catch {
      // Error rendered via mutation state.
    }
    setMenuOpen(false)
  }

  async function handleDeleteHistory() {
    if (
      !window.confirm(`Delete all stored ${label} history for this account?`)
    ) {
      return
    }
    try {
      await deleteHistory.mutateAsync(provider)
      notify({
        title: `${label} history deleted`,
        description: 'All stored observations removed.',
        tone: 'success',
      })
    } catch {
      // Error rendered via mutation state.
    }
    setMenuOpen(false)
  }

  const mutationError =
    disconnectAccount.error ?? providerSync.error ?? deleteHistory.error

  return (
    <article className="relative flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-background p-4">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="font-semibold text-foreground">{label}</h3>
          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
            Connected
          </span>
        </div>
        <div className="relative">
          <button
            aria-label={`${label} options`}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setMenuOpen(!menuOpen)}
            type="button"
          >
            <MoreHorizontal className="size-4" />
          </button>
          {menuOpen ? (
            <>
              <button
                aria-label={`Close ${label} options`}
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
                type="button"
              />
              <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-border bg-card py-1 shadow-lg">
                <a
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                  href={account.profileUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <ExternalLink className="size-3.5" />
                  View profile
                </a>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted disabled:opacity-50"
                  disabled={isBusy}
                  onClick={() => void handleDisconnect()}
                  type="button"
                >
                  <Unplug className="size-3.5" />
                  {disconnectAccount.isPending
                    ? 'Disconnecting…'
                    : 'Disconnect'}
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-muted disabled:opacity-50"
                  disabled={isBusy}
                  onClick={() => void handleDeleteHistory()}
                  type="button"
                >
                  <Trash2 className="size-3.5" />
                  {deleteHistory.isPending ? 'Deleting…' : 'Delete history'}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{account.handle}</p>

      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          {solved !== null ? (
            <p className="text-lg font-semibold tracking-tight text-foreground">
              {solved}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Not synced yet</p>
          )}
          {lastSynced !== null ? (
            <p className="text-xs text-muted-foreground">Synced {lastSynced}</p>
          ) : null}
        </div>
        <Button
          disabled={isBusy || account.syncEnabled === false}
          onClick={() => void handleSync()}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshCw
            className={`mr-1.5 size-3.5 ${providerSync.isPending ? 'animate-spin' : ''}`}
          />
          {providerSync.isPending ? 'Syncing…' : 'Sync'}
        </Button>
      </div>

      {hasError ? (
        <p className="text-xs text-destructive">
          Sync issue — will retry automatically.
        </p>
      ) : null}

      {mutationError ? (
        <p className="text-xs text-destructive" role="alert">
          {providerAccountErrorMessage(mutationError)}
        </p>
      ) : null}
    </article>
  )
}

function UnlinkedProviderCard({
  idPrefix,
  label,
  example,
  provider,
}: {
  idPrefix: string
  label: string
  example: string
  provider: LinkableProvider
}) {
  const { notify } = useNotification()
  const linkAccount = useLinkProviderAccount()
  const [handle, setHandle] = useState('')
  const [consent, setConsent] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const fieldId = `${idPrefix}-${provider}-handle`
  const consentId = `${idPrefix}-${provider}-consent`

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = LinkProviderAccountRequestSchema.safeParse({
      handle,
      consent,
    })
    if (!result.success) {
      setValidationError(
        consent
          ? (result.error.issues[0]?.message ?? 'Enter a valid public handle.')
          : 'Check consent to continue.',
      )
      return
    }
    setValidationError(null)
    try {
      await linkAccount.mutateAsync({ provider, account: result.data })
      setConsent(false)
      notify({
        title: `${label} linked`,
        description: 'Public handle saved. Sync will start shortly.',
        tone: 'success',
      })
    } catch {
      // Error rendered below.
    }
  }

  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-lg border border-dashed border-border bg-background p-4">
      <h3 className="font-semibold text-foreground">{label}</h3>
      <form
        className="flex min-w-0 flex-col gap-2"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className="flex min-w-0 gap-2">
          <input
            aria-invalid={Boolean(validationError)}
            autoCapitalize="none"
            autoComplete="off"
            className={inputClassName}
            disabled={linkAccount.isPending}
            id={fieldId}
            maxLength={64}
            onChange={(event) => {
              setHandle(event.currentTarget.value)
              setValidationError(null)
              linkAccount.reset()
            }}
            placeholder={example}
            spellCheck={false}
            type="text"
            value={handle}
          />
          <Button disabled={linkAccount.isPending} size="sm" type="submit">
            {linkAccount.isPending ? 'Linking…' : 'Link'}
          </Button>
        </div>
        <label
          className="flex min-w-0 items-start gap-2 text-xs text-muted-foreground"
          htmlFor={consentId}
        >
          <input
            checked={consent}
            className="mt-0.5 size-3.5 shrink-0 rounded accent-primary"
            disabled={linkAccount.isPending}
            id={consentId}
            onChange={(event) => {
              setConsent(event.currentTarget.checked)
              setValidationError(null)
            }}
            type="checkbox"
          />
          <span>
            I consent to syncing public profile data. No passwords or private
            data collected.
          </span>
        </label>
        {validationError ? (
          <p className="text-xs text-destructive" role="alert">
            {validationError}
          </p>
        ) : null}
        {linkAccount.error ? (
          <p className="text-xs text-destructive" role="alert">
            {providerAccountErrorMessage(linkAccount.error)}
          </p>
        ) : null}
      </form>
    </article>
  )
}

export function ProviderAccountLinks({ idPrefix }: { idPrefix: string }) {
  const accountsQuery = useProviderAccounts()

  return (
    <section
      aria-labelledby={`${idPrefix}-provider-links-heading`}
      className="flex w-full max-w-4xl min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <h2
        className="text-xl font-semibold tracking-tight text-foreground"
        id={`${idPrefix}-provider-links-heading`}
      >
        Connected platforms
      </h2>

      {accountsQuery.isPending ? (
        <PageSkeleton label="Loading provider links" rows={3} />
      ) : accountsQuery.isError ? (
        <ErrorState
          message={providerAccountErrorMessage(accountsQuery.error)}
          onRetry={() => void accountsQuery.refetch()}
          title="Provider links unavailable"
        />
      ) : (
        <>
          <div className="grid min-w-0 gap-3 lg:grid-cols-3">
            {providers.map(({ example, label, provider }) => {
              const account = accountsQuery.data.data.find(
                (candidate) => candidate.provider === provider,
              )

              return account ? (
                <LinkedProviderCard
                  account={account}
                  key={`${provider}-${account.updatedAt}`}
                  label={label}
                  provider={provider}
                />
              ) : (
                <UnlinkedProviderCard
                  example={example}
                  idPrefix={idPrefix}
                  key={provider}
                  label={label}
                  provider={provider}
                />
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Auto-syncs hourly. Manual sync limited to once per 15 min.
            Disconnect or delete history via the ⋯ menu.
          </p>
        </>
      )}
    </section>
  )
}
