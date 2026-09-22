import type { ProviderActivityEvent } from '@algomemtor/shared-contracts'

const acceptedVerdicts = new Set(['accepted', 'ok', 'ac'])

export function isAcceptedSubmission(event: ProviderActivityEvent) {
  return (
    event.eventType === 'submission' &&
    event.verdict !== undefined &&
    acceptedVerdicts.has(event.verdict.toLowerCase())
  )
}

export function dashboardActivity(
  events: readonly ProviderActivityEvent[],
  limit = 6,
) {
  const accepted = new Set(
    events
      .filter(isAcceptedSubmission)
      .filter((event) => event.externalId && event.occurredAt)
      .map(
        (event) =>
          `${event.provider}:${event.externalId}:${event.occurredAt?.slice(0, 10)}`,
      ),
  )
  const seen = new Set<string>()
  return events
    .filter((event) => event.occurredAt !== null)
    .filter((event) => {
      if (
        event.eventType === 'solved' &&
        event.source === 'provider' &&
        accepted.has(
          `${event.provider}:${event.externalId}:${event.occurredAt?.slice(0, 10)}`,
        )
      )
        return false
      const key =
        event.externalId && event.occurredAt
          ? `${event.provider}:${event.externalId}:${event.eventType}:${event.occurredAt.slice(0, 10)}:${event.verdict ?? ''}`
          : event.id
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
}
