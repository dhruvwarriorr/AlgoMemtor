import { lazy, Suspense, type ReactNode } from 'react'
import { Route, Routes } from 'react-router-dom'

import { PageSkeleton } from '@/components/states/PageSkeleton'
import AppLayout from '@/layouts/AppLayout'
import AppShell from '@/layouts/AppShell'

import ProtectedRoute from './ProtectedRoute'

const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'))
const BookmarksPage = lazy(() => import('@/pages/BookmarksPage'))
const ContestsPage = lazy(() => import('@/pages/ContestsPage'))
const ContestAnalysisPage = lazy(() => import('@/pages/ContestAnalysisPage'))
const DoubtHelperPage = lazy(() => import('@/pages/DoubtHelperPage'))
const CoachPage = lazy(() => import('@/pages/CoachPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const LandingPage = lazy(() => import('@/pages/LandingPage'))
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const MemoryPage = lazy(() => import('@/pages/MemoryPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage'))
const PathwayPage = lazy(() => import('@/pages/PathwayPage'))
const ProblemsPage = lazy(() => import('@/pages/ProblemsPage'))
const ProblemDetailPage = lazy(() => import('@/pages/ProblemDetailPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const ProgressPage = lazy(() => import('@/pages/ProgressPage'))
const ProgressReportPage = lazy(() => import('@/pages/ProgressReportPage'))
const RecommendationsPage = lazy(() => import('@/pages/RecommendationsPage'))
const ResetPasswordPage = lazy(
  () => import('@/features/auth/components/ResetPasswordPage'),
)
const SettingPage = lazy(() => import('@/pages/SettingPage'))
const SolutionExplorerPage = lazy(() => import('@/pages/SolutionExplorerPage'))
const UpsolvePage = lazy(() => import('@/pages/UpsolvePage'))

const page = (content: ReactNode, label: string) => (
  <Suspense
    fallback={
      <div className="w-full px-5 py-6 sm:px-8 lg:px-10">
        <PageSkeleton label={label} rows={4} withHeader />
      </div>
    }
  >
    {content}
  </Suspense>
)

function AppRouter() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={page(<LandingPage />, 'Loading home')} />
        <Route path="login" element={page(<LoginPage />, 'Loading sign in')} />
        <Route
          path="reset-password"
          element={page(<ResetPasswordPage />, 'Loading password reset')}
        />
        <Route element={<ProtectedRoute />}>
          <Route
            path="onboarding"
            element={page(<OnboardingPage />, 'Loading onboarding')}
          />
        </Route>
        <Route path="*" element={page(<NotFoundPage />, 'Loading page')} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
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
            path="contests"
            element={page(<ContestsPage />, 'Loading contests')}
          />
          <Route
            path="coach"
            element={page(<CoachPage />, 'Loading your coach')}
          />
          <Route
            path="pathway"
            element={page(<PathwayPage />, 'Loading your pathway')}
          />
          <Route
            path="doubt-helper"
            element={page(<DoubtHelperPage />, 'Loading Doubt Helper')}
          />
          <Route
            path="doubt-helper/:sessionId"
            element={page(<DoubtHelperPage />, 'Loading Doubt Helper')}
          />
          <Route
            path="solutions"
            element={page(
              <SolutionExplorerPage />,
              'Loading Solution Explorer',
            )}
          />
          <Route
            path="upsolve"
            element={page(<UpsolvePage />, 'Loading upsolve queue')}
          />
          <Route
            path="contest-analysis"
            element={page(<ContestAnalysisPage />, 'Loading contest analysis')}
          />
          <Route
            path="progress/report"
            element={page(<ProgressReportPage />, 'Loading progress report')}
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
      </Route>
    </Routes>
  )
}

export default AppRouter
