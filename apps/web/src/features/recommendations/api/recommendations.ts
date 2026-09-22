import {
  RecommendationDismissalResponseSchema,
  RecommendationDismissalsResponseSchema,
  RecommendationFeedbackInputSchema,
  RecommendationFeedbackResponseSchema,
  RecommendationFeedResponseSchema,
  RecommendationRestorationResponseSchema,
  type RecommendationFeedbackInput,
  type RecommendationFeedResponse,
} from '@algomemtor/shared-contracts'

import { requestJson } from '@/features/discovery/api/client'

type RequestOptions = {
  signal?: AbortSignal
}

export function fetchRecommendations({ signal }: RequestOptions = {}) {
  return requestJson<RecommendationFeedResponse>('/api/recommendations', {
    authentication: 'required',
    schema: RecommendationFeedResponseSchema,
    signal,
  })
}

export function refreshRecommendations() {
  return requestJson<RecommendationFeedResponse>(
    '/api/recommendations/refresh',
    {
      authentication: 'required',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({}),
      schema: RecommendationFeedResponseSchema,
    },
  )
}

export function saveRecommendationFeedback(
  itemId: string,
  input: RecommendationFeedbackInput,
) {
  const validatedInput = RecommendationFeedbackInputSchema.parse(input)

  return requestJson(
    '/api/recommendation-items/' + encodeURIComponent(itemId) + '/feedback',
    {
      authentication: 'required',
      body: JSON.stringify(validatedInput),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
      schema: RecommendationFeedbackResponseSchema,
    },
  )
}

export function dismissRecommendation(itemId: string) {
  return requestJson(
    '/api/recommendation-items/' + encodeURIComponent(itemId) + '/dismiss',
    {
      authentication: 'required',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({}),
      schema: RecommendationDismissalResponseSchema,
    },
  )
}

export function dismissProblem(provider: string, externalId: string) {
  return requestJson(
    '/api/recommendation-dismissals/' +
      encodeURIComponent(provider) +
      '/' +
      encodeURIComponent(externalId),
    {
      authentication: 'required',
      method: 'POST',
      schema: RecommendationDismissalResponseSchema,
    },
  )
}

export function fetchRecommendationDismissals({ signal }: RequestOptions = {}) {
  return requestJson('/api/recommendation-dismissals', {
    authentication: 'required',
    schema: RecommendationDismissalsResponseSchema,
    signal,
  })
}

export function restoreRecommendationDismissal(
  provider: string,
  externalId: string,
) {
  return requestJson(
    '/api/recommendation-dismissals/' +
      encodeURIComponent(provider) +
      '/' +
      encodeURIComponent(externalId),
    {
      authentication: 'required',
      method: 'DELETE',
      schema: RecommendationRestorationResponseSchema,
    },
  )
}
