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

import { providerAccountErrorMessage } from '../api/provider-accounts'
import {
  useDisconnectProviderAccount,
  useLinkProviderAccount,
  useProviderAccounts,
  useRefreshProviderPublicStats,
  useSetProviderActivityConsent,
  useSyncProviderActivity,
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
          Codeforces returned the most recent submission window, so the true
          total may be higher.
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
  const refreshStats = useRefreshProviderPublicStats()
  const setActivityConsent = useSetProviderActivityConsent()
  const syncActivity = useSyncProviderActivity()
  const [handle, setHandle] = useState(account?.handle ?? '')
  const [consent, setConsent] = useState(false)
  const [statsConsent, setStatsConsent] = useState(false)
  const [activityConsent, setActivityConsentChecked] = useState(
    account?.verifiedActivity.enabled ?? false,
  )
  const [validationError, setValidationError] = useState<string | null>(null)
  const isBusy =
    linkAccount.isPending ||
    disconnectAccount.isPending ||
    refreshStats.isPending ||
    setActivityConsent.isPending ||
    syncActivity.isPending
  const fieldId = `${idPrefix}-${provider}-handle`
  const consentId = `${idPrefix}-${provider}-consent`
  const statsConsentId = `${idPrefix}-${provider}-stats-consent`

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
      setStatsConsent(false)
      setActivityConsentChecked(false)
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
    if (!statsConsent) {
      return
    }

    try {
      await refreshStats.mutateAsync(provider)
      setStatsConsent(false)
      notify({
        title: `${label} solved count refreshed`,
        description: 'The provider-reported public total was saved.',
        tone: 'success',
      })
    } catch {
      // The mutation error and persisted provider state are rendered below.
    }
  }

  async function handleActivityConsent(enabled: boolean) {
    try {
      await setActivityConsent.mutateAsync({ provider, enabled })
      setActivityConsentChecked(enabled)
      if (!enabled) {
        notify({
          title: `${label} activity consent removed`,
          description: 'Provider-derived activity evidence was removed.',
          tone: 'success',
        })
      }
    } catch {
      setActivityConsentChecked(account?.verifiedActivity.enabled ?? false)
    }
  }

  async function handleActivitySync() {
    try {
      const result = await syncActivity.mutateAsync(provider)
      notify({
        title: `${label} activity synchronized`,
        description: `${result.data.confirmedSolved} new accepted problem${result.data.confirmedSolved === 1 ? '' : 's'} recorded.`,
        tone: 'success',
      })
    } catch {
      // The mutation error and persisted state are rendered below.
    }
  }

  const mutationError =
    linkAccount.error ??
    disconnectAccount.error ??
    refreshStats.error ??
    setActivityConsent.error ??
    syncActivity.error

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

      {account && provider === 'codeforces' ? (
        <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
          <label
            className="flex min-w-0 items-start gap-3 text-sm text-foreground"
            htmlFor={`${idPrefix}-${provider}-activity-consent`}
          >
            <input
              checked={activityConsent}
              className="mt-0.5 size-4 shrink-0 rounded accent-primary"
              disabled={isBusy}
              id={`${idPrefix}-${provider}-activity-consent`}
              onChange={(event) => {
                const enabled = event.currentTarget.checked
                setActivityConsentChecked(enabled)
                void handleActivityConsent(enabled)
              }}
              type="checkbox"
            />
            <span>
              I consent to a manual Codeforces public-activity sync. This reads
              accepted submissions from the linked public handle; it does not
              prove that the handle belongs to me and never collects source
              code.
            </span>
          </label>
          <p className="text-sm text-muted-foreground">
            Activity status:{' '}
            {account.verifiedActivity.status === 'not_enabled'
              ? 'Not enabled'
              : account.verifiedActivity.status === 'not_synced'
                ? 'Not synchronized'
                : account.verifiedActivity.status === 'partial'
                  ? 'Partial recent-submission window'
                  : account.verifiedActivity.status === 'error'
                    ? 'Last sync failed'
                    : 'Synchronized'}
          </p>
          <Button
            disabled={isBusy || !activityConsent}
            onClick={() => void handleActivitySync()}
            type="button"
            variant="outline"
          >
            {syncActivity.isPending ? 'Syncing activity…' : 'Sync activity'}
          </Button>
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
              refreshStats.reset()
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
            I consent to AlgoMemtor storing this public profile reference. No
            password, API key, private activity, or submission source code will
            be collected.
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
            <label
              className="flex min-w-0 items-start gap-3 text-sm text-foreground"
              htmlFor={statsConsentId}
            >
              <input
                checked={statsConsent}
                className="mt-0.5 size-4 shrink-0 rounded accent-primary"
                disabled={isBusy}
                id={statsConsentId}
                onChange={(event) => {
                  setStatsConsent(event.currentTarget.checked)
                  refreshStats.reset()
                }}
                type="checkbox"
              />
              <span>
                I consent to AlgoMemtor requesting this public profile&apos;s
                solved-problem total and storing the returned count. No source
                code or private account data is requested.
              </span>
            </label>
            <Button
              disabled={isBusy || !statsConsent}
              onClick={() => void handleStatsRefresh()}
              type="button"
              variant="outline"
            >
              {refreshStats.isPending
                ? 'Refreshing solved count…'
                : account.publicStats.status === 'not_synced'
                  ? 'Fetch solved count'
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
          profile access. With separate consent, you can manually fetch each
          provider&apos;s public solved count. This does not verify account
          ownership or individual solves, and it is not continuous syncing. You
          can skip or disconnect at any time.
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
