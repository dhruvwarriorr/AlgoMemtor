import {
  LearnerProfileResponseSchema,
  type LearnerProfileResponse,
  type SaveLearnerProfileRequest,
} from '@algomemtor/shared-contracts'

import { requestJson } from '@/features/discovery/api/client'

type RequestOptions = {
  signal?: AbortSignal
}

export function fetchLearnerProfile({ signal }: RequestOptions = {}) {
  return requestJson<LearnerProfileResponse>('/api/learner-profile', {
    authentication: 'required',
    schema: LearnerProfileResponseSchema,
    signal,
  })
}

export function saveLearnerProfile(profile: SaveLearnerProfileRequest) {
  return requestJson<LearnerProfileResponse>('/api/learner-profile', {
    authentication: 'required',
    body: JSON.stringify(profile),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
    schema: LearnerProfileResponseSchema,
  })
}

export function learnerProfileErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return 'The learner profile could not be loaded. Please try again.'
}
