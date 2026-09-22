import type { ProviderKey } from '@algomemtor/shared-contracts'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const providerLabels: Record<ProviderKey, string> = {
  codeforces: 'Codeforces',
  codechef: 'CodeChef',
  leetcode: 'LeetCode',
  cses: 'CSES',
}

type SolveOnProviderLinkProps = {
  canonicalUrl: string
  provider: ProviderKey
}

export function SolveOnProviderLink({
  canonicalUrl,
  provider,
}: SolveOnProviderLinkProps) {
  const providerLabel = providerLabels[provider]

  return (
    <a
      className={cn(buttonVariants({ size: 'sm' }), 'max-w-full')}
      href={canonicalUrl}
      rel="noopener noreferrer"
      target="_blank"
    >
      Solve on {providerLabel}
    </a>
  )
}
