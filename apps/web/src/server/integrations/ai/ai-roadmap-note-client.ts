import { z } from 'zod'

import { CoachManualTopicStatusSchema } from '@algomemtor/shared-contracts'

const topicSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

const topicOptionSchema = z
  .object({
    slug: topicSlugSchema,
    name: z.string().trim().min(1).max(64),
    currentStatus: CoachManualTopicStatusSchema.nullable(),
  })
  .strict()

export const AiRoadmapNoteRequestSchema = z
  .object({
    topics: z.array(topicOptionSchema).min(1).max(64),
    note: z.string().trim().min(1).max(500),
  })
  .strict()

export type AiRoadmapNoteRequest = z.infer<typeof AiRoadmapNoteRequestSchema>

export const AiRoadmapNoteResponseSchema = z
  .object({
    topic: topicSlugSchema.nullable(),
    status: z.union([CoachManualTopicStatusSchema, z.literal('no_change')]),
    rationale: z.string().trim().min(1).max(280),
  })
  .strict()

export type AiRoadmapNoteResponse = z.infer<typeof AiRoadmapNoteResponseSchema>

export interface AiRoadmapNoteClient {
  classify(
    input: AiRoadmapNoteRequest,
    signal?: AbortSignal,
  ): Promise<AiRoadmapNoteResponse>
}

export class AiRoadmapNoteClientError extends Error {
  constructor(
    readonly code:
      'AI_TIMEOUT' | 'AI_UNAVAILABLE' | 'AI_INVALID_RESPONSE' | 'AI_CANCELLED',
    message: string,
  ) {
    super(message)
    this.name = 'AiRoadmapNoteClientError'
  }
}

export class UnavailableAiRoadmapNoteClient implements AiRoadmapNoteClient {
  async classify(): Promise<AiRoadmapNoteResponse> {
    return {
      topic: null,
      status: 'no_change',
      rationale:
        'AI status suggestions are unavailable right now; your note was saved.',
    }
  }
}

export class HttpAiRoadmapNoteClient implements AiRoadmapNoteClient {
  constructor(
    private readonly options: {
      baseUrl: string
      internalServiceToken: string
      timeoutMs?: number
      fetchImplementation?: typeof fetch
    },
  ) {}

  async classify(input: AiRoadmapNoteRequest, signal?: AbortSignal) {
    const validatedInput = AiRoadmapNoteRequestSchema.parse(input)
    const controller = new AbortController()
    const abortFromCaller = () => controller.abort(signal?.reason)
    if (signal?.aborted) {
      controller.abort(signal.reason)
    } else {
      signal?.addEventListener('abort', abortFromCaller, { once: true })
    }
    const timeout = setTimeout(
      () =>
        controller.abort(
          new Error('AI roadmap-note classification timed out.'),
        ),
      this.options.timeoutMs ?? 8000,
    )

    try {
      const response = await (this.options.fetchImplementation ?? fetch)(
        new URL('/internal/coach/roadmap-note', this.options.baseUrl),
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-internal-service-token': this.options.internalServiceToken,
          },
          body: JSON.stringify(validatedInput),
          signal: controller.signal,
        },
      )

      if (!response.ok) {
        throw new AiRoadmapNoteClientError(
          'AI_UNAVAILABLE',
          'The AI roadmap-note service is unavailable.',
        )
      }

      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        throw new AiRoadmapNoteClientError(
          'AI_INVALID_RESPONSE',
          'The AI roadmap-note service returned invalid JSON.',
        )
      }

      const parsed = AiRoadmapNoteResponseSchema.safeParse(payload)
      if (!parsed.success) {
        throw new AiRoadmapNoteClientError(
          'AI_INVALID_RESPONSE',
          'The AI roadmap-note service returned an invalid response.',
        )
      }

      return parsed.data
    } catch (error) {
      if (error instanceof AiRoadmapNoteClientError) {
        throw error
      }

      if (controller.signal.aborted) {
        if (signal?.aborted) {
          throw new AiRoadmapNoteClientError(
            'AI_CANCELLED',
            'The AI roadmap-note request was cancelled.',
          )
        }
        throw new AiRoadmapNoteClientError(
          'AI_TIMEOUT',
          'The AI roadmap-note request timed out.',
        )
      }

      throw new AiRoadmapNoteClientError(
        'AI_UNAVAILABLE',
        'The AI roadmap-note service is unavailable.',
      )
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abortFromCaller)
    }
  }
}
