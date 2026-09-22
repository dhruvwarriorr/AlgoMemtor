import { Outlet } from 'react-router-dom'

import { AppSidebar } from '@/components/navigation/AppSidebar'
import { MobileDock } from '@/components/navigation/MobileDock'
import { ScrollRestoration } from '@/routes/ScrollRestoration'

import { MobileAppHeader } from './MobileAppHeader'

// Signed-in workspace: a full-page backdrop, sticky sidebar, and one large
// content panel. Nothing is boxed into a centred column.
function AppLayout() {
  return (
    <div className="app-backdrop flex min-h-dvh w-full min-w-0">
      <ScrollRestoration />
      <a
        className="fixed top-3 left-4 z-[100] -translate-y-20 rounded-full bg-ink px-3 py-2 text-sm font-medium text-ink-foreground transition-transform focus:translate-y-0"
        href="#main-content"
      >
        Skip to content
      </a>
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col p-2 pb-28 sm:p-3 sm:pb-28 lg:py-4 lg:pr-4 lg:pb-4 lg:pl-2">
        <MobileAppHeader />
        <div className="flex min-h-[calc(100dvh-2rem)] min-w-0 flex-1 flex-col rounded-[1.75rem] bg-background shadow-[0_1px_2px_rgb(22_52_102/0.06),0_30px_60px_-30px_rgb(22_52_102/0.25)] ring-1 ring-white/70 dark:shadow-none dark:ring-white/5">
          <Outlet />
        </div>
      </div>
      <MobileDock />
    </div>
  )
}

export default AppLayout
