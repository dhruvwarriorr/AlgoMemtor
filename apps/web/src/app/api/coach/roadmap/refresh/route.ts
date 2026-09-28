import { RoadmapRefreshResponseSchema } from '@algomemtor/shared-contracts'

import {
  deletionPending,
  mapErrors,
  rethrowCoachError,
} from '@/server/http/errors'
import { json, route } from '@/server/http/route'

// Pull the newest data from every linked platform, then rebuild the plan.
// Each platform refresh is bounded and rate-limited by the live refresh
// service; one failing platform never fails the whole refresh.
export const POST = route({ auth: 'user' }, async ({ app, subject }) =>
  mapErrors(async () => {
    if (await app.progressRepository.hasPendingDeletion(subject)) {
      throw deletionPending()
    }
    const accounts =
      await app.providerAccountRepository.findAllByAuthUserId(subject)
    const platforms = await Promise.all(
      accounts.map(async (account) => {
        try {
          const result = await app.coachLiveRefresh.refresh(
            subject,
            account.provider,
          )
          return {
            provider: account.provider,
            status:
              result.status === 'not_linked'
                ? ('unavailable' as const)
                : result.status,
          }
        } catch {
          return {
            provider: account.provider,
            status: 'unavailable' as const,
          }
        }
      }),
    )
    const roadmap = await app.coachService.refreshRoadmap(subject)
    // New evidence and focus should reach the next recommendation batch.
    app.recommendationService.invalidateForLearner(subject)
    return json(
      RoadmapRefreshResponseSchema.parse({
        data: roadmap,
        meta: { platforms },
      }),
    )
  }, rethrowCoachError),
)
