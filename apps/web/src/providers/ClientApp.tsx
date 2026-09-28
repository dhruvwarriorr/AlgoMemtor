'use client'

import dynamic from 'next/dynamic'
import type { PropsWithChildren } from 'react'

// The app renders in the browser only, as the Vite single-page app did: its
// pages read the Supabase session, localStorage and window size while they
// render. The server sends the document shell and the page code.
const AppRoot = dynamic(() => import('./AppRoot'), { ssr: false })

export function ClientApp({ children }: PropsWithChildren) {
  return <AppRoot>{children}</AppRoot>
}
