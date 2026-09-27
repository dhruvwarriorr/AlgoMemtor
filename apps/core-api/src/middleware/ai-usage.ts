import { ApiErrorResponseSchema } from '@algomemtor/shared-contracts'
import type { NextFunction, Request, RequestHandler, Response } from 'express'

import type {
  AiUsageDecision,
  AiUsageFeature,
  AiUsageLimiter,
} from '../services/ai-usage-limiter.js'

const featureLabel: Record<AiUsageFeature, string> = {
  coach: 'Coach',
  mentor: 'AI mentor tools',
  recommendations: 'AI recommendation refreshes',
}

export function aiUsageLimitMessage(
  feature: AiUsageFeature,
  decision: Extract<AiUsageDecision, { allowed: false }>,
) {
  if (decision.scope === 'global') {
    return 'AlgoMemtor has reached its AI usage for today. Please try again tomorrow.'
  }
  return decision.window === 'minute'
    ? `You are sending ${featureLabel[feature]} requests too quickly. Try again in ${decision.retryAfterSeconds} seconds.`
    : `You have used today's ${decision.limit} ${featureLabel[feature]} requests. They reset at midnight UTC.`
}

/**
 * Counts an authenticated request against the learner's AI allowance before
 * it reaches the handler. `applies` limits counting to requests that will
 * call a model (for example, only some Doubt Helper actions do).
 */
export function limitAiUsage(
  limiter: AiUsageLimiter,
  feature: AiUsageFeature,
  subject: (response: Response) => string,
  applies: (request: Request) => boolean = () => true,
): RequestHandler {
  return async (request: Request, response: Response, next: NextFunction) => {
    if (!limiter.enabled || !applies(request)) {
      next()
      return
    }
    let decision: AiUsageDecision
    try {
      decision = await limiter.consume(subject(response), feature)
    } catch (error) {
      next(error)
      return
    }
    if (decision.allowed) {
      next()
      return
    }
    response
      .status(429)
      .set('retry-after', String(decision.retryAfterSeconds))
      .json(
        ApiErrorResponseSchema.parse({
          error: {
            code: 'AI_USAGE_LIMITED',
            message: aiUsageLimitMessage(feature, decision),
            retryable: true,
          },
        }),
      )
  }
}
