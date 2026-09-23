import { z } from 'zod'

import {
  CoachActionProposalSchema,
  CoachCheckInTypeSchema,
  CoachEvidenceReferenceSchema,
  CoachCitationSchema,
  CoachRichContentSchema,
  type SendCoachMessageRequest,
} from '@algomemtor/shared-contracts'

const coachDatasetIdSchema = z.enum([
  'learner-summary',
  'topic-assessments',
  'practice-trend-30d',
  'contest-rating-history',
  'trusted-problems',
  'topic-comparison',
])

const coachPresentationSchema = z
  .object({
    datasetIds: z.array(coachDatasetIdSchema).max(6),
    problemIds: z
      .array(
        z
          .string()
          .trim()
          .regex(/^(?:codeforces|codechef|leetcode|cses):[^\s:][^\s]{0,127}$/),
      )
      .max(5),
    webProblemCitationIds: z
      .array(
        z
          .string()
          .trim()
          .regex(/^web-[1-9][0-9]{0,2}$/),
      )
      .max(5)
      .optional(),
    suggestedQuestions: z.array(z.string().trim().min(1).max(240)).max(4),
  })
  .strict()

const aiCoachResponseSchema = z
  .object({
    answer: z.string().trim().min(1).max(12_000),
    evidence: z.array(CoachEvidenceReferenceSchema).max(12),
    proposals: z.array(CoachActionProposalSchema).max(8),
    citations: z.array(CoachCitationSchema).max(8).optional(),
    presentation: coachPresentationSchema.optional(),
    richContent: CoachRichContentSchema.optional(),
    fallback: z.boolean().optional(),
  })
  .strict()

const aiCoachCheckInResponseSchema = z
  .object({
    content: z.string().trim().min(1).max(4_000),
    evidence: z.array(CoachEvidenceReferenceSchema).max(12),
  })
  .strict()

export type AiCoachRequest = {
  requestId: string
  learnerId: string
  conversationId: string
  question: string
  transientContext?: string
  transientMedia?: SendCoachMessageRequest['transientMedia']
  context: Record<string, unknown>
  workspace?: object
}

export type AiCoachResult = z.infer<typeof aiCoachResponseSchema>
export type AiCoachCheckInRequest = {
  requestId: string
  learnerId: string
  conversationId: string
  type: z.infer<typeof CoachCheckInTypeSchema>
  title: string
  deterministicContent: string
  evidence: z.infer<typeof CoachEvidenceReferenceSchema>[]
  context: Record<string, unknown>
}
export type AiCoachCheckInResult = z.infer<typeof aiCoachCheckInResponseSchema>

export interface AiCoachClient {
  respond(request: AiCoachRequest): Promise<AiCoachResult>
  generateCheckIn?(
    request: AiCoachCheckInRequest,
  ): Promise<AiCoachCheckInResult>
  deleteConversation?(learnerId: string, conversationId: string): Promise<void>
  deleteLearnerAudits?(learnerId: string): Promise<void>
}

export class AiCoachClientError extends Error {
  constructor(
    readonly code: string,
    message = 'The AI coach is unavailable.',
  ) {
    super(message)
    this.name = 'AiCoachClientError'
  }
}

export class UnavailableAiCoachClient implements AiCoachClient {
  async respond(): Promise<AiCoachResult> {
    throw new AiCoachClientError('AI_COACH_NOT_CONFIGURED')
  }

  async generateCheckIn(): Promise<AiCoachCheckInResult> {
    throw new AiCoachClientError('AI_COACH_NOT_CONFIGURED')
  }

  async deleteConversation(): Promise<void> {
    return
  }

  async deleteLearnerAudits(): Promise<void> {
    return
  }
}

export class HttpAiCoachClient implements AiCoachClient {
  constructor(
    private readonly options: {
      baseUrl: string
      internalServiceToken: string
      timeoutMs?: number
      fetchImplementation?: typeof fetch
    },
  ) {}

