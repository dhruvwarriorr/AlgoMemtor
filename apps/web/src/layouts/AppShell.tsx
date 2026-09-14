import { Outlet } from 'react-router-dom'
import Topbar from '@/components/navigation/Topbar'
import { ScrollRestoration } from '@/routes/ScrollRestoration'

function AppShell() {
  return (
    <div className="flex min-h-svh w-full min-w-0 flex-col bg-background">
      <ScrollRestoration />
      <Topbar />
      <Outlet />
    </div>
  )
}

export default AppShell
