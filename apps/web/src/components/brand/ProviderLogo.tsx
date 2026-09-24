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

// Official marks from Simple Icons. CSES is not in Simple Icons, so this
// monochrome wordmark uses original paths inspired by its wide lettering.
function ProviderLogo({ provider, className, title }: ProviderLogoProps) {
  if (provider === 'cses') {
    return (
      <span
        aria-hidden={title ? undefined : true}
        aria-label={title}
        className={cn(
          'inline-grid size-6 shrink-0 place-items-center overflow-visible',
          className,
        )}
        role={title ? 'img' : undefined}
      >
        <svg
          aria-hidden="true"
          className="h-auto w-[140%] max-w-none"
          fill="none"
          stroke="currentColor"
          strokeLinecap="square"
          strokeLinejoin="miter"
          strokeWidth="4.5"
          viewBox="0 0 96 32"
        >
          <path d="M22 5H11C6 5 4 9 4 16S6 27 11 27h11" />
          <path d="M44 5H32c-5 0-7 2-7 6 0 3 2 5 6 6l7 2c4 1 6 3 6 5 0 3-2 5-7 5H25" />
          <path d="M67 5H49v22h18M49 16h15" />
          <path d="M91 5H79c-5 0-7 2-7 6 0 3 2 5 6 6l7 2c4 1 6 3 6 5 0 3-2 5-7 5H72" />
        </svg>
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
