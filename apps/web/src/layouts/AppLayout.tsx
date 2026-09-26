import { lazy, Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { AppTopbar } from '@/components/navigation/AppTopbar'
import { ScrollRestoration } from '@/routes/ScrollRestoration'

// The coach pet loads after the page: it is not needed for the first paint.
const MelloPet = lazy(() =>
  import('@/features/pet/MelloPet').then((module) => ({
    default: module.MelloPet,
  })),
)

// Signed-in workspace: a top bar over one large, full-width content panel.
function AppLayout() {
  const { pathname } = useLocation()

  return (
    <div className="app-backdrop flex min-h-dvh w-full min-w-0 flex-col">
      <ScrollRestoration />
      <a
        className="fixed top-3 left-4 z-[100] -translate-y-20 rounded-md bg-ink px-3 py-2 text-sm font-medium text-ink-foreground transition-transform focus:translate-y-0"
        href="#main-content"
      >
        Skip to content
      </a>
      <AppTopbar />
      <div className="flex min-w-0 flex-1 flex-col p-(--app-gutter)">
        <div className="flex min-h-[calc(100dvh-var(--app-chrome))] min-w-0 flex-1 flex-col rounded-xl border border-border bg-card shadow-soft">
          {/* Keyed by path so each page rises in when you navigate. */}
          <div
            className="animate-page flex min-w-0 flex-1 flex-col"
            key={pathname}
          >
            <Outlet />
          </div>
        </div>
      </div>
      <Suspense fallback={null}>
        <MelloPet />
      </Suspense>
    </div>
  )
}

export default AppLayout
