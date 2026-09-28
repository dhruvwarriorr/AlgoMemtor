import {
  ProblemReflectionResponseSchema,
  SaveReflectionRequestSchema,
} from '@algomemtor/shared-contracts'

import { featureNotEnabled, httpError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'
import { problemReference } from '@/server/http/schemas'
import { ProgressValidationError } from '@/server/services/progress-service'

export const POST = route<{ provider: string; externalId: string }>(
  { auth: 'user' },
  async ({ app, subject, params, body }) => {
    if (!app.progressEnabled) throw featureNotEnabled()
    const reference = problemReference(params)
    const input = SaveReflectionRequestSchema.safeParse(body)
    if (!input.success) {
      throw httpError(
        400,
        'INVALID_PROBLEM_REFLECTION',
        'The problem reflection is invalid.',
        { details: input.error.issues },
      )
    }
    try {
      const reflection = await app.progressService.saveReflection(
        subject,
        reference,
        input.data,
      )
      return json(ProblemReflectionResponseSchema.parse({ data: reflection }))
    } catch (error) {
      if (error instanceof ProgressValidationError) {
        throw httpError(400, 'INVALID_PROBLEM_REFLECTION', error.message)
      }
      throw error
    }
  },
)
