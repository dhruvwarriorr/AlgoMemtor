import {
  AiConsentResponseSchema,
  SaveAiConsentRequestSchema,
} from '@algomemtor/shared-contracts'

import { featureNotEnabled, httpError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'
import { COACH_POLICY_VERSION } from '@/server/services/coach-service'

export const GET = route({ auth: 'user' }, async ({ app, subject }) => {
  if (!app.progressEnabled) throw featureNotEnabled()
  return json(
    AiConsentResponseSchema.parse(
      await app.progressService.getConsent(subject),
    ),
  )
})

export const PUT = route({ auth: 'user' }, async ({ app, subject, body }) => {
  if (!app.progressEnabled) throw featureNotEnabled()
  const input = SaveAiConsentRequestSchema.safeParse(body)
  if (!input.success) {
    throw httpError(
      400,
      'INVALID_AI_CONSENT',
      'The personalized AI coaching choice is invalid.',
      { details: input.error.issues },
    )
  }
  if (!input.data.enabled) {
    throw httpError(
      400,
      'AI_COACHING_ALWAYS_ON',
      'Personalized AI coaching and learner memory are always enabled. Use the memory controls or data reset to remove learner data.',
    )
  }
  if (input.data.policyVersion !== COACH_POLICY_VERSION) {
    throw httpError(
      400,
      'AI_CONSENT_POLICY_VERSION_REQUIRED',
      'The personalized coaching policy version is outdated. Refresh and try again.',
    )
  }
  return json(
    await app.progressService.saveConsent(
      subject,
      input.data.enabled,
      input.data.policyVersion,
    ),
  )
})
