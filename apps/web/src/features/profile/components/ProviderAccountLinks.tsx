import { useEffect, useState, type FormEvent } from 'react'
import {
  LinkProviderAccountRequestSchema,
  type LinkableProvider,
  type ProviderAccount,
} from '@algomemtor/shared-contracts'
import {
  Check,
  Copy,
  ExternalLink,
  MoreHorizontal,
  RefreshCw,
  ShieldCheck,
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
import { activeProviderSyncStatus } from '@/features/platform/provider-sync-status'

import { providerAccountErrorMessage } from '../api/provider-accounts'
import {
  useDisconnectProviderAccount,
  useLinkProviderAccount,
  useProviderAccounts,
  useProviderVerification,
} from '../hooks/useProviderAccounts'

const providers: readonly {
  provider: LinkableProvider
  label: string
  example: string
}[] = [
  { provider: 'codeforces', label: 'Codeforces', example: 'tourist' },
  { provider: 'codechef', label: 'CodeChef', example: 'your_username' },
  { provider: 'leetcode', label: 'LeetCode', example: 'your-username' },
  { provider: 'cses', label: 'CSES', example: '' },
]

const inputClassName =
  'h-9 w-full min-w-0 rounded-md border border-input bg-background transition-[border-color,box-shadow] hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--input))] px-3 text-sm text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-60'

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

const verificationSteps: Record<LinkableProvider, string> = {
  codeforces:
    'Add it to your first name, last name, or organization in Codeforces Settings → Social, then save.',
  codechef:
    'Add it to your name on your CodeChef profile (Edit profile), then save.',
  leetcode:
    'Add it to your Summary or Name in LeetCode profile settings, then save.',
  // CSES links only through the browser connector, which verifies itself.
  cses: '',
}

function ProviderVerification({
  account,
  label,
  provider,
}: {
  account: ProviderAccount
  label: string
  provider: LinkableProvider
}) {
  const { notify } = useNotification()
  const { start, check } = useProviderVerification()
  const [copied, setCopied] = useState(false)
  // Ticks so the countdown stays current and an expired code is hidden.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const challenge = account.verificationChallenge
  const minutesLeft =
    challenge === undefined
      ? 0
      : Math.ceil((new Date(challenge.expiresAt).getTime() - now) / 60000)
  const open = challenge !== undefined && minutesLeft > 0
  const error = start.error ?? check.error

  async function handleStart() {
    check.reset()
    try {
      await start.mutateAsync(provider)
    } catch {
      // Error rendered below.
    }
  }

  async function handleCheck() {
    try {
      await check.mutateAsync(provider)
      notify({
        title: `${label} handle verified`,
        description: 'You can remove the code from your profile now.',
        tone: 'success',
      })
    } catch {
      // Error rendered below.
    }
  }

  async function handleCopy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  if (!open) {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <button
          className="self-start text-xs font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          disabled={start.isPending}
          onClick={() => void handleStart()}
          type="button"
        >
          {start.isPending ? 'Preparing code…' : 'Verify ownership'}
        </button>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {providerAccountErrorMessage(error)}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">
        Prove this handle is yours with a one-time code.{' '}
        {verificationSteps[provider]}
      </p>
      <div className="flex min-w-0 items-center gap-2">
        <code className="min-w-0 rounded bg-background px-2 py-1 font-mono text-sm tracking-wide text-foreground">
          {challenge.code}
        </code>
        <button
          aria-label={copied ? 'Code copied' : 'Copy verification code'}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => void handleCopy(challenge.code)}
          type="button"
        >
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          Expires in {minutesLeft} min
        </span>
        <Button
          disabled={check.isPending}
          onClick={() => void handleCheck()}
          size="sm"
          type="button"
          variant="outline"
        >
          {check.isPending ? 'Checking…' : 'Check now'}
        </Button>
      </div>
      {error ? (
        <p aria-live="polite" className="text-xs text-destructive" role="alert">
          {providerAccountErrorMessage(error)}
        </p>
      ) : null}
    </div>
  )
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
  const activeSync = activeProviderSyncStatus(providerSyncStatus.data)
  const initialSyncPending = activeSync !== null
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
          {account.verification === 'verified' ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-go-soft px-2.5 py-0.5 text-xs font-medium text-go-foreground">
              <ShieldCheck aria-hidden="true" className="size-3.5" />
              Verified
            </span>
          ) : (
            <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              Connected
            </span>
          )}
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

      {account.verification === 'verified' ? null : (
        <ProviderVerification
          account={account}
          label={label}
          provider={provider}
        />
      )}

      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          {solved !== null ? (
            <p className="text-lg font-semibold tracking-tight text-foreground">
              {solved}
            </p>
          ) : (
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {activeSync === 'queued'
                ? 'First sync queued…'
                : activeSync === 'running'
                  ? 'Fetching profile data…'
                  : 'Not synced yet'}
            </p>
          )}
          {lastSynced !== null ? (
            <p className="text-xs text-muted-foreground">Synced {lastSynced}</p>
          ) : null}
        </div>
        {provider === 'cses' || account.connectorSyncedAt !== undefined ? (
          <span className="text-right text-xs text-muted-foreground">
            Synced by the browser connector
            {account.connectorSyncedAt === undefined
              ? null
              : ` · ${formatRelativeTime(account.connectorSyncedAt)}`}
          </span>
        ) : (
          <Button
            disabled={
              isBusy || initialSyncPending || account.syncEnabled === false
            }
            onClick={() => void handleSync()}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCw
              className={`mr-1.5 size-3.5 ${providerSync.isPending || initialSyncPending ? 'animate-spin' : ''}`}
            />
            {providerSync.isPending || initialSyncPending ? 'Syncing…' : 'Sync'}
          </Button>
        )}
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
        description: 'Public handle saved. The first sync is queued now.',
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
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {providers.map(({ example, label, provider }) => {
              const account = accountsQuery.data.data.find(
                (candidate) => candidate.provider === provider,
              )

              if (account === undefined && provider === 'cses') {
                return (
                  <article
                    className="flex min-w-0 flex-col gap-2 rounded-lg border border-dashed border-border bg-background p-4"
                    key={provider}
                  >
                    <h3 className="font-semibold text-foreground">{label}</h3>
                    <p className="text-sm text-muted-foreground">
                      CSES shows your progress only when you are signed in.
                      Connect it with the browser connector below.
                    </p>
                  </article>
                )
              }

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
