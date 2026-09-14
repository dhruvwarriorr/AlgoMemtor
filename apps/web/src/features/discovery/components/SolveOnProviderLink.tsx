import type { ProviderKey } from '@algomemtor/shared-contracts'

import { buttonVariants } from '@/components/ui/button'
import { recordProblemAction } from '@/features/progress/api/progress'
import { cn } from '@/lib/utils'

const providerLabels: Record<ProviderKey, string> = {
  codeforces: 'Codeforces',
}

type SolveOnProviderLinkProps = {
  canonicalUrl: string
  externalId: string
  provider: ProviderKey
  recommendationItemId?: string
  sourceContext?: string
}

export function SolveOnProviderLink({
  canonicalUrl,
  provider,
  externalId,
  recommendationItemId,
  sourceContext,
}: SolveOnProviderLinkProps) {
  const providerLabel = providerLabels[provider]

  return (
    <a
      className={cn(buttonVariants({ size: 'sm' }), 'max-w-full')}
      href={canonicalUrl}
      onClick={() => {
        void recordProblemAction({
          problem: { provider, externalId },
          actionType: 'opened',
          ...(recommendationItemId === undefined
            ? {}
            : { recommendationItemId }),
          ...(sourceContext === undefined ? {} : { sourceContext }),
        }).catch(() => undefined)
      }}
      rel="noopener noreferrer"
      target="_blank"
    >
      Solve on {providerLabel}
    </a>
  )
}
