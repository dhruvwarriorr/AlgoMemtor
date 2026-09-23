import {
  CoachActionProposalResponseSchema,
  CoachCheckInResponseSchema,
  CoachCheckInsResponseSchema,
  CoachConversationEnvelopeSchema,
  CoachConversationResponseSchema,
  CoachConversationsResponseSchema,
  CoachPreferencesResponseSchema,
  CoachResponseSchema,
  CoachRoadmapNoteRequestSchema,
  CoachRoadmapNoteResponseSchema,
  ConfirmCoachActionRequestSchema,
  CreateCoachConversationRequestSchema,
  ImprovementRoadmapResponseSchema,
  RoadmapRefreshResponseSchema,
  SaveCoachPreferencesRequestSchema,
  SendCoachMessageRequestSchema,
  SetCoachTopicStatusRequestSchema,
  type CoachPreferences,
  type CoachRoadmapNoteRequest,
  type ConfirmCoachActionRequest,
  type CreateCoachConversationRequest,
  type SendCoachMessageRequest,
  type SetCoachTopicStatusRequest,
} from '@algomemtor/shared-contracts'

import { requestJson } from '@/features/discovery/api/client'

type RequestOptions = { signal?: AbortSignal }

const jsonHeaders = { 'content-type': 'application/json' }

const emptyResponseSchema = {
  safeParse(value: unknown) {
    return value === null
      ? { success: true as const, data: undefined }
      : { success: false as const, error: { issues: [] } }
  },
}

export function fetchCoachConversations({ signal }: RequestOptions = {}) {
  return requestJson('/api/coach/conversations', {
    authentication: 'required',
    schema: CoachConversationsResponseSchema,
    signal,
  })
}

export function createCoachConversation(
  input: CreateCoachConversationRequest = {},
) {
  const parsed = CreateCoachConversationRequestSchema.parse(input)
  return requestJson('/api/coach/conversations', {
    authentication: 'required',
    body: JSON.stringify(parsed),
    headers: jsonHeaders,
    method: 'POST',
    schema: CoachConversationEnvelopeSchema,
  })
}

export function fetchCoachConversation(
  conversationId: string,
  { signal }: RequestOptions = {},
) {
  return requestJson(
    `/api/coach/conversations/${encodeURIComponent(conversationId)}`,
    {
      authentication: 'required',
      schema: CoachConversationResponseSchema,
      signal,
    },
  )
}

export function renameCoachConversation(conversationId: string, title: string) {
  return requestJson(
    `/api/coach/conversations/${encodeURIComponent(conversationId)}`,
    {
      authentication: 'required',
      body: JSON.stringify({ title }),
      headers: jsonHeaders,
      method: 'PATCH',
      schema: CoachConversationEnvelopeSchema,
    },
  )
}

export function deleteCoachConversation(conversationId: string) {
  return requestJson<undefined>(
    `/api/coach/conversations/${encodeURIComponent(conversationId)}`,
    {
      authentication: 'required',
      method: 'DELETE',
      schema: emptyResponseSchema,
    },
  )
}

export function sendCoachMessage(
  conversationId: string,
  input: SendCoachMessageRequest,
  options: RequestOptions = {},
) {
  const parsed = SendCoachMessageRequestSchema.parse(input)
  return requestJson(
    `/api/coach/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      authentication: 'required',
      body: JSON.stringify(parsed),
      headers: jsonHeaders,
      method: 'POST',
      schema: CoachResponseSchema,
      signal: options.signal,
    },
  )
}

export function fetchCoachRoadmap({ signal }: RequestOptions = {}) {
  return requestJson('/api/coach/roadmap', {
    authentication: 'required',
    schema: ImprovementRoadmapResponseSchema,
    signal,
  })
}

// Pulls the newest platform data, then rebuilds the plan.
export function refreshCoachRoadmap() {
  return requestJson('/api/coach/roadmap/refresh', {
    authentication: 'required',
    method: 'POST',
    schema: RoadmapRefreshResponseSchema,
  })
}

export function setCoachTopicStatus(
  topic: string,
  input: SetCoachTopicStatusRequest,
) {
  const parsed = SetCoachTopicStatusRequestSchema.parse(input)
  return requestJson(
    `/api/coach/roadmap/topics/${encodeURIComponent(topic)}/status`,
    {
      authentication: 'required',
      body: JSON.stringify(parsed),
      headers: jsonHeaders,
      method: 'PATCH',
      schema: ImprovementRoadmapResponseSchema,
    },
  )
}

export function submitCoachRoadmapNote(input: CoachRoadmapNoteRequest) {
  const parsed = CoachRoadmapNoteRequestSchema.parse(input)
  return requestJson('/api/coach/roadmap/notes', {
    authentication: 'required',
    body: JSON.stringify(parsed),
    headers: jsonHeaders,
    method: 'POST',
    schema: CoachRoadmapNoteResponseSchema,
  })
}

export function fetchCoachPreferences({ signal }: RequestOptions = {}) {
  return requestJson('/api/coach/preferences', {
    authentication: 'required',
    schema: CoachPreferencesResponseSchema,
    signal,
  })
}

export function saveCoachPreferences(
  input: Omit<CoachPreferences, 'updatedAt'>,
) {
  const parsed = SaveCoachPreferencesRequestSchema.parse(input)
  return requestJson('/api/coach/preferences', {
    authentication: 'required',
    body: JSON.stringify(parsed),
    headers: jsonHeaders,
    method: 'PUT',
    schema: CoachPreferencesResponseSchema,
  })
}

export function fetchCoachCheckIns({ signal }: RequestOptions = {}) {
  return requestJson('/api/coach/check-ins', {
    authentication: 'required',
    schema: CoachCheckInsResponseSchema,
    signal,
  })
}

export function markCoachCheckIn(
  checkInId: string,
  input: { read?: boolean; dismissed?: boolean },
) {
  return requestJson(`/api/coach/check-ins/${encodeURIComponent(checkInId)}`, {
    authentication: 'required',
    body: JSON.stringify(input),
    headers: jsonHeaders,
    method: 'PATCH',
    schema: CoachCheckInResponseSchema,
  })
}

export function confirmCoachAction(
  proposalId: string,
  input: ConfirmCoachActionRequest = { confirmation: 'CONFIRM' },
) {
  const parsed = ConfirmCoachActionRequestSchema.parse(input)
  return requestJson(
    `/api/coach/action-proposals/${encodeURIComponent(proposalId)}/confirm`,
    {
      authentication: 'required',
      body: JSON.stringify(parsed),
      headers: jsonHeaders,
      method: 'POST',
      schema: CoachActionProposalResponseSchema,
    },
  )
}
