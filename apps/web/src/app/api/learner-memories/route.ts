import {
  CreateLearnerMemoryRequestSchema,
  LearnerMemoriesResponseSchema,
} from '@algomemtor/shared-contracts'

import {
  featureNotEnabled,
  httpError,
  mapErrors,
  rethrowMemoryError,
} from '@/server/http/errors'
import { json, route } from '@/server/http/route'
import { AiMemoryClientError } from '@/server/integrations/ai/ai-memory-client'

export const GET = route({ auth: 'user' }, async ({ app, subject }) => {
  if (!app.progressEnabled || !app.memoryManagementEnabled) {
    throw featureNotEnabled()
  }
  return mapErrors(async () => {
    const [records, pendingJobs] = await Promise.all([
      app.aiMemoryClient.listMemories(subject),
      app.progressRepository.pendingJobCount(subject),
    ])
    return json(
      LearnerMemoriesResponseSchema.parse({
        data: records.map((record) => app.publicLearnerMemory(record, subject)),
        meta: { pendingJobs },
      }),
    )
  }, rethrowMemoryError)
})

export const POST = route(
  { auth: 'user' },
  async ({ app, subject, body, requestId }) => {
    if (!app.progressEnabled || !app.memoryManagementEnabled) {
      throw featureNotEnabled()
    }
    const input = CreateLearnerMemoryRequestSchema.safeParse(body)
    if (!input.success) {
      throw httpError(
        400,
        'INVALID_MEMORY_INPUT',
        'Learner memory text must be between 1 and 500 characters.',
        { details: input.error.issues },
      )
    }
    return mapErrors(async () => {
      const client = app.aiMemoryClient
      if (client.createUserMemory === undefined) {
        throw new AiMemoryClientError('AI_MEMORY_NOT_CONFIGURED')
      }
      const result = await client.createUserMemory(
        subject,
        requestId,
        input.data.text,
      )
      if (result.memory === undefined) {
        throw new AiMemoryClientError('AI_MEMORY_INVALID_RESPONSE')
      }
      app.recommendationService.invalidateForLearner(subject)
      await app.persistMemoryInvalidation(subject)
      return json(
        { data: app.publicLearnerMemory(result.memory, subject) },
        201,
      )
    }, rethrowMemoryError)
  },
)
