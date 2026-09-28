import type {
  AiUsageDecision,
  AiUsageFeature,
} from '../services/ai-usage-limiter'

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
