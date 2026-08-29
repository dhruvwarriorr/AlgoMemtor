import { useState } from 'react'
import type { SaveLearnerProfileRequest } from '@algomemtor/shared-contracts'

import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { learnerProfileErrorMessage } from '@/features/profile/api/learner-profile'
import { LearnerProfileForm } from '@/features/profile/components/LearnerProfileForm'
import { ProviderAccountLinks } from '@/features/profile/components/ProviderAccountLinks'
import {
  useLearnerProfile,
  useSaveLearnerProfile,
} from '@/features/profile/hooks/useLearnerProfile'

function SettingPage() {
  const profileQuery = useLearnerProfile()
  const saveProfile = useSaveLearnerProfile()
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  async function handleSubmit(profile: SaveLearnerProfileRequest) {
    setSuccessMessage(null)
    await saveProfile.mutateAsync(profile)
    setSuccessMessage('Your learner profile changes have been saved.')
  }

  function handleChange() {
    setSuccessMessage(null)
    saveProfile.reset()
  }

  return (
    <PageContainer>
      <PageHeader
        description="Update the answers AlgoMemtor uses to personalize recommendations. Your sign-in email is managed separately by Supabase Auth."
        title="Settings"
      />

      <LearnerProfileForm
        idPrefix="settings-profile"
        initialProfile={profileQuery.data?.data ?? null}
        isLoading={profileQuery.isPending}
        isSaving={saveProfile.isPending}
        loadError={
          profileQuery.isError
            ? learnerProfileErrorMessage(profileQuery.error)
            : null
        }
        onChange={handleChange}
        onRetryLoad={() => void profileQuery.refetch()}
        onSubmit={handleSubmit}
        saveError={
          saveProfile.isError
            ? learnerProfileErrorMessage(saveProfile.error)
            : null
        }
        submitLabel="Save profile changes"
        successMessage={successMessage}
      />
      <ProviderAccountLinks idPrefix="settings" />
    </PageContainer>
  )
}

export default SettingPage
