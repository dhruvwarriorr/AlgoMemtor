import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { AuthStatus } from '@/features/auth/auth-context'

const primaryClass =
  'group inline-flex h-14 items-center gap-2 rounded-md bg-[#f4f1ea] pr-2 pl-7 font-medium text-[#101012] shadow-xl outline-none transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-[1.04] focus-visible:ring-4 focus-visible:ring-primary/40 active:scale-[0.98]'

const secondaryClass =
  'glass-panel inline-flex h-14 items-center gap-2 rounded-md px-7 font-medium text-white outline-none transition-colors duration-300 hover:bg-white/10 focus-visible:ring-4 focus-visible:ring-primary/40'

function PrimaryIcon() {
  return (
    <span className="grid size-10 place-items-center rounded-md bg-[#101012] text-[#f4f1ea] transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-px">
      <ArrowUpRight aria-hidden="true" className="size-4" />
    </span>
  )
}

// Hero and closing call to action: one primary path per auth state.
export function LandingActions({ status }: { status: AuthStatus }) {
  if (status === 'loading') return null

  return (
    <nav
      aria-label="Landing page actions"
      className="flex flex-wrap justify-center gap-4"
    >
      {status === 'authenticated' ? (
        <Link className={primaryClass} to="/dashboard">
          Go to Dashboard
          <PrimaryIcon />
        </Link>
      ) : (
        <>
          <Link className={primaryClass} to="/onboarding">
            Get Started
            <PrimaryIcon />
          </Link>
          <Link className={secondaryClass} to="/login">
            Login
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </>
      )}
    </nav>
  )
}
