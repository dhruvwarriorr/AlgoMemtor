import type { ProviderKey } from '@algomemtor/shared-contracts'

import { ArrowUpRight } from 'lucide-react'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
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
      <ProviderLogo className="size-3.5" provider={provider} />
      Solve on {providerLabel}
      <ArrowUpRight aria-hidden="true" />
    </a>
  )
}
