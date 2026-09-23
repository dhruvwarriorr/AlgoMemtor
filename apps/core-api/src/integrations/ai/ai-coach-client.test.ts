import { describe, expect, it } from 'vitest'

import { AiCoachClientError, HttpAiCoachClient } from './ai-coach-client.js'

const request = {
  requestId: 'request-1',
  learnerId: '00000000-0000-4000-8000-000000000001',
  conversationId: '00000000-0000-4000-8000-000000000002',
  question: 'How many DP problems did I solve?',
  context: {},
  workspace: { version: 'coach-workspace-v1' },
}

const clientReturning = (response: Response, sent: unknown[] = []) =>
  new HttpAiCoachClient({
    baseUrl: 'http://localhost:8000',
    internalServiceToken: 'token',
    fetchImplementation: async (_url, init) => {
      sent.push(JSON.parse(String(init?.body)))
      return response
    },
  })

describe('HttpAiCoachClient', () => {
  it('reports provider quota exhaustion distinctly', async () => {
    await expect(
      clientReturning(new Response('{}', { status: 429 })).respond(request),
    ).rejects.toMatchObject({ code: 'AI_COACH_RATE_LIMITED' })
    await expect(
      clientReturning(new Response('{}', { status: 503 })).respond(request),
    ).rejects.toBeInstanceOf(AiCoachClientError)
  })

  it('sends the learner workspace and accepts long coach answers', async () => {
    const sent: unknown[] = []
    const answer = `## Plan\n${'x'.repeat(10_000)}`
    const result = await clientReturning(
      Response.json({ answer, evidence: [], proposals: [] }),
      sent,
    ).respond(request)
    expect(result.answer).toBe(answer)
    expect(sent[0]).toMatchObject({
      workspace: { version: 'coach-workspace-v1' },
    })
  })
})
