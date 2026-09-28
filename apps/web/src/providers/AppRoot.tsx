'use client'

import type { PropsWithChildren } from 'react'

import { NavigationStateSync } from '@/lib/router'

import { AppProviders } from './AppProviders'

export default function AppRoot({ children }: PropsWithChildren) {
  return (
    <AppProviders>
      <NavigationStateSync />
      {children}
    </AppProviders>
  )
}
