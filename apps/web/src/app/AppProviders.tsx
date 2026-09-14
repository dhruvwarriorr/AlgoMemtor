import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import type { PropsWithChildren } from 'react'

import { AuthProvider } from '@/features/auth/AuthProvider'
import { TimerProvider } from '@/features/progress/timer/TimerProvider'

import { DevelopmentMocks } from './DevelopmentMocks'
import { NotificationProvider } from './NotificationProvider'
import { ThemeProvider } from './ThemeProvider'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
})

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <DevelopmentMocks>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <TimerProvider>
                <NotificationProvider>{children}</NotificationProvider>
              </TimerProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </DevelopmentMocks>
  )
}
