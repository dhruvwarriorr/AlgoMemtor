import {
  VisualizerDebugRequestSchema,
  VisualizerDebugResponseSchema,
} from '@algomemtor/shared-contracts'

import { invalidMentorInput, mentor } from '@/server/http/mentor'
import { json, route } from '@/server/http/route'

// The Test Case Visualizer's AI Debugger.
export const POST = route(
  { auth: 'user', aiUsage: 'mentor' },
  async ({ app, subject, body }) => {
    const input = VisualizerDebugRequestSchema.safeParse(body)
    if (!input.success) {
      // Issues name the invalid fields, never the submitted code or input.
      throw invalidMentorInput(
        input.error.issues[0]?.message ?? 'The debug request is invalid.',
        input.error.issues.map(({ code, path, message }) => ({
          code,
          path,
          message,
        })),
      )
    }
    return json(
      VisualizerDebugResponseSchema.parse({
        data: await mentor(() =>
          app.mentorService.visualizerDebug(subject, input.data),
        ),
      }),
    )
  },
)
