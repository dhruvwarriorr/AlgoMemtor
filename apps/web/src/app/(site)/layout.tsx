'use client'

import type { PropsWithChildren } from 'react'

import AppShell from '@/layouts/AppShell'

// Public pages (home, sign in, password reset) and onboarding.
export default function SiteLayout({ children }: PropsWithChildren) {
  return <AppShell>{children}</AppShell>
}
