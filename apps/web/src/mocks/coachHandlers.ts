import {
  CoachActionProposalResponseSchema,
  CoachCheckInResponseSchema,
  CoachCheckInsResponseSchema,
  CoachConversationEnvelopeSchema,
  CoachConversationResponseSchema,
  CoachConversationsResponseSchema,
  CoachMessageSchema,
  CoachPreferencesResponseSchema,
  CoachResponseSchema,
  CoachRoadmapNoteResponseSchema,
  ImprovementRoadmapResponseSchema,
  type CoachConversation,
  type CoachMessage,
  type CoachPreferences,
  type ImprovementRoadmap,
} from '@algomemtor/shared-contracts'
import { http, HttpResponse, type RequestHandler } from 'msw'

import { problemFixtures } from './fixtures/problems'

const now = () => new Date().toISOString()
const id = (seed?: string) => {
  void seed
  return crypto.randomUUID()
}

const conversations = new Map<string, CoachConversation>()
const messages = new Map<string, CoachMessage[]>()
const preferences: CoachPreferences = {
  weeklyEnabled: false,
  weeklyDay: 0,
  weeklyTime: '09:00',
  eventEnabled: false,
  timezone: 'UTC',
  updatedAt: now(),
}

function conversationFor(idValue: string) {
  const existing = conversations.get(idValue)
  if (existing !== undefined) return existing
  const timestamp = now()
  const created: CoachConversation = {
    id: idValue,
    title: 'New coaching conversation',
    createdAt: timestamp,
    updatedAt: timestamp,
    messageCount: 0,
  }
  conversations.set(idValue, created)
  return created
}

function roadmap(): ImprovementRoadmap {
  const timestamp = now()
  const suggestionProblems = problemFixtures
    .filter((problem) => problem.learnerStatus !== 'solved')
    .slice(0, 5)
  return ImprovementRoadmapResponseSchema.shape.data.parse({
    id: id('coach-roadmap'),
    version: 1,
    assessmentVersion: 'topic-assessment-v1',
    topics: [
      {
        topic: 'arrays',
        name: 'Arrays',
        lane: 'current_focus',
        manualStatus: 'working_on',
        assessment: 'developing',
        score: 0.58,
        confidence: 0.62,
        reason:
          'Your current focus is Arrays. Keep building breadth before increasing difficulty.',
        evidence: {
          uniqueProblems: 4,
          solvedProblems: 2,
          attemptedProblems: 4,
          acceptedSubmissions: 3,
          totalSubmissions: 5,
          contestSignals: 0,
          recentDays: 3,
          completeness: 'partial',
          stale: false,
          lastEvidenceAt: timestamp,
        },
        prerequisites: ['implementation'],
        suggestions: suggestionProblems.map((problem, index) => ({
          id: id(`suggestion-${index}`),
          problem,
          reason: 'A small foundation step for your current Arrays focus.',
          band: index < 2 ? 'foundation' : index < 4 ? 'target' : 'stretch',
          status: 'suggested',
          createdAt: timestamp,
        })),
        updatedAt: timestamp,
      },
      {
        topic: 'graphs',
        name: 'Graphs',
        lane: 'recommended_next',
        assessment: 'insufficient_evidence',
        score: 0.38,
        confidence: 0.25,
        reason:
          'There are not yet three concrete Graphs problems in the observed history.',
        evidence: {
          uniqueProblems: 1,
          solvedProblems: 1,
          attemptedProblems: 1,
          acceptedSubmissions: 1,
          totalSubmissions: 1,
          contestSignals: 0,
          recentDays: 0,
          completeness: 'partial',
          stale: false,
        },
        prerequisites: ['recursion-and-backtracking'],
        suggestions: [],
        updatedAt: timestamp,
      },
    ],
    dataCompleteness: 'partial',
    staleProviders: [],
    generatedAt: timestamp,
  })
}

