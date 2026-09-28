import { ProviderActivityResponseSchema } from '@algomemtor/shared-contracts'

import { json, route } from '@/server/http/route'
import { providerFilter } from '@/server/http/schemas'

// Every platform event for the learner, newest first: manual status changes,
// verified solves and the normalized provider history.
export const GET = route({ auth: 'user' }, async ({ app, subject, query }) => {
  const provider = providerFilter(query)
  const authUserId = subject
  const [
    actions,
    verified,
    submissions,
    solvedProblems,
    ratingChanges,
    participations,
  ] = await Promise.all([
    app.problemActionRepository.listByAuthUserId(authUserId),
    app.providerAccountRepository.listVerifiedActivityByAuthUserId(authUserId),
    app.providerDataRepository.listSubmissions(authUserId, provider),
    app.providerDataRepository.listSolvedProblems(authUserId, provider),
    app.providerDataRepository.listRatingChanges(authUserId, provider),
    app.providerDataRepository.listContestParticipations(authUserId, provider),
  ])
  const events = actions.flatMap((action) => {
    if (
      action.actionType !== 'status_changed' ||
      action.evidenceSource === 'provider_verified' ||
      action.learnerStatus === 'unsolved'
    ) {
      return []
    }
    if (provider !== undefined && action.provider !== provider) return []
    return [
      {
        id: action.id,
        provider: action.provider,
        eventType:
          action.learnerStatus === 'solved'
            ? ('solved' as const)
            : ('submission' as const),
        externalId: action.externalId,
        occurredAt: action.occurredAt.toISOString(),
        source: 'manual' as const,
        completeness: 'complete' as const,
      },
    ]
  })
  const observedCodeforcesSolves = new Set(
    solvedProblems
      .filter(
        (problem) =>
          problem.provider === 'codeforces' && problem.occurredAt !== null,
      )
      .map((problem) => problem.externalId),
  )
  const verifiedEvents = verified.flatMap((event) => {
    if (
      (provider !== undefined && provider !== 'codeforces') ||
      observedCodeforcesSolves.has(event.externalId)
    )
      return []
    return [
      {
        id: event.id,
        provider: 'codeforces' as const,
        eventType: 'solved' as const,
        externalId: event.externalId,
        providerEventId: event.providerEventId,
        occurredAt: event.occurredAt.toISOString(),
        source: 'provider' as const,
        completeness: 'partial' as const,
      },
    ]
  })
  const normalizedEvents = [
    ...submissions.map((submission) => ({
      id: `submission:${submission.provider}:${submission.eventId}`,
      provider: submission.provider,
      eventType: 'submission' as const,
      externalId: submission.externalId,
      providerEventId: submission.eventId,
      ...(submission.problemTitle === undefined
        ? {}
        : { title: submission.problemTitle }),
      canonicalUrl: submission.canonicalUrl,
      occurredAt: submission.occurredAt ?? null,
      verdict: submission.verdict,
      ...(submission.language === undefined
        ? {}
        : { language: submission.language }),
      source: 'provider' as const,
      completeness: submission.completeness,
    })),
    ...solvedProblems.map((solved) => ({
      id: `solved:${solved.provider}:${solved.externalId}`,
      provider: solved.provider,
      eventType: 'solved' as const,
      externalId: solved.externalId,
      canonicalUrl: solved.canonicalUrl,
      occurredAt: solved.occurredAt,
      ...(solved.providerTags === undefined
        ? {}
        : { providerTags: solved.providerTags }),
      ...(solved.topics === undefined ? {} : { topics: solved.topics }),
      source: 'provider' as const,
      completeness: solved.completeness,
    })),
    ...ratingChanges.map((change) => ({
      id: `rating:${change.provider}:${change.eventId}`,
      provider: change.provider,
      eventType: 'rating_change' as const,
      providerEventId: change.eventId,
      ...(change.contestId === undefined
        ? {}
        : { externalId: change.contestId }),
      ...(change.contestName === undefined
        ? {}
        : { title: change.contestName }),
      occurredAt: change.occurredAt,
      ratingDelta: change.delta,
      source: 'provider' as const,
      completeness: change.provenance.completeness,
    })),
    ...participations.map((participation) => ({
      id: `contest:${participation.provider}:${participation.contestId}`,
      provider: participation.provider,
      eventType: 'contest' as const,
      externalId: participation.contestId,
      ...(participation.contestName === undefined
        ? {}
        : { title: participation.contestName }),
      occurredAt: participation.attendedAt ?? null,
      ...(participation.rank === undefined ? {} : { rank: participation.rank }),
      source: 'provider' as const,
      completeness: participation.provenance.completeness,
    })),
  ]
  const data = [...events, ...verifiedEvents, ...normalizedEvents].sort(
    (left, right) =>
      (right.occurredAt ?? '').localeCompare(left.occurredAt ?? '') ||
      left.id.localeCompare(right.id),
  )
  return json(
    ProviderActivityResponseSchema.parse({
      data,
      meta: {
        partial:
          verified.length > 0 ||
          normalizedEvents.some((event) => event.completeness !== 'complete'),
        stale: false,
        providers: app.providerFreshness(),
      },
    }),
  )
})
