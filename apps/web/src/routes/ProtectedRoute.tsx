import { Navigate, Outlet, useLocation } from 'react-router-dom'

import PageContainer from '@/components/layout/PageContainer'
import { ErrorState } from '@/components/states/ErrorState'
import { useAuth } from '@/features/auth/useAuth'
import { learnerProfileErrorMessage } from '@/features/profile/api/learner-profile'
import { useLearnerProfile } from '@/features/profile/hooks/useLearnerProfile'

function ProtectedRoute() {
  const location = useLocation()
  const { status } = useAuth()
  const profileQuery = useLearnerProfile()

  if (status === 'loading') {
    return (
      <PageContainer className="items-center justify-center text-center">
        <p className="text-sm text-muted-foreground" role="status">
          Restoring your session…
        </p>
      </PageContainer>
    )
  }

  if (status === 'unauthenticated') {
    return <Navigate replace state={{ from: location }} to="/login" />
  }

  if (location.pathname !== '/onboarding') {
    if (profileQuery.isPending) {
      return (
        <PageContainer className="items-center justify-center text-center">
          <p className="text-sm text-muted-foreground" role="status">
            Loading your learner profile…
          </p>
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
      profileQuery.data.data === null ||
      !profileQuery.data.data.onboardingCompleted
    ) {
      return <Navigate replace state={{ from: location }} to="/onboarding" />
    }
  }

  return <Outlet />
}

export default ProtectedRoute
