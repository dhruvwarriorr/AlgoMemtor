import { AiConsentSchema, type AiConsent } from '@algomemtor/shared-contracts'

/**
 * Personalized coaching and learner memory are product-default capabilities.
 * Provider account and activity consent remain separate policies.
 */
export const AI_CONSENT_POLICY_VERSION = 'personalized-coaching-rag-v2'

export const alwaysOnAiConsent = (decidedAt?: Date): AiConsent =>
  AiConsentSchema.parse({
    enabled: true,
    policyVersion: AI_CONSENT_POLICY_VERSION,
    ...(decidedAt === undefined ? {} : { decidedAt: decidedAt.toISOString() }),
  })
