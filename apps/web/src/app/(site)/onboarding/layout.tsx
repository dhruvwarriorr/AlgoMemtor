'use client'

import type { PropsWithChildren } from 'react'

import ProtectedRoute from '@/routes/ProtectedRoute'

export default function OnboardingLayout({ children }: PropsWithChildren) {
  return <ProtectedRoute>{children}</ProtectedRoute>
}
