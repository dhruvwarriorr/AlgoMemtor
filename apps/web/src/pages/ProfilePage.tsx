import { Link } from 'react-router-dom'

import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/features/auth/useAuth'
import { ProfileBanner } from '@/features/profile/components/ProfileBanner'
import { AiNoteConsentCard } from '@/features/profile/components/AiNoteConsentCard'
import { LearnerMemoryPanel } from '@/features/memory/components/LearnerMemoryPanel'
import { learnerProfileErrorMessage } from '@/features/profile/api/learner-profile'
import { providerAccountErrorMessage } from '@/features/profile/api/provider-accounts'
import { useLearnerProfile } from '@/features/profile/hooks/useLearnerProfile'
import { useProviderAccounts } from '@/features/profile/hooks/useProviderAccounts'
import { useUnifiedProfile } from '@/features/platform/hooks'

function readableLabel(value: string) {
  const words = value.replaceAll('_', ' ').replaceAll('-', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1 px-5 py-4 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-6 sm:px-6">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium text-foreground">{value}</dd>
    </div>
  )
}

function ProfilePage() {
  const { user } = useAuth()
  const profileQuery = useLearnerProfile()
  const accountsQuery = useProviderAccounts()
  const unifiedProfileQuery = useUnifiedProfile()

  if (profileQuery.isPending) {
    return (
      <PageContainer>
        <PageSkeleton label="Loading learner profile" rows={4} />
      </PageContainer>
    )
  }

  if (profileQuery.isError) {
    return (
      <PageContainer>
        <ErrorState
          message={learnerProfileErrorMessage(profileQuery.error)}
          onRetry={() => void profileQuery.refetch()}
          title="Learner profile unavailable"
        />
      </PageContainer>
    )
  }

  const profile = profileQuery.data.data

  if (profile === null) {
    return (
      <PageContainer>
        <ErrorState
          message="Complete onboarding to create your recommendation profile."
          title="Learner profile not set up"
        />
      </PageContainer>
    )
  }

  const weakTopics =
    profile.topicPreference.mode === 'let_algomemtor_suggest'
      ? 'Let AlgoMemtor suggest'
      : profile.topicPreference.topics.map(readableLabel).join(', ')
  const preferredTopics =
    profile.preferredTopics.length === 0
      ? 'No preference'
      : profile.preferredTopics.map(readableLabel).join(', ')
  const platforms =
    profile.platformPreferences.platforms.length === 0
      ? 'No preference'
      : profile.platformPreferences.platforms.map(readableLabel).join(', ')

  return (
    <PageContainer>
      <PageHeader
        description="Everything your coach knows about you, from goals to linked platform evidence."
        title="Profile"
      />

      <ProfileBanner
        action={
          <Link className={buttonVariants({ variant: 'ink' })} to="/settings">
            Edit in settings
          </Link>
        }
        email={user?.email}
        profile={profile}
      />

      <section
        aria-labelledby="learner-information-heading"
        className="space-y-4"
      >
        <h2
          className="text-2xl font-semibold tracking-tight text-foreground"
          id="learner-information-heading"
        >
          Learner details
        </h2>
        <dl className="min-w-0 divide-y divide-dashed divide-border overflow-hidden rounded-xl border border-border bg-card">
          <SummaryItem label="Account email" value={user?.email ?? 'Not set'} />
          <SummaryItem
            label="Experience"
            value={readableLabel(profile.experience)}
          />
          <SummaryItem label="Goal" value={readableLabel(profile.goal)} />
          <SummaryItem label="Weak or focus topics" value={weakTopics} />
          <SummaryItem label="Preferred topics" value={preferredTopics} />
          <SummaryItem label="Preferred providers" value={platforms} />
          <SummaryItem
            label="Difficulty comfort"
            value={readableLabel(profile.difficultyComfort)}
          />
          <SummaryItem
            label="Learning style"
            value={profile.learningPreferences.map(readableLabel).join(', ')}
          />
          <SummaryItem
            label="Saved recommendation note"
            value={profile.recommendationPreference ?? 'No saved note'}
          />
          <SummaryItem
            label="Progress timezone"
            value={profile.timezone ?? 'Browser timezone suggested on save'}
          />
        </dl>
      </section>

      <section aria-labelledby="provider-summary-heading" className="space-y-4">
        <h2
          className="text-xl font-semibold tracking-tight text-foreground"
          id="provider-summary-heading"
        >
          Linked public profiles
        </h2>
        {accountsQuery.isPending ? (
          <PageSkeleton label="Loading linked public profiles" rows={2} />
        ) : accountsQuery.isError ? (
          <ErrorState
            message={providerAccountErrorMessage(accountsQuery.error)}
            onRetry={() => void accountsQuery.refetch()}
            title="Provider profiles unavailable"
          />
        ) : accountsQuery.data.data.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-4 text-muted-foreground">
            No provider accounts are linked. Linking remains optional.
          </p>
        ) : (
          <ul className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accountsQuery.data.data.map((account) => (
              <li
                className="min-w-0 rounded-lg border border-border bg-card p-4"
                key={account.provider}
              >
                <p className="font-medium text-foreground">
                  {readableLabel(account.provider)}
                </p>
                <a
                  className="mt-1 block break-all text-sm text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  href={account.profileUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {account.handle}
                </a>
                <p className="mt-2 text-sm text-muted-foreground">
                  {account.publicStats.status === 'available'
                    ? `${account.publicStats.complete ? '' : 'At least '}${account.publicStats.solvedCount.toLocaleString()} solved`
                    : account.publicStats.status === 'unavailable'
                      ? 'Solved count unavailable'
                      : 'Solved count not fetched'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="unified-profile-heading" className="space-y-4">
        <div>
          <h2
            className="text-xl font-semibold tracking-tight text-foreground"
            id="unified-profile-heading"
          >
            Unified provider summary
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The combined total adds the latest reported count from each active
            provider. Problems are not deduplicated across platforms.
          </p>
        </div>
        {unifiedProfileQuery.isPending ? (
          <PageSkeleton label="Loading unified provider summary" rows={2} />
        ) : unifiedProfileQuery.isError ||
          unifiedProfileQuery.data === undefined ? (
          <ErrorState
            message={
              unifiedProfileQuery.error instanceof Error
                ? unifiedProfileQuery.error.message
                : 'The unified provider summary could not be loaded.'
            }
            onRetry={() => void unifiedProfileQuery.refetch()}
            title="Provider summary unavailable"
          />
        ) : (
          <div className="space-y-4">
            <dl className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryItem
                label="Total solved across active links"
                value={unifiedProfileQuery.data.data.solvedTotal.toLocaleString()}
              />
              <SummaryItem
                label="Data completeness"
                value={readableLabel(
                  unifiedProfileQuery.data.data.completeness,
                )}
              />
              <SummaryItem
                label="Stale providers"
                value={
                  unifiedProfileQuery.data.data.staleProviders.length === 0
                    ? 'None reported'
                    : unifiedProfileQuery.data.data.staleProviders
                        .map(readableLabel)
                        .join(', ')
                }
              />
              <SummaryItem
                label="Archived identities"
                value={String(
                  unifiedProfileQuery.data.data.archivedAccounts?.length ?? 0,
                )}
              />
            </dl>
            <ul className="grid min-w-0 gap-3 sm:grid-cols-3">
              {unifiedProfileQuery.data.data.providers.map((provider) => (
                <li
                  className="rounded-lg border border-border bg-card p-4"
                  key={provider.provider}
                >
                  <p className="font-medium text-foreground">
                    {readableLabel(provider.provider)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {provider.solvedCount === undefined
                      ? 'Solved total unavailable'
                      : `${provider.complete === false ? 'At least ' : ''}${provider.solvedCount.toLocaleString()} solved`}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {provider.rating === undefined
                      ? 'Rating not reported'
                      : `Rating ${provider.rating}`}
                    {provider.rank ? ` · ${provider.rank}` : ''}
                  </p>
                  {provider.stale ? (
                    <p className="mt-2 text-xs text-destructive">
                      Last provider refresh is stale.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Need to remove provider observations? Use the delete-history
              control in the linked account settings below. Disconnecting alone
              keeps historical data for your records.
            </p>
          </div>
        )}
      </section>

      <AiNoteConsentCard existingUser />
      <section aria-labelledby="profile-memory-heading" className="space-y-4">
        <div>
          <h2
            className="text-xl font-semibold tracking-tight text-foreground"
            id="profile-memory-heading"
          >
            Learner memory controls
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review, correct, archive, restore, or delete the memory signals used
            for future recommendations.
          </p>
        </div>
        <LearnerMemoryPanel />
      </section>
    </PageContainer>
  )
}

export default ProfilePage
