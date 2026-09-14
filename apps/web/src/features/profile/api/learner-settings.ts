import { requestJson } from '@/features/discovery/api/client'

import {
  AiConsentResponseSchema,
  type AiConsentResponse,
  type SaveAiConsentRequest,
} from '@/features/progress/contracts'

type RequestOptions = { signal?: AbortSignal }

export function fetchAiConsent({ signal }: RequestOptions = {}) {
  return requestJson<AiConsentResponse>('/api/ai-consent', {
    authentication: 'required',
    schema: AiConsentResponseSchema,
    signal,
  })
}

export function saveAiConsent(input: SaveAiConsentRequest) {
  return requestJson<AiConsentResponse>('/api/ai-consent', {
    authentication: 'required',
    body: JSON.stringify(input),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
    schema: AiConsentResponseSchema,
  })
}

export { deleteAllData } from '@/features/progress/api/progress'
