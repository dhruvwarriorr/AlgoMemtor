import type { ProviderKey } from '@algomemtor/shared-contracts'
import { siCodechef, siCodeforces, siLeetcode } from 'simple-icons'

import { cn } from '@/lib/utils'

const simpleIcons = {
  codeforces: siCodeforces,
  leetcode: siLeetcode,
  codechef: siCodechef,
} as const

type ProviderLogoProps = {
  provider: ProviderKey
  className?: string
  title?: string
}

// Official marks from Simple Icons. CSES publishes no logo, so it gets a
// typographic mark in the same footprint.
function ProviderLogo({ provider, className, title }: ProviderLogoProps) {
  if (provider === 'cses') {
    return (
      <span
        aria-hidden={title ? undefined : true}
        aria-label={title}
        className={cn(
          'inline-grid size-6 shrink-0 place-items-center rounded-sm bg-current',
          className,
        )}
        role={title ? 'img' : undefined}
      >
        <span className="font-mono text-[0.42em] leading-none font-bold tracking-tight text-background">
          CSES
        </span>
      </span>
    )
  }

  const icon = simpleIcons[provider]

  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn('size-6 shrink-0', className)}
      fill="currentColor"
      role={title ? 'img' : undefined}
      viewBox="0 0 24 24"
    >
      <path d={icon.path} />
    </svg>
  )
}

export { ProviderLogo }