export const coachHandlers: RequestHandler[] = [
  http.get('/api/coach/conversations', () =>
    HttpResponse.json(
      CoachConversationsResponseSchema.parse({
        data: [...conversations.values()],
      }),
    ),
  ),
  http.post('/api/coach/conversations', async ({ request }) => {
    const payload = (await request.json().catch(() => ({}))) as {
      title?: string
    }
    const conversation = conversationFor(id(String(conversations.size + 1)))
    if (typeof payload.title === 'string' && payload.title.trim())
      conversation.title = payload.title.trim()
    return HttpResponse.json(
      CoachConversationEnvelopeSchema.parse({ data: conversation }),
      { status: 201 },
    )
  }),
  http.get('/api/coach/conversations/:conversationId', ({ params }) => {
    const conversationId = String(params.conversationId)
    return HttpResponse.json(
      CoachConversationResponseSchema.parse({
        data: conversationFor(conversationId),
        messages: messages.get(conversationId) ?? [],
      }),
    )
  }),
  http.patch(
    '/api/coach/conversations/:conversationId',
    async ({ params, request }) => {
      const conversation = conversationFor(String(params.conversationId))
      const payload = (await request.json().catch(() => ({}))) as {
        title?: string
      }
      if (typeof payload.title === 'string' && payload.title.trim())
        conversation.title = payload.title.trim()
      return HttpResponse.json(
        CoachConversationEnvelopeSchema.parse({ data: conversation }),
      )
    },
  ),
  http.delete('/api/coach/conversations/:conversationId', ({ params }) => {
    const conversationId = String(params.conversationId)
    conversations.delete(conversationId)
    messages.delete(conversationId)
    return new HttpResponse(null, { status: 204 })
  }),
  http.post(
    '/api/coach/conversations/:conversationId/messages',
    async ({ params, request }) => {
      const conversationId = String(params.conversationId)
      const payload = (await request.json().catch(() => ({}))) as {
        content?: string
        transientContext?: string
      }
      const conversation = conversationFor(conversationId)
      const timestamp = now()
      const userMessage = CoachMessageSchema.parse({
        id: id(`user-${Date.now()}`),
        role: 'user',
        content: payload.content ?? 'Question',
        ...(payload.transientContext ? { transientContextOmitted: true } : {}),
        evidence: [],
        proposals: [],
        createdAt: timestamp,
      })
      const assistant = CoachMessageSchema.parse({
        id: id(`assistant-${Date.now()}`),
        role: 'assistant',
        content:
          'Mock coach response: start with one focused problem, explain your approach aloud, and record whether the blocker was implementation, insight, or debugging.',
        evidence: [
          {
            source: 'roadmap',
            label: 'Your roadmap',
            detail: 'This mock response is grounded in the current roadmap.',
            completeness: 'partial',
            stale: false,
          },
        ],
        proposals: [],
        richContent: {
          version: 'coach-rich-v2',
          blocks: [
            {
              type: 'metric_grid',
              title: 'Your current signal',
              metrics: [
                {
                  label: 'Current focus',
                  value: 'Arrays',
                  detail: 'Manual roadmap statuses remain authoritative.',
                  citationIds: ['roadmap-assessment'],
                },
                {
                  label: 'Observed solves',
                  value: 2,
                  detail: 'Observed records, not an assumed complete history.',
                  citationIds: ['roadmap-assessment'],
                },
              ],
            },
            {
              type: 'chart',
              datasetId: 'topic-assessments',
              chartType: 'bar',
              title: 'Topic readiness comparison',
              summary: 'Deterministic assessment signals from your roadmap.',
              series: [
                { key: 'score', label: 'Assessment score' },
                { key: 'confidence', label: 'Confidence' },
              ],
              points: [
                {
                  label: 'Arrays',
                  values: { score: 58, confidence: 62 },
                },
                {
                  label: 'Graphs',
                  values: { score: 38, confidence: 25 },
                },
              ],
              citationIds: ['roadmap-assessment'],
            },
          ],
          citations: [
            {
              id: 'roadmap-assessment',
              source: 'learner',
              title: 'Roadmap assessment',
              detail: 'Mock deterministic assessment.',
              retrievedAt: timestamp,
              stale: true,
            },
          ],
          suggestedQuestions: [
            'Give me a progressive hint for Arrays.',
            'Turn this into a focused 30-minute practice plan.',
          ],
          generatedAt: timestamp,
          dataAsOf: timestamp,
          completeness: 'partial',
          stale: true,
        },
        createdAt: now(),
      })
      const history = [
        ...(messages.get(conversationId) ?? []),
        userMessage,
        assistant,
      ]
      messages.set(conversationId, history)
      conversation.messageCount = history.length
      conversation.updatedAt = assistant.createdAt
      return HttpResponse.json(
        CoachResponseSchema.parse({ message: assistant, roadmap: roadmap() }),
      )
    },
  ),
  http.get('/api/coach/roadmap', () =>
    HttpResponse.json(
      ImprovementRoadmapResponseSchema.parse({ data: roadmap() }),
    ),
  ),
  http.patch('/api/coach/roadmap/topics/:topic/status', () =>
    HttpResponse.json(
      ImprovementRoadmapResponseSchema.parse({ data: roadmap() }),
    ),
  ),
  http.post('/api/coach/roadmap/notes', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      note?: string
    }
    const note = (body.note ?? '').toLowerCase()
    const matchedTopic = roadmap().topics.find((candidate) =>
      note.includes(candidate.name.toLowerCase()),
    )
    const status =
      matchedTopic === undefined
        ? null
        : /skip|stop|not interested/.test(note)
          ? 'skip_for_now'
          : /good|comfortable|know this|practiced|mastered|done/.test(note)
            ? 'practiced'
            : /revisit|rusty|unsure|come back/.test(note)
              ? 'revisit'
              : null
    return HttpResponse.json(
      CoachRoadmapNoteResponseSchema.parse({
        data: {
          topic: matchedTopic?.topic ?? null,
          note: body.note ?? '',
          previousStatus: matchedTopic?.manualStatus ?? null,
          status,
          statusChanged: status !== null,
          rationale:
            matchedTopic === undefined
              ? "The note didn't clearly name a topic from your learning plan, so nothing was updated."
              : status === null
                ? "The note didn't clearly indicate a status change, so nothing was updated."
                : `Your note suggested marking ${matchedTopic.name} as "${status.replaceAll('_', ' ')}".`,
          createdAt: now(),
        },
      }),
    )
  }),
  http.get('/api/coach/preferences', () =>
    HttpResponse.json(
      CoachPreferencesResponseSchema.parse({ data: preferences }),
    ),
  ),
  http.put('/api/coach/preferences', async ({ request }) => {
    Object.assign(
      preferences,
      (await request.json().catch(() => ({}))) as Partial<CoachPreferences>,
      { updatedAt: now() },
    )
    return HttpResponse.json(
      CoachPreferencesResponseSchema.parse({ data: preferences }),
    )
  }),
  http.get('/api/coach/check-ins', () =>
    HttpResponse.json(
      CoachCheckInsResponseSchema.parse({ data: [], meta: { unread: 0 } }),
    ),
  ),
  http.patch('/api/coach/check-ins/:checkInId', () =>
    HttpResponse.json(
      CoachCheckInResponseSchema.parse({
        data: {
          id: id('check-in'),
          type: 'weekly_review',
          title: 'Weekly review',
          content: 'No new check-in.',
          evidence: [],
          read: true,
          createdAt: now(),
        },
      }),
    ),
  ),
  http.post('/api/coach/action-proposals/:proposalId/confirm', ({ params }) =>
    HttpResponse.json(
      CoachActionProposalResponseSchema.parse({
        data: {
          id: String(params.proposalId),
          actionType: 'set_topic_status',
          status: 'confirmed',
          label: 'Update roadmap',
          reason: 'Confirmed in mock mode.',
          topic: 'arrays',
          topicStatus: 'working_on',
        },
      }),
    ),
  ),
]
