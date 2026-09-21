import { lazy, Suspense, type ReactNode } from 'react'
import { Route, Routes } from 'react-router-dom'

import { PageSkeleton } from '@/components/states/PageSkeleton'
import AppShell from '@/layouts/AppShell'

import ProtectedRoute from './ProtectedRoute'

const ActivityPage = lazy(() => import('@/pages/ActivityPage'))
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'))
const BookmarksPage = lazy(() => import('@/pages/BookmarksPage'))
const ContestsPage = lazy(() => import('@/pages/ContestsPage'))
const CoachPage = lazy(() => import('@/pages/CoachPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const LandingPage = lazy(() => import('@/pages/LandingPage'))
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const MemoryPage = lazy(() => import('@/pages/MemoryPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage'))
const ProblemsPage = lazy(() => import('@/pages/ProblemsPage'))
const ProblemDetailPage = lazy(() => import('@/pages/ProblemDetailPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const ProgressPage = lazy(() => import('@/pages/ProgressPage'))
const RecommendationsPage = lazy(() => import('@/pages/RecommendationsPage'))
const SettingPage = lazy(() => import('@/pages/SettingPage'))

const page = (content: ReactNode, label: string) => (
  <Suspense fallback={<PageSkeleton label={label} rows={3} />}>
    {content}
  </Suspense>
)

function AppRouter() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={page(<LandingPage />, 'Loading home')} />
        <Route path="login" element={page(<LoginPage />, 'Loading sign in')} />
        <Route element={<ProtectedRoute />}>
          <Route
            path="onboarding"
            element={page(<OnboardingPage />, 'Loading onboarding')}
          />
          <Route
            path="dashboard"
            element={page(<DashboardPage />, 'Loading dashboard')}
          />
          <Route
            path="problems"
            element={page(<ProblemsPage />, 'Loading problems')}
          />
          <Route
            path="problems/:provider/:externalId"
            element={page(<ProblemDetailPage />, 'Loading problem')}
          />
          <Route
            path="activity"
            element={page(<ActivityPage />, 'Loading activity')}
          />
          <Route
            path="contests"
            element={page(<ContestsPage />, 'Loading contests')}
          />
          <Route
            path="coach"
            element={page(<CoachPage />, 'Loading your coach')}
          />
          <Route
            path="analytics"
            element={page(<AnalyticsPage />, 'Loading insights')}
          />
          <Route
            path="recommendations"
            element={page(<RecommendationsPage />, 'Loading recommendations')}
          />
          <Route
            path="bookmarks"
            element={page(<BookmarksPage />, 'Loading bookmarks')}
          />
          <Route
            path="progress"
            element={page(<ProgressPage />, 'Loading progress')}
          />
          <Route
            path="memory"
            element={page(<MemoryPage />, 'Loading memory')}
          />
          <Route
            path="profile"
            element={page(<ProfilePage />, 'Loading profile')}
          />
          <Route
            path="settings"
            element={page(<SettingPage />, 'Loading settings')}
          />
        </Route>
        <Route path="*" element={page(<NotFoundPage />, 'Loading page')} />
      </Route>
    </Routes>
  )
}

export default AppRouter
