import type { ProviderKey } from '@algomemtor/shared-contracts'
import { siCodechef, siCodeforces, siLeetcode } from 'simple-icons'

import csesLogo from '@/assets/cses-logo.png'
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

// Official marks from Simple Icons. CSES is not in Simple Icons, so its
// wordmark ships as an image, drawn a little wider than the square footprint
// so the letters stay legible.
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
        <img
          alt=""
          className="h-auto w-[140%] max-w-none object-contain drop-shadow-[0_0_0.6px_rgb(0_0_0/0.55)]"
          draggable={false}
          src={csesLogo}
        />
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
