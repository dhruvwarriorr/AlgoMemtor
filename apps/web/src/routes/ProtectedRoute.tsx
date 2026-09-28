import { useEffect, useMemo, useRef, type PropsWithChildren } from 'react'

import { Navigate, useLocation, useNavigate } from '@/lib/router'
import { useQueryClient } from '@tanstack/react-query'

import PageContainer from '@/components/layout/PageContainer'
import { OrbLoader } from '@/components/motion/OrbLoader'
import { ErrorState } from '@/components/states/ErrorState'
import { useAuth } from '@/features/auth/useAuth'
import {
  isLearnerDataDeletionPendingError,
  learnerProfileErrorMessage,
} from '@/features/profile/api/learner-profile'
import { DataResetPendingState } from '@/features/profile/components/DataResetPendingState'
import {
  useDeleteAllData,
  useDeleteAllDataStatus,
} from '@/features/profile/hooks/useLearnerSettings'
import { useLearnerProfile } from '@/features/profile/hooks/useLearnerProfile'

// Whether this learner finished onboarding, remembered in the browser as a
// single flag (no profile data). A returning learner's page then opens at
// once and loads alongside their profile instead of waiting for it; the
// fresh profile still decides, and redirects if onboarding is needed again.
const onboardedKey = (userId: string) => `algomemtor:onboarded:${userId}`

function readOnboarded(userId: string | undefined) {
  if (userId === undefined) return false
  try {
    return window.localStorage.getItem(onboardedKey(userId)) === '1'
  } catch {
    return false
  }
}

function writeOnboarded(userId: string, onboarded: boolean) {
  try {
    if (onboarded) window.localStorage.setItem(onboardedKey(userId), '1')
    else window.localStorage.removeItem(onboardedKey(userId))
  } catch {
    // Storage can be unavailable (private mode); the gate just waits.
  }
}

function ProtectedRoute({ children }: PropsWithChildren) {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { status, user } = useAuth()
  const profileQuery = useLearnerProfile()
  const userId = user?.id
  const knownOnboarded = useMemo(() => readOnboarded(userId), [userId])
  const profile = profileQuery.data?.data
  useEffect(() => {
    if (userId === undefined || profile === undefined) return
    writeOnboarded(userId, profile?.onboardingCompleted === true)
  }, [userId, profile])
  const isDataResetPending = isLearnerDataDeletionPendingError(
    profileQuery.error,
  )
  const dataResetStatusQuery = useDeleteAllDataStatus(isDataResetPending)
  const deleteMutation = useDeleteAllData()
  const handledResetCompletion = useRef(false)

  useEffect(() => {
    if (!isDataResetPending) {
      handledResetCompletion.current = false
      return
    }

    if (
      handledResetCompletion.current ||
      dataResetStatusQuery.isFetching ||
      dataResetStatusQuery.data?.data.status !== 'completed'
    ) {
      return
    }

    handledResetCompletion.current = true
    queryClient.clear()
    void navigate('/onboarding', { replace: true })
  }, [
    dataResetStatusQuery.data?.data.status,
    dataResetStatusQuery.isFetching,
    isDataResetPending,
    navigate,
    queryClient,
  ])

  async function retryCleanup() {
    if (dataResetStatusQuery.data?.data.status === 'failed') {
      try {
        await deleteMutation.mutateAsync({ confirmation: 'DELETE' })
        await dataResetStatusQuery.refetch()
      } catch {
        await dataResetStatusQuery.refetch()
      }
      return
    }
    await dataResetStatusQuery.refetch()
  }

  if (status === 'loading') {
    return (
      <PageContainer className="items-center justify-center text-center">
        <div role="status">
          <OrbLoader label="Restoring your session…" />
        </div>
      </PageContainer>
    )
  }

  if (status === 'unauthenticated') {
    return <Navigate replace state={{ from: location }} to="/login" />
  }

  if (isDataResetPending) {
    return (
      <DataResetPendingState
        hasError={dataResetStatusQuery.isError}
        isChecking={
          dataResetStatusQuery.isPending || dataResetStatusQuery.isFetching
        }
        isRetrying={deleteMutation.isPending}
        onRetry={() => void retryCleanup()}
        status={dataResetStatusQuery.data?.data.status}
      />
    )
  }

  if (location.pathname !== '/onboarding') {
    if (profileQuery.isPending && !knownOnboarded) {
      return (
        <PageContainer className="items-center justify-center text-center">
          <div role="status">
            <OrbLoader label="Loading your learner profile…" />
          </div>
        </PageContainer>
      )
    }

    if (profileQuery.isError) {
      return (
        <PageContainer className="items-center justify-center">
          <ErrorState
            message={learnerProfileErrorMessage(profileQuery.error)}
            onRetry={() => void profileQuery.refetch()}
            title="Learner profile unavailable"
          />
        </PageContainer>
      )
    }

    if (
      profileQuery.data !== undefined &&
      (profileQuery.data.data === null ||
        !profileQuery.data.data.onboardingCompleted)
    ) {
      return <Navigate replace state={{ from: location }} to="/onboarding" />
    }
  }

  return children
}

export default ProtectedRoute
