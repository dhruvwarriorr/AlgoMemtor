import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import { ClientApp } from '@/providers/ClientApp'

import '@/index.css'

export const metadata: Metadata = {
  title: 'AlgoMemtor',
  description:
    'AlgoMemtor reads your Codeforces, LeetCode and CodeChef history, then plans the practice that closes your real gaps.',
  icons: { icon: { url: '/favicon.svg', type: 'image/svg+xml' } },
}

export const viewport: Viewport = {
  themeColor: '#5fa9e6',
}

// Applies the saved theme before the app loads, so a dark theme does not
// flash light first (ThemeProvider owns it afterwards).
const themeScript = `try{var t=localStorage.getItem('algomemtor-theme');var d=t==='dark'||((t===null||t==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light'}catch(_){}`

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ClientApp>{children}</ClientApp>
      </body>
    </html>
  )
}
