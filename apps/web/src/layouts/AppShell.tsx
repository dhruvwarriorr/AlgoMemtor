import { Outlet } from 'react-router-dom'
import Topbar from '@/components/navigation/Topbar'

function AppShell() {
  return (
    <div className="flex min-h-svh w-full min-w-0 flex-col bg-background">
      <Topbar />
      <Outlet />
    </div>
  )
}

export default AppShell
