import { Route, Routes } from 'react-router-dom'

import AppShell from '@/layouts/AppShell'
import BookmarksPage from '@/pages/BookmarksPage'
import DashboardPage from '@/pages/DashboardPage'
import LandingPage from '@/pages/LandingPage'
import LoginPage from '@/pages/LoginPage'
import MemoryPage from '@/pages/MemoryPage'
import NotFoundPage from '@/pages/NotFoundPage'
import OnboardingPage from '@/pages/OnboardingPage'
import ProblemsPage from '@/pages/ProblemsPage'
import ProfilePage from '@/pages/ProfilePage'
import ProgressPage from '@/pages/ProgressPage'
import RecommendationsPage from '@/pages/RecommendationsPage'
import SettingPage from '@/pages/SettingPage'

import ProtectedRoute from './ProtectedRoute'

function AppRouter() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<LandingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="onboarding" element={<OnboardingPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="problems" element={<ProblemsPage />} />
          <Route path="recommendations" element={<RecommendationsPage />} />
          <Route path="bookmarks" element={<BookmarksPage />} />
          <Route path="progress" element={<ProgressPage />} />
          <Route path="memory" element={<MemoryPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="settings" element={<SettingPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default AppRouter
