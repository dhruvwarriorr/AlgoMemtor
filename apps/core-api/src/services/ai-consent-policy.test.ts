import { describe, expect, it } from 'vitest'

import {
  AI_CONSENT_POLICY_VERSION,
  alwaysOnAiConsent,
} from './ai-consent-policy.js'
import { InMemoryProgressRepository } from '../repositories/progress-repository.js'

const learnerId = '11111111-1111-4111-8111-111111111111'

describe('always-on AI consent policy', () => {
  it('returns the current enabled policy when no decision exists', async () => {
    const repository = new InMemoryProgressRepository()

    await expect(repository.getConsent(learnerId)).resolves.toMatchObject({
      enabled: true,
      policyVersion: AI_CONSENT_POLICY_VERSION,
    })
  })

  it('cannot persist a stale disabled decision', async () => {
    const repository = new InMemoryProgressRepository()

    await expect(
      repository.saveConsent(learnerId, false, 'phase9-progress-memory-v1'),
    ).resolves.toMatchObject({
      enabled: true,
      policyVersion: AI_CONSENT_POLICY_VERSION,
    })
    await expect(repository.getConsent(learnerId)).resolves.toMatchObject({
      enabled: true,
      policyVersion: AI_CONSENT_POLICY_VERSION,
    })
  })

  it('does not expose an account identifier in the default value', () => {
    expect(alwaysOnAiConsent()).toEqual({
      enabled: true,
      policyVersion: AI_CONSENT_POLICY_VERSION,
    })
  })
})
