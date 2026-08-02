import { Navigate, Route, Routes } from 'react-router-dom'

import AppShell from '@/layouts/AppShell'
import DashboardPage from '@/pages/DashboardPage'
import LoginPage from '@/pages/LoginPage'
import ProblemsPage from '@/pages/ProblemsPage'
import ProgressPage from '@/pages/ProgressPage'
import SettingPage from '@/pages/SettingPage'

function AppRouter() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate replace to="/dashboard" />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="problems" element={<ProblemsPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="settings" element={<SettingPage />} />
        <Route path="login" element={<LoginPage />} />
      </Route>
    </Routes>
  )
}

export default AppRouter
