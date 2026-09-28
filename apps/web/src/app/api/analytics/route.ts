import {
  languageFamilyCounts,
  LinkableProviderSchema,
  programmingLanguageFamily,
  UnifiedAnalyticsSchema,
  type ExternalProblemSummary,
} from '@algomemtor/shared-contracts'

import { json, route } from '@/server/http/route'
import { providerFilter } from '@/server/http/schemas'
import {
  buildAnalyticsInsights,
  learnerDayKeyFormatter,
} from '@/server/services/analytics-insights'
import { withObservedDifficulty } from '@/server/services/observed-difficulty'
import {
  normalizeTopic,
  normalizeTopicCounts,
} from '@/server/utils/topic-normalization'

export const GET = route({ auth: 'user' }, async ({ app, subject, query }) => {
  const provider = providerFilter(query)
  const authUserId = subject
  const [
    profile,
    allActions,
    submissions,
    solvedProblems,
    ratingChanges,
    participations,
  ] = await Promise.all([
    app.providerStatsForProfile(authUserId),
    app.problemActionRepository.listByAuthUserId(authUserId),
    app.providerDataRepository.listSubmissions(authUserId, provider),
    app.providerDataRepository.listSolvedProblems(authUserId, provider),
    app.providerDataRepository.listRatingChanges(authUserId, provider),
    app.providerDataRepository.listContestParticipations(authUserId, provider),
  ])
  // Learner actions (manual and provider-verified solves) are stored for
  // every platform; a single-platform view must never count another
  // platform's solves in its calendar, topics, or difficulty totals.
  const actions =
    provider === undefined
      ? allActions
      : allActions.filter((action) => action.provider === provider)
  const profileProviders =
    provider === undefined
      ? profile.providers
      : profile.providers.filter((item) => item.provider === provider)
  const profileSnapshots =
    provider === undefined
      ? (profile.profiles ?? [])
      : (profile.profiles ?? []).filter((item) => item.provider === provider)
  const solvedByProvider = {
    codeforces:
      profileProviders.find((item) => item.provider === 'codeforces')
        ?.solvedCount ?? 0,
    codechef:
      profileProviders.find((item) => item.provider === 'codechef')
        ?.solvedCount ?? 0,
    leetcode:
      profileProviders.find((item) => item.provider === 'leetcode')
        ?.solvedCount ?? 0,
    cses:
      profileProviders.find((item) => item.provider === 'cses')?.solvedCount ??
      0,
  }
  const solvedByDifficulty = { easy: 0, medium: 0, hard: 0 }
  // A public profile's all-time difficulty totals (LeetCode) replace the
  // per-problem count, which only sees the provider's recent activity.
  const profileDifficultyProviders = new Set<string>()
  for (const snapshot of profileSnapshots) {
    if (snapshot.difficultyCounts === undefined) continue
    profileDifficultyProviders.add(snapshot.provider)
    solvedByDifficulty.easy += snapshot.difficultyCounts.easy
    solvedByDifficulty.medium += snapshot.difficultyCounts.medium
    solvedByDifficulty.hard += snapshot.difficultyCounts.hard
  }
  const solvedOverTime: Record<string, number> = {}
  const topicCounts: Record<string, number> = {}
  const languageCounts: Record<string, number> = {}
  const profileTopicProviders = new Set(
    profileSnapshots
      .filter(
        (snapshot) =>
          Object.keys(normalizeTopicCounts(snapshot.topicCounts)).length > 0,
      )
      .map((snapshot) => snapshot.provider),
  )
  const solvedReferences = [
    ...solvedProblems.map((problem) => ({
      provider: problem.provider,
      externalId: problem.externalId,
    })),
    ...actions.flatMap((action) => {
      if (
        action.actionType !== 'status_changed' ||
        action.learnerStatus !== 'solved'
      ) {
        return []
      }
      const parsedProvider = LinkableProviderSchema.safeParse(action.provider)
      return parsedProvider.success
        ? [{ provider: parsedProvider.data, externalId: action.externalId }]
        : []
    }),
  ]
  const uniqueSolvedReferences = [
    ...new Map(
      solvedReferences.map((reference) => [
        `${reference.provider}:${reference.externalId}`,
        reference,
      ]),
    ).values(),
  ]
  // Submitted-but-unsolved problems are looked up too so the Insights
  // topic-strength view can attribute failed attempts to topics.
  const lookupReferences = [
    ...new Map(
      [
        ...uniqueSolvedReferences,
        ...submissions.slice(0, 3_000).map((submission) => ({
          provider: submission.provider,
          externalId: submission.externalId,
        })),
      ].map((reference) => [
        `${reference.provider}:${reference.externalId}`,
        reference,
      ]),
    ).values(),
  ]
  let metadata: ExternalProblemSummary[] = []
  if (
    app.problemMetadataCache?.findByReferences !== undefined &&
    lookupReferences.length > 0
  ) {
    try {
      metadata =
        await app.problemMetadataCache.findByReferences(lookupReferences)
    } catch {
      app.logger.warn('provider_metadata_lookup_failed', {
        route: '/api/analytics',
      })
    }
  }
  // CodeChef solves from the browser connector carry their own context: a
  // contest solve counts at the problem's rating, a practice solve is
  // unrated.
  const metadataByKey = withObservedDifficulty(
    new Map(
      metadata.map((problem) => [
        `${problem.provider}:${problem.externalId}`,
        problem,
      ]),
    ),
    solvedProblems,
    new Date().toISOString(),
  )
  for (const reference of uniqueSolvedReferences) {
    const problem = metadataByKey.get(
      `${reference.provider}:${reference.externalId}`,
    )
    if (
      problem?.normalizedDifficulty !== undefined &&
      !profileDifficultyProviders.has(reference.provider)
    ) {
      solvedByDifficulty[problem.normalizedDifficulty] += 1
    }
    if (profileTopicProviders.has(reference.provider)) continue
    const observation = solvedProblems.find(
      (solved) =>
        solved.provider === reference.provider &&
        solved.externalId === reference.externalId,
    )
    const topics = new Set([
      ...(problem?.topics ?? []),
      ...(observation?.topics ?? []),
    ])
    const normalizedTopics = new Set(
      [...topics].map(normalizeTopic).filter((topic) => topic !== undefined),
    )
    for (const topic of normalizedTopics) {
      topicCounts[topic] = (topicCounts[topic] ?? 0) + 1
    }
  }
  // Days are the learner's calendar days: a UTC split breaks streaks for
  // anyone solving late in the evening outside UTC.
  const learnerProfile =
    await app.learnerProfileRepository.findByAuthUserId(authUserId)
  const learnerTimezone = learnerProfile?.timezone ?? 'UTC'
  const dayKey = learnerDayKeyFormatter(learnerTimezone)
  const solvedDates = new Map<string, string>()
  for (const solved of solvedProblems) {
    if (solved.occurredAt !== null) {
      solvedDates.set(
        `${solved.provider}:${solved.externalId}`,
        dayKey(new Date(solved.occurredAt)),
      )
    }
  }
  for (const action of actions) {
    if (
      action.actionType !== 'status_changed' ||
      action.learnerStatus !== 'solved'
    ) {
      continue
    }
    const parsedProvider = LinkableProviderSchema.safeParse(action.provider)
    if (!parsedProvider.success) continue
    const key = `${parsedProvider.data}:${action.externalId}`
    if (!solvedDates.has(key)) {
      solvedDates.set(key, dayKey(action.occurredAt))
    }
  }
  for (const date of solvedDates.values()) {
    solvedOverTime[date] = (solvedOverTime[date] ?? 0) + 1
  }
  for (const providerProfile of profileSnapshots) {
    for (const [topic, count] of Object.entries(
      normalizeTopicCounts(providerProfile.topicCounts),
    )) {
      topicCounts[topic] = (topicCounts[topic] ?? 0) + count
    }
  }
  for (const providerProfile of profileSnapshots) {
    for (const [language, count] of Object.entries(
      languageFamilyCounts(providerProfile.languageCounts),
    )) {
      languageCounts[language] = (languageCounts[language] ?? 0) + count
    }
  }
  // Platforms without profile language totals (LeetCode and CSES via the
  // browser connector) count the language of each accepted problem.
  const snapshotLanguageProviders = new Set(
    profileSnapshots
      .filter((snapshot) => Object.keys(snapshot.languageCounts).length > 0)
      .map((snapshot) => snapshot.provider),
  )
  const acceptedLanguage = new Map<string, string>()
  for (const submission of submissions) {
    if (
      !submission.isAccepted ||
      submission.language === undefined ||
      snapshotLanguageProviders.has(submission.provider)
    ) {
      continue
    }
    acceptedLanguage.set(
      `${submission.provider}:${submission.externalId}`,
      submission.language,
    )
  }
  for (const language of acceptedLanguage.values()) {
    const family = programmingLanguageFamily(language)
    languageCounts[family] = (languageCounts[family] ?? 0) + 1
  }
  const acceptedSubmissions = submissions.filter(
    (item) => item.isAccepted,
  ).length
  const acceptanceRate =
    submissions.length === 0
      ? undefined
      : (acceptedSubmissions / submissions.length) * 100
  const staleProviders =
    provider === undefined
      ? profile.staleProviders
      : profile.staleProviders.filter((item) => item === provider)
  const solvedTotal =
    provider === undefined
      ? profile.solvedTotal
      : (profileProviders.find((item) => item.provider === provider)
          ?.solvedCount ?? 0)
  const solvedAtByKey = new Map<string, string>()
  for (const solved of solvedProblems) {
    if (solved.occurredAt !== null) {
      solvedAtByKey.set(
        `${solved.provider}:${solved.externalId}`,
        solved.occurredAt,
      )
    }
  }
  for (const action of actions) {
    if (
      action.actionType !== 'status_changed' ||
      action.learnerStatus !== 'solved'
    ) {
      continue
    }
    const actionKey = `${action.provider}:${action.externalId}`
    if (!solvedAtByKey.has(actionKey)) {
      solvedAtByKey.set(actionKey, action.occurredAt.toISOString())
    }
  }
  const insights = buildAnalyticsInsights({
    timezone: learnerTimezone,
    now: new Date(),
    profiles: profileSnapshots,
    otherAccounts: profileProviders.map((item) => ({
      provider: item.provider,
      handle: item.handle,
      ...(item.solvedCount === undefined
        ? {}
        : { solvedCount: item.solvedCount }),
    })),
    submissions,
    solved: uniqueSolvedReferences
      .filter(
        (reference) =>
          provider === undefined || reference.provider === provider,
      )
      .map((reference) => {
        const solvedAt = solvedAtByKey.get(
          `${reference.provider}:${reference.externalId}`,
        )
        return solvedAt === undefined ? reference : { ...reference, solvedAt }
      }),
    ratingChanges,
    participations,
    metadata: metadataByKey,
    observedTopics: new Map(
      solvedProblems.flatMap((solved) =>
        solved.topics === undefined || solved.topics.length === 0
          ? []
          : [[`${solved.provider}:${solved.externalId}`, solved.topics]],
      ),
    ),
    normalizeTopic,
  })
  return json(
    UnifiedAnalyticsSchema.parse({
      insights,
      solvedTotal,
      solvedByProvider,
      solvedOverTime,
      solvedByDifficulty,
      topicCounts,
      languageCounts,
      ...(acceptanceRate === undefined ? {} : { acceptanceRate }),
      ratingHistory: ratingChanges,
      contestParticipation: participations,
      dataCompleteness:
        actions.length === 0 &&
        uniqueSolvedReferences.every((reference) =>
          metadataByKey.has(`${reference.provider}:${reference.externalId}`),
        )
          ? profile.completeness
          : 'partial',
      staleProviders,
      generatedAt: new Date().toISOString(),
    }),
  )
})
