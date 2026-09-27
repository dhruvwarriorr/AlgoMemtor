import { platformTier, type ProviderKey } from '@algomemtor/shared-contracts'

import { cn } from '@/lib/utils'

// A learner's standing beside a rating: CodeChef stars, a LeetCode contest
// badge, or a Codeforces title. Nothing renders for unrated platforms.

function LeetCodeBadgeIcon({ badge }: { badge: 'knight' | 'guardian' }) {
  return (
    <svg
      aria-hidden="true"
      className="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
    >
      {/* A shield; the Guardian's carries a crown, the Knight's a sword. */}
      <path d="M12 3l7 3v5c0 4.4-3 8.3-7 10-4-1.7-7-5.6-7-10V6z" />
      {badge === 'guardian' ? (
        <path d="M8.5 13.5l1-4 2.5 2 2.5-2 1 4z" fill="currentColor" />
      ) : (
        <path d="M12 7.5v8M9.5 13h5" />
      )}
    </svg>
  )
}

export function PlatformTierBadge({
  provider,
  rating,
  rank,
  size = 'sm',
  className,
}: {
  provider: ProviderKey
  rating?: number | undefined
  rank?: string | undefined
  size?: 'sm' | 'md'
  className?: string
}) {
  const tier = platformTier({ provider, rating, rank })
  if (tier === undefined) return null
  const tone = {
    color: tier.color,
    background: `color-mix(in oklab, ${tier.color} 13%, transparent)`,
    borderColor: `color-mix(in oklab, ${tier.color} 30%, transparent)`,
  }
  const base = cn(
    'inline-flex shrink-0 items-center gap-1 rounded-full border font-semibold whitespace-nowrap',
    size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[0.65rem]',
    className,
  )

  if (tier.kind === 'stars') {
    return (
      <span
        aria-label={`CodeChef ${tier.stars} star`}
        className={base}
        style={tone}
        title={`CodeChef ${tier.stars}★ (from your rating)`}
      >
        <span aria-hidden="true" className="tracking-[-0.06em]">
          {'★'.repeat(tier.stars)}
        </span>
      </span>
    )
  }

  if (tier.kind === 'badge') {
    return (
      <span
        className={cn(base, tier.badge === 'none' && 'font-medium')}
        style={tone}
        title={
          tier.badge === 'none'
            ? 'LeetCode awards Knight to the top 25% of contest ratings and Guardian to the top 5%.'
            : `LeetCode ${tier.label} contest badge`
        }
      >
        {tier.badge === 'none' ? null : (
          <LeetCodeBadgeIcon badge={tier.badge} />
        )}
        {tier.label}
      </span>
    )
  }

  return (
    <span className={cn(base, 'capitalize')} style={tone}>
      {tier.label}
    </span>
  )
}
