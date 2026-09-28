import { CorrectLearnerMemoryRequestSchema } from '@algomemtor/shared-contracts'
import { z } from 'zod'

import {
  featureNotEnabled,
  httpError,
  mapErrors,
  rethrowMemoryError,
} from '@/server/http/errors'
import { json, route } from '@/server/http/route'

export const PATCH = route<{ memoryId: string }>(
  { auth: 'user' },
  async ({ app, subject, params, body }) => {
    if (!app.progressEnabled || !app.memoryManagementEnabled) {
      throw featureNotEnabled()
    }
    const memoryId = params.memoryId
    if (!z.uuid().safeParse(memoryId).success) {
      throw httpError(
        400,
        'INVALID_MEMORY',
        'The learner memory ID is invalid.',
      )
    }
    const input = CorrectLearnerMemoryRequestSchema.safeParse(body)
    if (!input.success) {
      throw httpError(
        400,
        'INVALID_MEMORY_CORRECTION',
        'The learner memory correction is invalid.',
        { details: input.error.issues },
      )
    }
    return mapErrors(async () => {
      const result = await app.aiMemoryClient.correctMemory(
        subject,
        memoryId,
        input.data,
      )
      app.recommendationService.invalidateForLearner(subject)
      await app.persistMemoryInvalidation(subject)
      return json({
        data:
          result.memory === undefined
            ? null
            : app.publicLearnerMemory(result.memory, subject),
      })
    }, rethrowMemoryError)
  },
)
