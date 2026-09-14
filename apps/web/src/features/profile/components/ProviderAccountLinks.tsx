import { useState, type FormEvent } from 'react'
import {
  LinkProviderAccountRequestSchema,
  type LinkableProvider,
  type ProviderAccount,
} from '@algomemtor/shared-contracts'
import { ExternalLink } from 'lucide-react'

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
  'h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-60'

const statsSourceLabels = {
  codeforces_api: 'Codeforces public API',
  codechef_public_profile_html: 'CodeChef public profile page',
  leetcode_website_graphql: 'LeetCode public website data',
} as const

const statsErrorMessages = {
  PROVIDER_ACCOUNT_NOT_FOUND: 'No public profile was found for this handle.',
  PROVIDER_TIMEOUT: 'The provider took too long to respond.',
  PROVIDER_RATE_LIMITED: 'The provider is temporarily rate limiting requests.',
  PROVIDER_BLOCKED:
    'The provider blocked this public request; try again later.',
  PROVIDER_UNAVAILABLE: 'The provider is temporarily unavailable.',
  PROVIDER_INVALID_RESPONSE:
    'The provider changed or returned an unexpected profile response.',
} as const

function PublicStatsSummary({ account }: { account: ProviderAccount }) {
  const stats = account.publicStats

  if (stats.status === 'not_synced') {
    return (
      <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
        Public solved count has not been fetched.
      </p>
    )
  }

  if (stats.status === 'unavailable') {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
        <p className="font-medium text-foreground">Solved count unavailable</p>
        <p className="mt-1 text-muted-foreground">
          {statsErrorMessages[stats.errorCode]}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-md bg-muted px-3 py-2 text-sm">
      <p className="font-medium text-foreground">
        {stats.complete ? '' : 'At least '}
        {stats.solvedCount.toLocaleString()} problems solved
      </p>
      <p className="mt-1 text-muted-foreground">
        From {statsSourceLabels[stats.source]}. Refreshed{' '}
        <time dateTime={stats.fetchedAt}>
          {new Date(stats.fetchedAt).toLocaleString()}
        </time>
        .
      </p>
      {!stats.complete ? (
        <p className="mt-1 text-muted-foreground">
          The provider returned a bounded observation, so the true total may be
          higher.
        </p>
      ) : null}
      {stats.stale ? (
        <p className="mt-1 text-destructive">
          The latest refresh failed. This is the last successful count.
        </p>
      ) : null}
    </div>
  )
}

