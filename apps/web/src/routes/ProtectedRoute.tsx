import { Navigate, Outlet, useLocation } from 'react-router-dom'

import PageContainer from '@/components/layout/PageContainer'
import { useAuth } from '@/features/auth/useAuth'

function ProtectedRoute() {
  const location = useLocation()
  const { status } = useAuth()

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

  return <Outlet />
}

export default ProtectedRoute
