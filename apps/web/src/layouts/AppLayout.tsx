import { Outlet } from 'react-router-dom'

import { AppTopbar } from '@/components/navigation/AppTopbar'
import { ScrollRestoration } from '@/routes/ScrollRestoration'

// Signed-in workspace: a top bar over one large, full-width content panel.
function AppLayout() {
  return (
    <div className="app-backdrop flex min-h-dvh w-full min-w-0 flex-col">
      <ScrollRestoration />
      <a
        className="fixed top-3 left-4 z-[100] -translate-y-20 rounded-full bg-ink px-3 py-2 text-sm font-medium text-ink-foreground transition-transform focus:translate-y-0"
        href="#main-content"
      >
        Skip to content
      </a>
      <AppTopbar />
      <div className="flex min-w-0 flex-1 flex-col p-(--app-gutter)">
        <div className="flex min-h-[calc(100dvh-var(--app-chrome))] min-w-0 flex-1 flex-col rounded-[1.75rem] border border-border bg-card shadow-soft">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

export default AppLayout