function ProviderAccountCard({
  account,
  idPrefix,
  label,
  example,
  provider,
}: {
  account?: ProviderAccount
  idPrefix: string
  label: string
  example: string
  provider: LinkableProvider
}) {
  const { notify } = useNotification()
  const linkAccount = useLinkProviderAccount()
  const disconnectAccount = useDisconnectProviderAccount()
  const deleteHistory = useDeleteProviderHistory()
  const providerSync = useProviderSync(provider)
  const providerSyncStatus = useProviderSyncStatus(
    provider,
    account !== undefined,
  )
  const [handle, setHandle] = useState(account?.handle ?? '')
  const [consent, setConsent] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const isBusy =
    linkAccount.isPending ||
    disconnectAccount.isPending ||
    providerSync.isPending ||
    deleteHistory.isPending
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
          : 'Confirm consent before saving this public handle.',
      )
      return
    }

    setValidationError(null)

    try {
      await linkAccount.mutateAsync({ provider, account: result.data })
      setConsent(false)
      notify({
        title: `${label} profile saved`,
        description: 'This is a public-handle link, not verified solve access.',
        tone: 'success',
      })
    } catch {
      // The mutation error is rendered below with a safe API message.
    }
  }

  async function handleDisconnect() {
    try {
      await disconnectAccount.mutateAsync(provider)
      setHandle('')
      setConsent(false)
      notify({
        title: `${label} profile disconnected`,
        description: 'The saved public handle was removed.',
        tone: 'success',
      })
    } catch {
      // The mutation error is rendered below with a safe API message.
    }
  }

  async function handleStatsRefresh() {
    try {
      await providerSync.mutateAsync()
      notify({
        title: `${label} solved-count sync queued`,
        description:
          'The provider-reported total will refresh with the profile and activity data in the background.',
        tone: 'success',
      })
    } catch {
      // The mutation error and persisted provider state are rendered below.
    }
  }

  async function handleProviderSync() {
    try {
      await providerSync.mutateAsync()
      notify({
        title: `${label} sync queued`,
        description:
          'Profile, activity, rating, and contest data will refresh in the background.',
        tone: 'success',
      })
    } catch {
      // The mutation error is rendered below with a safe API message.
    }
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
        description:
          'Stored profile snapshots, activity, ratings, and contest observations were removed.',
        tone: 'success',
      })
    } catch {
      // The mutation error is rendered below with a safe API message.
    }
  }

  const mutationError =
    linkAccount.error ??
    disconnectAccount.error ??
    providerSync.error ??
    deleteHistory.error

  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-background p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium text-foreground">{label}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {account ? `Saved handle: ${account.handle}` : 'No handle saved'}
          </p>
        </div>
        {account ? (
          <a
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            href={account.profileUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            Open profile
            <ExternalLink aria-hidden="true" className="size-4" />
          </a>
        ) : null}
      </div>

      {account ? <PublicStatsSummary account={account} /> : null}

      {account ? (
        <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
          <div>
            <p className="font-medium text-foreground">
              Automatic provider sync
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              AlgoMemtor refreshes this public profile every six hours after
              linking, with a short jitter. Manual refreshes are queued and
              limited to one request every fifteen minutes.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Sync status:{' '}
            {providerSyncStatus.data?.data.state.status ?? 'Not scheduled'}
            {providerSyncStatus.data?.data.state.lastSucceededAt
              ? ` · last completed ${new Date(providerSyncStatus.data.data.state.lastSucceededAt).toLocaleString()}`
              : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isBusy || account.syncEnabled === false}
              onClick={() => void handleProviderSync()}
              type="button"
              variant="outline"
            >
              {providerSync.isPending ? 'Queueing sync…' : 'Sync provider data'}
            </Button>
            <Button
              disabled={isBusy}
              onClick={() => void handleDeleteHistory()}
              type="button"
              variant="destructive"
            >
              {deleteHistory.isPending
                ? 'Deleting history…'
                : 'Delete provider history'}
            </Button>
          </div>
          {providerSyncStatus.data?.data.state.lastErrorCode ? (
            <p className="text-sm text-destructive">
              Last sync issue:{' '}
              {providerSyncStatus.data.data.state.lastErrorCode}. Cached
              observations remain available when possible.
            </p>
          ) : null}
        </div>
      ) : null}

      <form
        className="space-y-3"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className="flex min-w-0 flex-col gap-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor={fieldId}
          >
            Public {label} handle
          </label>
          <input
            aria-describedby={`${fieldId}-help${
              validationError ? ` ${fieldId}-error` : ''
            }`}
            aria-invalid={Boolean(validationError)}
            autoCapitalize="none"
            autoComplete="off"
            className={inputClassName}
            disabled={isBusy}
            id={fieldId}
            maxLength={64}
            onChange={(event) => {
              setHandle(event.currentTarget.value)
              setValidationError(null)
              linkAccount.reset()
              providerSync.reset()
            }}
            placeholder={example}
            spellCheck={false}
            type="text"
            value={handle}
          />
          <p className="text-sm text-muted-foreground" id={`${fieldId}-help`}>
            Enter only the username, not a URL or password.
          </p>
        </div>

        <label
          className="flex min-w-0 items-start gap-3 text-sm text-foreground"
          htmlFor={consentId}
        >
          <input
            checked={consent}
            className="mt-0.5 size-4 shrink-0 rounded accent-primary"
            disabled={isBusy}
            id={consentId}
            onChange={(event) => {
              setConsent(event.currentTarget.checked)
              setValidationError(null)
            }}
            type="checkbox"
          />
          <span>
            I consent to AlgoMemtor storing this public profile reference and
            synchronizing the provider&apos;s public profile data. No password,
            API key, private activity, or submission source code will be
            collected.
          </span>
        </label>

        {validationError ? (
          <p
            className="text-sm text-destructive"
            id={`${fieldId}-error`}
            role="alert"
          >
            {validationError}
          </p>
        ) : null}

        {mutationError ? (
          <p className="text-sm text-destructive" role="alert">
            {providerAccountErrorMessage(mutationError)}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button disabled={isBusy} type="submit">
            {linkAccount.isPending
              ? 'Saving link…'
              : account
                ? 'Update handle'
                : 'Save account link'}
          </Button>
          {account ? (
            <Button
              disabled={isBusy}
              onClick={() => void handleDisconnect()}
              type="button"
              variant="outline"
            >
              {disconnectAccount.isPending ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          ) : null}
        </div>

        {account ? (
          <div className="space-y-3 border-t border-border pt-3">
            <p className="text-sm text-muted-foreground">
              Public-sync consent was recorded when this handle was linked. No
              password, cookie, source code, or private data is requested.
            </p>
            <Button
              disabled={isBusy}
              onClick={() => void handleStatsRefresh()}
              type="button"
              variant="outline"
            >
              {providerSync.isPending
                ? 'Queueing solved-count sync…'
                : account.publicStats.status === 'not_synced'
                  ? 'Queue solved-count sync'
                  : 'Refresh solved count'}
            </Button>
          </div>
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
      className="flex w-full max-w-4xl min-w-0 flex-col gap-5 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <div>
        <h2
          className="text-xl font-semibold tracking-tight text-foreground"
          id={`${idPrefix}-provider-links-heading`}
        >
          Optional provider profile links
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Save a public Codeforces, CodeChef, or LeetCode handle for convenient
          profile access. Linking records long-lived consent for public profile
          synchronization every six hours plus manual refresh. This does not
          verify account ownership or individual solves. You can skip or
          disconnect at any time; disconnecting keeps history until you delete
          it explicitly.
        </p>
      </div>

      {accountsQuery.isPending ? (
        <PageSkeleton label="Loading provider profile links" rows={3} />
      ) : accountsQuery.isError ? (
        <ErrorState
          message={providerAccountErrorMessage(accountsQuery.error)}
          onRetry={() => void accountsQuery.refetch()}
          title="Provider profile links unavailable"
        />
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-3">
          {providers.map(({ example, label, provider }) => {
            const account = accountsQuery.data.data.find(
              (candidate) => candidate.provider === provider,
            )

            return (
              <ProviderAccountCard
                account={account}
                example={example}
                idPrefix={idPrefix}
                key={`${provider}-${account?.updatedAt ?? 'new'}`}
                label={label}
                provider={provider}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}
