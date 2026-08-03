import { Route, Routes } from 'react-router-dom'

import AppShell from '@/layouts/AppShell'
import DashboardPage from '@/pages/DashboardPage'
import LandingPage from '@/pages/LandingPage'
import LoginPage from '@/pages/LoginPage'
import NotFoundPage from '@/pages/NotFoundPage'
import OnboardingPage from '@/pages/OnboardingPage'
import ProblemDetailPage from '@/pages/ProblemDetailPage'
import ProblemsPage from '@/pages/ProblemsPage'
import ProfilePage from '@/pages/ProfilePage'
import ProgressPage from '@/pages/ProgressPage'
import SettingPage from '@/pages/SettingPage'
import SubmissionsPage from '@/pages/SubmissionsPage'

function AppRouter() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<LandingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="problems" element={<ProblemsPage />} />
        <Route path="problems/:problemId" element={<ProblemDetailPage />} />
        <Route path="submissions" element={<SubmissionsPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<SettingPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default AppRouter
