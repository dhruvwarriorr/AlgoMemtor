import { useEffect, useRef } from 'react'
import type { ProviderKey } from '@algomemtor/shared-contracts'

import { recordProblemAction } from '@/features/progress/api/progress'

type RecommendationImpressionOptions = {
  provider: ProviderKey
  externalId: string
  recommendationItemId: string
}

export function hasVisibleImpression(
  entries: readonly Pick<
    IntersectionObserverEntry,
    'isIntersecting' | 'intersectionRatio'
  >[],
) {
  return entries.some(
    (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5,
  )
}

export function useRecommendationImpression({
  externalId,
  provider,
  recommendationItemId,
}: RecommendationImpressionOptions) {
  const cardRef = useRef<HTMLElement | null>(null)
  const recordedRef = useRef(false)

  useEffect(() => {
    const element = cardRef.current
    if (
      element === null ||
      recordedRef.current ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (recordedRef.current || !hasVisibleImpression(entries)) {
          return
        }

        recordedRef.current = true
        void recordProblemAction({
          actionType: 'impression',
          problem: { provider, externalId },
          recommendationItemId,
        }).catch(() => undefined)
        observer.disconnect()
      },
      { threshold: [0.5] },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [externalId, provider, recommendationItemId])

  return cardRef
}