  async respond(request: AiCoachRequest) {
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(new Error('AI coach timed out.')),
      this.options.timeoutMs ?? 125_000,
    )
    try {
      const response = await (this.options.fetchImplementation ?? fetch)(
        new URL('/internal/coach/respond', this.options.baseUrl),
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-internal-service-token': this.options.internalServiceToken,
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        },
      )
      if (!response.ok) {
        throw new AiCoachClientError(
          response.status === 429
            ? 'AI_COACH_RATE_LIMITED'
            : 'AI_COACH_UNAVAILABLE',
        )
      }
      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        throw new AiCoachClientError('AI_COACH_INVALID_RESPONSE')
      }
      const parsed = aiCoachResponseSchema.safeParse(payload)
      if (!parsed.success) {
        throw new AiCoachClientError('AI_COACH_INVALID_RESPONSE')
      }
      return parsed.data
    } catch (error) {
      if (error instanceof AiCoachClientError) throw error
      throw new AiCoachClientError(
        error instanceof DOMException && error.name === 'AbortError'
          ? 'AI_COACH_TIMEOUT'
          : 'AI_COACH_TRANSPORT_ERROR',
      )
    } finally {
      clearTimeout(timeout)
    }
  }

  async generateCheckIn(request: AiCoachCheckInRequest) {
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(new Error('AI coach timed out.')),
      this.options.timeoutMs ?? 125_000,
    )
    try {
      const response = await (this.options.fetchImplementation ?? fetch)(
        new URL('/internal/coach/check-ins/generate', this.options.baseUrl),
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-internal-service-token': this.options.internalServiceToken,
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        },
      )
      if (!response.ok) {
        throw new AiCoachClientError('AI_COACH_UNAVAILABLE')
      }
      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        throw new AiCoachClientError('AI_COACH_INVALID_RESPONSE')
      }
      const parsed = aiCoachCheckInResponseSchema.safeParse(payload)
      if (!parsed.success) {
        throw new AiCoachClientError('AI_COACH_INVALID_RESPONSE')
      }
      return parsed.data
    } catch (error) {
      if (error instanceof AiCoachClientError) throw error
      throw new AiCoachClientError(
        error instanceof DOMException && error.name === 'AbortError'
          ? 'AI_COACH_TIMEOUT'
          : 'AI_COACH_TRANSPORT_ERROR',
      )
    } finally {
      clearTimeout(timeout)
    }
  }

  async deleteConversation(learnerId: string, conversationId: string) {
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(new Error('AI coach deletion timed out.')),
      this.options.timeoutMs ?? 20_000,
    )
    try {
      const response = await (this.options.fetchImplementation ?? fetch)(
        new URL(
          `/internal/coach/conversations/${encodeURIComponent(learnerId)}/${encodeURIComponent(conversationId)}`,
          this.options.baseUrl,
        ),
        {
          method: 'DELETE',
          headers: {
            'x-internal-service-token': this.options.internalServiceToken,
          },
          signal: controller.signal,
        },
      )
      if (!response.ok) {
        throw new AiCoachClientError('AI_COACH_DELETE_UNAVAILABLE')
      }
    } catch (error) {
      if (error instanceof AiCoachClientError) throw error
      throw new AiCoachClientError(
        error instanceof DOMException && error.name === 'AbortError'
          ? 'AI_COACH_DELETE_TIMEOUT'
          : 'AI_COACH_DELETE_TRANSPORT_ERROR',
      )
    } finally {
      clearTimeout(timeout)
    }
  }

  async deleteLearnerAudits(learnerId: string) {
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(new Error('AI coach audit deletion timed out.')),
      this.options.timeoutMs ?? 20_000,
    )
    try {
      const response = await (this.options.fetchImplementation ?? fetch)(
        new URL(
          `/internal/coach/learners/${encodeURIComponent(learnerId)}/audits`,
          this.options.baseUrl,
        ),
        {
          method: 'DELETE',
          headers: {
            'x-internal-service-token': this.options.internalServiceToken,
          },
          signal: controller.signal,
        },
      )
      if (!response.ok) throw new AiCoachClientError('AI_COACH_UNAVAILABLE')
    } catch (error) {
      if (error instanceof AiCoachClientError) throw error
      throw new AiCoachClientError('AI_COACH_TRANSPORT_ERROR')
    } finally {
      clearTimeout(timeout)
    }
  }
}
