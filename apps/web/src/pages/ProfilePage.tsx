import { Link } from 'react-router-dom'

import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/features/auth/useAuth'
import { learnerProfileErrorMessage } from '@/features/profile/api/learner-profile'
import { providerAccountErrorMessage } from '@/features/profile/api/provider-accounts'
import { useLearnerProfile } from '@/features/profile/hooks/useLearnerProfile'
import { useProviderAccounts } from '@/features/profile/hooks/useProviderAccounts'

function readableLabel(value: string) {
  const words = value.replaceAll('_', ' ').replaceAll('-', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-4 sm:min-w-56">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-foreground">{value}</dd>
    </div>
  )
}

function ProfilePage() {
  const { user } = useAuth()
  const profileQuery = useLearnerProfile()
  const accountsQuery = useProviderAccounts()

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
        description="The recommendation preferences and optional public provider data saved for your account."
        title="Profile"
      />

      <section
        aria-labelledby="learner-information-heading"
        className="space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            className="text-xl font-semibold tracking-tight text-foreground"
            id="learner-information-heading"
          >
            Learner information
          </h2>
          <Link
            className={buttonVariants({ variant: 'outline' })}
            to="/settings"
          >
            Edit in settings
          </Link>
        </div>
        <dl className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
    </PageContainer>
  )
}

export default ProfilePage
