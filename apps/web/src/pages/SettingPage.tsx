import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { SaveLearnerProfileRequest } from '@algomemtor/shared-contracts'

import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { learnerProfileErrorMessage } from '@/features/profile/api/learner-profile'
import { LearnerProfileForm } from '@/features/profile/components/LearnerProfileForm'
import { ProviderAccountLinks } from '@/features/profile/components/ProviderAccountLinks'
import { AiNoteConsentCard } from '@/features/profile/components/AiNoteConsentCard'
import { DataResetDialog } from '@/features/profile/components/DataResetDialog'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  useLearnerProfile,
  useSaveLearnerProfile,
} from '@/features/profile/hooks/useLearnerProfile'

function SettingPage() {
  const profileQuery = useLearnerProfile()
  const saveProfile = useSaveLearnerProfile()
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [resetOpen, setResetOpen] = useState(false)

  async function handleSubmit(profile: SaveLearnerProfileRequest) {
    setSuccessMessage(null)
    try {
      await saveProfile.mutateAsync(profile)
      setSuccessMessage('Your learner profile changes have been saved.')
    } catch {
      // The form renders the mutation's validated error state. Catching here
      // prevents an unhandled rejection from escaping the submit handler.
    }
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
      <AiNoteConsentCard existingUser />
      <section
        aria-labelledby="memory-settings-heading"
        className="rounded-xl border border-border bg-card p-4 sm:p-5"
      >
        <h2
          className="text-lg font-semibold text-card-foreground"
          id="memory-settings-heading"
        >
          Learner memory
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Review, correct, archive, or delete the learner patterns that may be
          used for future recommendations.
        </p>
        <Link
          className={`mt-4 ${buttonVariants({ variant: 'outline' })}`}
          to="/memory"
        >
          Review learner memory
        </Link>
      </section>
      <section
        aria-labelledby="danger-zone-heading"
        className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 sm:p-5"
      >
        <h2
          className="text-lg font-semibold text-foreground"
          id="danger-zone-heading"
        >
          Data reset
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Remove AlgoMemtor learner data while keeping your sign-in account.
          This cannot be undone. The cleanup may run in the background and
          returns you to onboarding.
        </p>
        <Button
          className="mt-4"
          onClick={() => setResetOpen(true)}
          type="button"
          variant="destructive"
        >
          Reset AlgoMemtor data
        </Button>
      </section>
      <DataResetDialog onClose={() => setResetOpen(false)} open={resetOpen} />
    </PageContainer>
  )
}

export default SettingPage
