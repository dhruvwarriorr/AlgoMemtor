import { useLocation, useNavigate } from 'react-router-dom'
import type { SaveLearnerProfileRequest } from '@algomemtor/shared-contracts'

import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { useNotification } from '@/app/useNotification'
import { learnerProfileErrorMessage } from '@/features/profile/api/learner-profile'
import { LearnerProfileForm } from '@/features/profile/components/LearnerProfileForm'
import { ProviderAccountLinks } from '@/features/profile/components/ProviderAccountLinks'
import {
  useLearnerProfile,
  useSaveLearnerProfile,
} from '@/features/profile/hooks/useLearnerProfile'

import { postOnboardingDestination } from '@/routes/return-to'

function OnboardingPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { notify } = useNotification()
  const profileQuery = useLearnerProfile()
  const saveProfile = useSaveLearnerProfile()

  async function handleSubmit(profile: SaveLearnerProfileRequest) {
    await saveProfile.mutateAsync(profile)
    notify({
      title: 'Learner profile saved',
      description: 'Your dashboard is ready.',
      tone: 'success',
    })
    void navigate(postOnboardingDestination(location.state), { replace: true })
  }

  return (
    <PageContainer>
      <PageHeader
        description="Tell us enough to make your first recommendations useful. You can change every answer later."
        title="Set up your learner profile"
      />

      <LearnerProfileForm
        idPrefix="onboarding-profile"
        initialProfile={profileQuery.data?.data ?? null}
        isLoading={profileQuery.isPending}
        isSaving={saveProfile.isPending}
        loadError={
          profileQuery.isError
            ? learnerProfileErrorMessage(profileQuery.error)
            : null
        }
        onChange={() => saveProfile.reset()}
        onRetryLoad={() => void profileQuery.refetch()}
        onSubmit={handleSubmit}
        saveError={
          saveProfile.isError
            ? learnerProfileErrorMessage(saveProfile.error)
            : null
        }
        submitLabel="Complete setup"
      />
      <ProviderAccountLinks idPrefix="onboarding" />
      <aside
        aria-label="Personalized coaching disclosure"
        className="mt-6 rounded-xl border border-border bg-card p-4 sm:p-5"
      >
        <p className="text-sm font-semibold text-foreground">
          Personalized coaching is part of AlgoMemtor
        </p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          AlgoMemtor uses AI models to turn your profile, progress, and eligible
          learner notes into coaching and memory suggestions. It never sends
          passwords or credentials.
        </p>
      </aside>
    </PageContainer>
  )
}

export default OnboardingPage
