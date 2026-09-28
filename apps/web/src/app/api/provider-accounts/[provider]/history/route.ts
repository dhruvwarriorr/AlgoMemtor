import { LinkableProviderSchema } from '@algomemtor/shared-contracts'

import { httpError } from '@/server/http/errors'
import { noContent, route } from '@/server/http/route'
import { ProgressOutboxUnavailableError } from '@/server/services/progress-service'

export const DELETE = route<{ provider: string }>(
  { auth: 'user' },
  async ({ app, subject, params }) => {
    const providerResult = LinkableProviderSchema.safeParse(params.provider)
    if (!providerResult.success) {
      throw httpError(
        400,
        'UNSUPPORTED_LINK_PROVIDER',
        'That provider does not have deletable history.',
      )
    }
    const provider = providerResult.data
    let deletedExternalIds: string[]
    try {
      deletedExternalIds = await app.queueProviderHistoryMemoryDeletion(
        subject,
        provider,
      )
    } catch (error) {
      if (error instanceof ProgressOutboxUnavailableError) {
        throw httpError(
          503,
          'OUTBOX_UNAVAILABLE',
          'Provider history deletion is temporarily unavailable. Try again shortly.',
          { retryable: true },
        )
      }
      throw error
    }
    await app.providerSyncService.deleteHistory(subject, provider)
    await app.providerAccountRepository.deleteHistoryByAuthUserId(
      subject,
      provider,
    )
    await app.providerProfileRepository.deleteByAuthUserId(subject, provider)
    await app.providerDataRepository.deleteByAuthUserId(subject, provider)
    await app.problemActionRepository.deleteProviderVerifiedByAuthUserId(
      subject,
      provider,
    )
    for (const externalId of deletedExternalIds) {
      await app.recommendationRepository.deleteFeedbackByProblem(
        subject,
        provider,
        externalId,
      )
    }
    await app.refreshLearnerActivity(subject)
    return noContent()
  },
)
