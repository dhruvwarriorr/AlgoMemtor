import type { PropsWithChildren } from 'react'

import { useLocation } from '@/lib/router'

import Topbar from '@/components/navigation/Topbar'
import { cn } from '@/lib/utils'
import { ScrollRestoration } from '@/routes/ScrollRestoration'

function AppShell({ children }: PropsWithChildren) {
  // The landing page is a dark, cinematic scene in every theme.
  const isLanding = useLocation().pathname === '/'

  return (
    <div
      className={cn(
        'flex min-h-svh w-full min-w-0 flex-col bg-background',
        isLanding && 'dark bg-[#0a0a0b] text-foreground',
      )}
    >
      <ScrollRestoration />
      <a
        className="fixed top-3 left-4 z-[100] -translate-y-20 rounded-md bg-ink px-3 py-2 text-sm font-medium text-ink-foreground transition-transform focus:translate-y-0"
        href="#main-content"
      >
        Skip to content
      </a>
      <Topbar />
      {children}
    </div>
  )
}

export default AppShell
