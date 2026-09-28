import { createHash, randomUUID } from 'node:crypto'

import {
  LearnerProfileResponseSchema,
  SaveLearnerProfileRequestSchema,
} from '@algomemtor/shared-contracts'

import { httpError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'
import { ProgressOutboxUnavailableError } from '@/server/services/progress-service'

export const GET = route({ auth: 'user' }, async ({ app, subject }) =>
  json(
    LearnerProfileResponseSchema.parse({
      data: await app.learnerProfileRepository.findByAuthUserId(subject),
    }),
  ),
)

export const PUT = route({ auth: 'user' }, async ({ app, subject, body }) => {
  const profileResult = SaveLearnerProfileRequestSchema.safeParse(body)
  if (!profileResult.success) {
    throw httpError(
      400,
      'INVALID_LEARNER_PROFILE',
      'The learner profile is invalid.',
      { details: profileResult.error.issues },
    )
  }

  const previousProfile =
    await app.learnerProfileRepository.findByAuthUserId(subject)
  const profile = await app.learnerProfileRepository.upsertByAuthUserId(
    subject,
    profileResult.data,
  )
  if (
    (profile.recommendationPreference !== undefined ||
      previousProfile !== null) &&
    app.memoryGenerationEnabled
  ) {
    try {
      const preferenceHash = createHash('sha256')
        .update(profile.recommendationPreference ?? 'empty')
        .digest('hex')
        .slice(0, 32)
      const profileChangeId = randomUUID().replaceAll('-', '')
      await app.progressRepository.enqueueJob({
        authUserId: subject,
        jobType: 'memory_generation',
        evidenceType: 'profile_preference',
        evidenceId: randomUUID(),
        idempotencyKey: `memory:profile_preference:${subject}:${preferenceHash}:${profileChangeId}`,
      })
    } catch {
      app.logger.warn('memory_outbox_enqueue_failed', {
        evidenceType: 'profile_preference',
        errorCode: 'OUTBOX_UNAVAILABLE',
      })
      throw new ProgressOutboxUnavailableError()
    }
  }

  return json(LearnerProfileResponseSchema.parse({ data: profile }))
})
