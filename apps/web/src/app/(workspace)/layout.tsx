'use client'

import type { PropsWithChildren } from 'react'

import AppLayout from '@/layouts/AppLayout'
import ProtectedRoute from '@/routes/ProtectedRoute'

// The signed-in workspace.
export default function WorkspaceLayout({ children }: PropsWithChildren) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  )
}
