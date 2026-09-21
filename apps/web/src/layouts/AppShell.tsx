import { Outlet } from 'react-router-dom'
import Topbar from '@/components/navigation/Topbar'
import { ScrollRestoration } from '@/routes/ScrollRestoration'

function AppShell() {
  return (
    <div className="flex min-h-svh w-full min-w-0 flex-col bg-background">
      <ScrollRestoration />
      <a
        className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform focus:translate-y-0"
        href="#main-content"
      >
        Skip to content
      </a>
      <Topbar />
      <Outlet />
    </div>
  )
}

export default AppShell
