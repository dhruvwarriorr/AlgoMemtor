import {
  ApiErrorResponseSchema,
  ConnectorTokensResponseSchema,
  CreateConnectorTokenRequestSchema,
  CreateConnectorTokenResponseSchema,
  RevokeConnectorTokenResponseSchema,
  type ConnectorToken,
  DisconnectProviderAccountResponseSchema,
  ExternalContestSchema,
  ExternalContestsQuerySchema,
  ExternalContestsResponseSchema,
  ExternalProblemCatalogQueryParamsSchema,
  ExternalProblemCatalogResponseSchema,
  ExternalProblemSummarySchema,
  ProblemContentSchema,
  ProblemDetailResponseSchema,
  LearnerProfileResponseSchema,
  LearnerProfileSchema,
  LinkableProviderSchema,
  LinkProviderAccountRequestSchema,
  ProviderAccountResponseSchema,
  ProviderAccountSchema,
  ProviderAccountsResponseSchema,
  ProviderActivitySyncResponseSchema,
  ProviderActivityResponseSchema,
  ProviderSyncRequestResponseSchema,
  ProviderSyncStatusResponseSchema,
  RecommendationDismissalResponseSchema,
  RecommendationDismissalsResponseSchema,
  RecommendationFeedbackInputSchema,
  RecommendationFeedbackResponseSchema,
  RecommendationFeedResponseSchema,
  RecommendationRestorationResponseSchema,
  ProvidersResponseSchema,
  SaveLearnerProfileRequestSchema,
  RefreshProviderPublicStatsRequestSchema,
  SetProviderActivityConsentRequestSchema,
  TopicsResponseSchema,
  UnifiedAnalyticsSchema,
  UnifiedProfileResponseSchema,
  type LearnerProfile,
  type LinkableProvider,
  type ProviderAccount,
} from '@algomemtor/shared-contracts'
import { delay, http, HttpResponse, type RequestHandler } from 'msw'

import { problemFixtures } from './fixtures/problems'
import { topicFixtures } from './fixtures/topics'
import { progressHandlers } from './progressHandlers'
import { coachHandlers } from './coachHandlers'

const mockDelayMs = 300
const transientScenarioFailureCounts = new Map<string, number>()
let learnerProfile: LearnerProfile | null = null
let providerAccounts: ProviderAccount[] = []
const dismissedRecommendationIds = new Set<string>()
const recommendationFeedback = new Map<
  string,
  {
    usefulness?: 'useful' | 'not_useful'
    perceivedDifficulty?: 'too_easy' | 'about_right' | 'too_hard'
  }
>()
let recommendationGeneration = 0

const profileUrl = (provider: LinkableProvider, handle: string) => {
  const encodedHandle = encodeURIComponent(handle)

  if (provider === 'codeforces') {
    return `https://codeforces.com/profile/${encodedHandle}`
  }

  if (provider === 'codechef') {
    return `https://www.codechef.com/users/${encodedHandle}`
  }

  if (provider === 'cses') {
    return `https://cses.fi/user/${encodedHandle}`
  }

  return `https://leetcode.com/u/${encodedHandle}/`
}

const mockSolvedCounts: Record<LinkableProvider, number> = {
  codeforces: 245,
  codechef: 118,
  leetcode: 176,
  cses: 142,
}

const mockStatsSources = {
  codeforces: 'codeforces_api',
  codechef: 'codechef_public_profile_html',
  leetcode: 'leetcode_website_graphql',
  cses: 'browser_connector',
} as const

const providersResponse = ProvidersResponseSchema.parse({
  data: [
    {
      key: 'codeforces',
      label: 'Codeforces',
      availability: 'available',
    },
    {
      key: 'codechef',
      label: 'CodeChef',
      availability: 'available',
    },
    {
      key: 'leetcode',
      label: 'LeetCode',
      availability: 'available',
    },
  ],
})

const topicsResponse = TopicsResponseSchema.parse({
  data: topicFixtures,
})

const platformCanonicalUrl = (
  provider: LinkableProvider,
  externalId: string,
) => {
  if (provider === 'codeforces') {
    const match = /^(\d+)([A-Za-z][0-9]*)$/.exec(externalId)
    return match
      ? `https://codeforces.com/problemset/problem/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}`
      : `https://codeforces.com/problemset`
  }
  if (provider === 'codechef') {
    return `https://www.codechef.com/problems/${encodeURIComponent(externalId)}`
  }
  return `https://leetcode.com/problems/${encodeURIComponent(externalId)}/`
}

const platformProvenance = (
  provider: LinkableProvider,
  externalId: string,
  canonicalUrl: string,
) => ({
  provider,
  providerId: externalId,
  canonicalUrl,
  sourceUrl: canonicalUrl,
  extractionStrategy: 'official_json' as const,
  schemaVersion: `${provider}-mock-v1`,
  completeness: 'complete' as const,
  fetchedAt: new Date().toISOString(),
  stale: false,
})

const mockPlatformEvents = () => {
  const now = new Date().toISOString()
  return [
    {
      id: 'mock-event-codeforces-solved',
      provider: 'codeforces' as const,
      eventType: 'solved' as const,
      externalId: '4:A',
      providerEventId: 'mock-cf-1',
      title: 'Watermelon',
      canonicalUrl: platformCanonicalUrl('codeforces', '4:A'),
      occurredAt: now,
      source: 'provider' as const,
      completeness: 'complete' as const,
    },
    {
      id: 'mock-event-codechef-solved',
      provider: 'codechef' as const,
      eventType: 'solved' as const,
      externalId: 'FLOW001',
      providerEventId: 'mock-cc-1',
      title: 'Add Two Numbers',
      canonicalUrl: platformCanonicalUrl('codechef', 'FLOW001'),
      occurredAt: now,
      source: 'provider' as const,
      completeness: 'partial' as const,
    },
    {
      id: 'mock-event-leetcode-submission',
      provider: 'leetcode' as const,
      eventType: 'submission' as const,
      externalId: 'two-sum',
      providerEventId: 'mock-lc-1',
      title: 'Two Sum',
      canonicalUrl: platformCanonicalUrl('leetcode', 'two-sum'),
      verdict: 'Accepted',
      language: 'python3',
      occurredAt: now,
      source: 'provider' as const,
      completeness: 'partial' as const,
    },
  ]
}

const mockContests = () => {
  const now = Date.now()
  const startsAt = new Date(now + 86_400_000).toISOString()
  const endsAt = new Date(now + 90_000_000).toISOString()
  return [
    {
      provider: 'codeforces' as const,
      externalId: '1900',
      name: 'Mock Codeforces Round',
      canonicalUrl: 'https://codeforces.com/contests/1900',
      phase: 'BEFORE',
      startsAt,
      endsAt,
      durationSeconds: 7_200,
      isRated: true,
      status: 'upcoming' as const,
      provenance: platformProvenance(
        'codeforces',
        '1900',
        'https://codeforces.com/contests/1900',
      ),
    },
    {
      provider: 'codechef' as const,
      externalId: 'START200',
      name: 'Mock CodeChef Starters',
      canonicalUrl: 'https://www.codechef.com/contests/START200',
      startsAt,
      endsAt,
      durationSeconds: 10_800,
      isRated: true,
      status: 'upcoming' as const,
      provenance: platformProvenance(
        'codechef',
        'START200',
        'https://www.codechef.com/contests/START200',
      ),
    },
    {
      provider: 'leetcode' as const,
      externalId: 'weekly-contest-500',
      name: 'Mock LeetCode Weekly Contest',
      canonicalUrl: 'https://leetcode.com/contest/weekly-contest-500/',
      startsAt,
      endsAt,
      durationSeconds: 5_400,
      isRated: true,
      status: 'upcoming' as const,
      provenance: platformProvenance(
        'leetcode',
        'weekly-contest-500',
        'https://leetcode.com/contest/weekly-contest-500/',
      ),
    },
  ]
}

let mockConnectorTokens: ConnectorToken[] = []

const mockSyncJobs = new Map<LinkableProvider, string>()

const providerOptionsIndex = (provider: LinkableProvider) =>
  ({ codeforces: 701, codechef: 702, leetcode: 703, cses: 704 })[provider]

const recommendationItemId = (index: number) =>
  `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`

const recommendationProblems = () =>
  problemFixtures.filter(
    (problem) =>
      problem.learnerStatus !== 'solved' &&
      !dismissedRecommendationIds.has(
        `${problem.provider}:${problem.externalId}`,
      ),
  )

const recommendationResponse = () => {
  const generatedAt = new Date().toISOString()
  const items = recommendationProblems()
    .slice(0, 10)
    .map((problem, index) => {
      const id = recommendationItemId(index)
      const feedback = recommendationFeedback.get(id)

      return {
        id,
        provider: problem.provider,
        externalId: problem.externalId,
        position: index + 1,
        score: Number((0.9 - index * 0.01).toFixed(6)),
        reason:
          index % 2 === 0
            ? 'Practises a topic from your current recommendation path.'
            : 'Fits the difficulty range selected for your practice.',
        problem,
        ...(feedback === undefined
          ? {}
          : {
              feedback: {
                id,
                recommendationItemId: id,
                ...feedback,
                createdAt: generatedAt,
                updatedAt: generatedAt,
              },
            }),
      }
    })

  return RecommendationFeedResponseSchema.parse({
    data: {
      id: `00000000-0000-4000-8000-${String(500 + recommendationGeneration).padStart(12, '0')}`,
      generatedAt,
      rankingMode: 'deterministic',
      rankingVersion: 'deterministic-v1',
      items,
    },
    meta: {
      partial: false,
      stale: false,
      warnings: [],
      providers: [],
    },
  })
}

function createApiError(code: string, message: string, details: unknown) {
  return ApiErrorResponseSchema.parse({
    error: {
      code,
      message,
      details,
    },
  })
}

function normalizeSearchText(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

export const handlers: RequestHandler[] = [
  ...progressHandlers,
  ...coachHandlers,
  http.get('/api/learner-profile', () =>
    HttpResponse.json(
      LearnerProfileResponseSchema.parse({ data: learnerProfile }),
    ),
  ),
  http.put('/api/learner-profile', async ({ request }) => {
    const profileResult = SaveLearnerProfileRequestSchema.safeParse(
      await request.json().catch(() => null),
    )

    if (!profileResult.success) {
      return HttpResponse.json(
        createApiError(
          'INVALID_LEARNER_PROFILE',
          'The learner profile is invalid.',
          profileResult.error.issues,
        ),
        { status: 400 },
      )
    }

    learnerProfile = LearnerProfileSchema.parse({
      ...profileResult.data,
      onboardingCompleted: true,
    })

    return HttpResponse.json(
      LearnerProfileResponseSchema.parse({ data: learnerProfile }),
    )
  }),
  http.get('/api/provider-accounts', () =>
    HttpResponse.json(
      ProviderAccountsResponseSchema.parse({ data: providerAccounts }),
    ),
  ),
  http.put('/api/provider-accounts/:provider', async ({ params, request }) => {
    const providerResult = LinkableProviderSchema.safeParse(params.provider)
    const accountResult = LinkProviderAccountRequestSchema.safeParse(
      await request.json().catch(() => null),
    )

    if (!providerResult.success || !accountResult.success) {
      return HttpResponse.json(
        createApiError(
          'INVALID_PROVIDER_ACCOUNT',
          'The provider account link is invalid or consent is missing.',
          accountResult.success ? [] : accountResult.error.issues,
        ),
        { status: 400 },
      )
    }

    const now = new Date().toISOString()
    const existing = providerAccounts.find(
      ({ provider }) => provider === providerResult.data,
    )
    const preserveStats =
      existing?.handle === accountResult.data.handle && existing !== undefined
    const account = ProviderAccountSchema.parse({
      provider: providerResult.data,
      handle: accountResult.data.handle,
      profileUrl: profileUrl(providerResult.data, accountResult.data.handle),
      consentScope: 'store_public_profile_reference',
      ...(preserveStats && existing.verification === 'verified'
        ? { verification: 'verified', verifiedAt: existing.verifiedAt }
        : { verification: 'not_verified' }),
      verifiedActivity: preserveStats
        ? existing.verifiedActivity
        : { enabled: false, status: 'not_enabled' },
      ...(preserveStats
        ? {
            activityAccess: existing.activityAccess,
            ...(existing.publicStatsConsentAt === undefined
              ? {}
              : {
                  publicStatsConsentAt: existing.publicStatsConsentAt,
                }),
            publicStats: existing.publicStats,
          }
        : {
            activityAccess: 'not_enabled',
            publicStats: { status: 'not_synced' },
          }),
      linkedAt: existing?.linkedAt ?? now,
      updatedAt: now,
    })
    providerAccounts = [
      ...providerAccounts.filter(
        ({ provider }) => provider !== providerResult.data,
      ),
      account,
    ]

    return HttpResponse.json(
      ProviderAccountResponseSchema.parse({ data: account }),
    )
  }),
  http.get('/api/connector/tokens', () =>
    HttpResponse.json(
      ConnectorTokensResponseSchema.parse({ data: mockConnectorTokens }),
    ),
  ),

  http.post('/api/connector/tokens', async ({ request }) => {
    const body = CreateConnectorTokenRequestSchema.safeParse(
      await request.json(),
    )
    if (!body.success) {
      return HttpResponse.json(
        createApiError(
          'INVALID_CONNECTOR_TOKEN_REQUEST',
          'Give the connector a short name.',
          body.error.issues,
        ),
        { status: 400 },
      )
    }
    const token = {
      id: crypto.randomUUID(),
      label: body.data.label,
      createdAt: new Date().toISOString(),
    }
    mockConnectorTokens = [token, ...mockConnectorTokens]
    return HttpResponse.json(
      CreateConnectorTokenResponseSchema.parse({
        data: { token, secret: `amc_${'M'.repeat(43)}` },
      }),
      { status: 201 },
    )
  }),

  http.delete('/api/connector/tokens/:id', ({ params }) => {
    const id = String(params.id)
    mockConnectorTokens = mockConnectorTokens.filter((token) => token.id !== id)
    return HttpResponse.json(
      RevokeConnectorTokenResponseSchema.parse({ data: { id } }),
    )
  }),

  // Mock mode treats every ownership check as successful after a code has
  // been issued, so the full verification flow can be exercised offline.
  http.post('/api/provider-accounts/:provider/verification', ({ params }) => {
    const existing = providerAccounts.find(
      ({ provider }) => provider === params.provider,
    )
    if (existing === undefined) {
      return HttpResponse.json(
        createApiError(
          'PROVIDER_ACCOUNT_NOT_LINKED',
          'Link this provider account before verifying it.',
          [],
        ),
        { status: 404 },
      )
    }
    const account =
      existing.verification === 'verified'
        ? existing
        : ProviderAccountSchema.parse({
            ...existing,
            verificationChallenge: {
              code: 'AM-MOCK2345',
              expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            },
            updatedAt: new Date().toISOString(),
          })
    providerAccounts = providerAccounts.map((candidate) =>
      candidate.provider === account.provider ? account : candidate,
    )
    return HttpResponse.json(
      ProviderAccountResponseSchema.parse({ data: account }),
    )
  }),

  http.post(
    '/api/provider-accounts/:provider/verification/check',
    ({ params }) => {
      const existing = providerAccounts.find(
        ({ provider }) => provider === params.provider,
      )
      if (existing === undefined) {
        return HttpResponse.json(
          createApiError(
            'PROVIDER_ACCOUNT_NOT_LINKED',
            'Link this provider account before verifying it.',
            [],
          ),
          { status: 404 },
        )
      }
      if (
        existing.verification === 'not_verified' &&
        existing.verificationChallenge === undefined
      ) {
        return HttpResponse.json(
          createApiError(
            'PROVIDER_VERIFICATION_EXPIRED',
            'This verification code has expired. Start again to get a new code.',
            [],
          ),
          { status: 409 },
        )
      }
      const now = new Date().toISOString()
      const rest = { ...existing }
      delete rest.verificationChallenge
      const account = ProviderAccountSchema.parse({
        ...rest,
        verification: 'verified',
        verifiedAt: existing.verifiedAt ?? now,
        updatedAt: now,
      })
      providerAccounts = providerAccounts.map((candidate) =>
        candidate.provider === account.provider ? account : candidate,
      )
      return HttpResponse.json(
        ProviderAccountResponseSchema.parse({ data: account }),
      )
    },
  ),

  http.delete('/api/provider-accounts/:provider', ({ params }) => {
    const providerResult = LinkableProviderSchema.safeParse(params.provider)

    if (!providerResult.success) {
      return HttpResponse.json(
        createApiError(
          'UNSUPPORTED_LINK_PROVIDER',
          'That provider cannot be disconnected.',
          [],
        ),
        { status: 400 },
      )
    }

    providerAccounts = providerAccounts.filter(
      ({ provider }) => provider !== providerResult.data,
    )

    return HttpResponse.json(
      DisconnectProviderAccountResponseSchema.parse({
        data: { provider: providerResult.data },
      }),
    )
  }),
  http.put(
    '/api/provider-accounts/:provider/activity-consent',
    async ({ params, request }) => {
      const providerResult = LinkableProviderSchema.safeParse(params.provider)
      const consentResult = SetProviderActivityConsentRequestSchema.safeParse(
        await request.json().catch(() => null),
      )
      const account = providerResult.success
        ? providerAccounts.find(
            ({ provider }) => provider === providerResult.data,
          )
        : undefined
      if (!providerResult.success || providerResult.data !== 'codeforces') {
        return HttpResponse.json(
          createApiError(
            'UNSUPPORTED_ACTIVITY_PROVIDER',
            'Only Codeforces public activity is available in this phase.',
            [],
          ),
          { status: 400 },
        )
      }
      if (!consentResult.success) {
        return HttpResponse.json(
          createApiError(
            'PROVIDER_ACTIVITY_CONSENT_REQUIRED',
            'Explicit activity consent is required.',
            consentResult.error.issues,
          ),
          { status: 400 },
        )
      }
      if (account === undefined) {
        return HttpResponse.json(
          createApiError(
            'PROVIDER_ACCOUNT_NOT_LINKED',
            'Link this provider account before changing activity consent.',
            [],
          ),
          { status: 404 },
        )
      }
      const now = new Date().toISOString()
      const updatedAccount = ProviderAccountSchema.parse({
        ...account,
        verifiedActivity: consentResult.data.enabled
          ? {
              ...account.verifiedActivity,
              enabled: true,
              status:
                account.verifiedActivity.status === 'not_enabled'
                  ? 'not_synced'
                  : account.verifiedActivity.status,
              consentedAt: account.verifiedActivity.consentedAt ?? now,
            }
          : { enabled: false, status: 'not_enabled' },
        updatedAt: now,
      })
      providerAccounts = providerAccounts.map((candidate) =>
        candidate.provider === updatedAccount.provider
          ? updatedAccount
          : candidate,
      )
      return HttpResponse.json(
        ProviderAccountResponseSchema.parse({ data: updatedAccount }),
      )
    },
  ),
  http.post('/api/provider-accounts/:provider/activity-sync', ({ params }) => {
    const providerResult = LinkableProviderSchema.safeParse(params.provider)
    const account = providerResult.success
      ? providerAccounts.find(
          ({ provider }) => provider === providerResult.data,
        )
      : undefined
    if (!providerResult.success || providerResult.data !== 'codeforces') {
      return HttpResponse.json(
        createApiError(
          'UNSUPPORTED_ACTIVITY_PROVIDER',
          'Only Codeforces public activity is available in this phase.',
          [],
        ),
        { status: 400 },
      )
    }
    if (account === undefined) {
      return HttpResponse.json(
        createApiError(
          'PROVIDER_ACCOUNT_NOT_LINKED',
          'Link this provider account before synchronizing activity.',
          [],
        ),
        { status: 404 },
      )
    }
    if (!account.verifiedActivity.enabled) {
      return HttpResponse.json(
        createApiError(
          'PROVIDER_ACTIVITY_CONSENT_REQUIRED',
          'Enable activity consent before synchronizing.',
          [],
        ),
        { status: 400 },
      )
    }
    const now = new Date().toISOString()
    const updatedAccount = ProviderAccountSchema.parse({
      ...account,
      verifiedActivity: {
        ...account.verifiedActivity,
        status: 'synced',
        lastAttemptedAt: now,
        lastSucceededAt: now,
        acceptedProblemCount:
          account.verifiedActivity.acceptedProblemCount ?? 1,
        complete: true,
      },
      updatedAt: now,
    })
    providerAccounts = providerAccounts.map((candidate) =>
      candidate.provider === updatedAccount.provider
        ? updatedAccount
        : candidate,
    )
    return HttpResponse.json(
      ProviderActivitySyncResponseSchema.parse({
        data: {
          provider: 'codeforces',
          discovered: 1,
          added: 1,
          confirmedSolved: 1,
          complete: true,
          syncedAt: now,
          nextAllowedAt: new Date(Date.now() + 900_000).toISOString(),
        },
      }),
    )
  }),
  http.post(
    '/api/provider-accounts/:provider/public-stats/refresh',
    async ({ params, request }) => {
      const providerResult = LinkableProviderSchema.safeParse(params.provider)
      const consentResult = RefreshProviderPublicStatsRequestSchema.safeParse(
        await request.json().catch(() => null),
      )
      const account = providerResult.success
        ? providerAccounts.find(
            ({ provider }) => provider === providerResult.data,
          )
        : undefined

      if (!providerResult.success || !consentResult.success) {
        return HttpResponse.json(
          createApiError(
            'PUBLIC_STATS_CONSENT_REQUIRED',
            'Explicit consent is required before public statistics are fetched.',
            [],
          ),
          { status: 400 },
        )
      }

      if (account === undefined) {
        return HttpResponse.json(
          createApiError(
            'PROVIDER_ACCOUNT_NOT_LINKED',
            'Link this provider account before refreshing its public statistics.',
            { provider: providerResult.data },
          ),
          { status: 404 },
        )
      }

      const now = new Date().toISOString()
      const updatedAccount = ProviderAccountSchema.parse({
        ...account,
        activityAccess: 'public_solved_count',
        verifiedActivity: account.verifiedActivity,
        publicStatsConsentAt: account.publicStatsConsentAt ?? now,
        publicStats: {
          status: 'available',
          solvedCount: mockSolvedCounts[providerResult.data],
          complete: true,
          source: mockStatsSources[providerResult.data],
          fetchedAt: now,
          stale: false,
        },
        updatedAt: now,
      })
      providerAccounts = providerAccounts.map((candidate) =>
        candidate.provider === providerResult.data ? updatedAccount : candidate,
      )

      return HttpResponse.json(
        ProviderAccountResponseSchema.parse({ data: updatedAccount }),
      )
    },
  ),
  http.get('/api/providers', () => HttpResponse.json(providersResponse)),
  http.get('/api/topics', () => HttpResponse.json(topicsResponse)),
  http.get('/api/unified-profile', () => {
    const providers = providerAccounts.map((account) => ({
      provider: account.provider,
      handle: account.handle,
      ...(account.publicStats.status === 'available'
        ? {
            solvedCount: account.publicStats.solvedCount,
            complete: account.publicStats.complete,
            fetchedAt: account.publicStats.fetchedAt,
          }
        : {}),
      stale:
        account.publicStats.status === 'unavailable' ||
        (account.publicStats.status === 'available' &&
          account.publicStats.stale),
      syncEnabled: account.syncEnabled ?? true,
    }))
    const solvedTotal = providers.reduce(
      (total, provider) => total + (provider.solvedCount ?? 0),
      0,
    )
    return HttpResponse.json(
      UnifiedProfileResponseSchema.parse({
        data: {
          solvedTotal,
          providers,
          accounts: providerAccounts,
          completeness:
            providers.length > 0 &&
            providers.every((provider) => provider.complete)
              ? 'complete'
              : 'partial',
          staleProviders: providers
            .filter((provider) => provider.stale)
            .map((provider) => provider.provider),
          generatedAt: new Date().toISOString(),
        },
      }),
    )
  }),
  http.get('/api/activity', ({ request }) => {
    const providerResult = LinkableProviderSchema.safeParse(
      new URL(request.url).searchParams.get('provider'),
    )
    const provider = providerResult.success ? providerResult.data : undefined
    const data = mockPlatformEvents().filter(
      (event) => provider === undefined || event.provider === provider,
    )
    return HttpResponse.json(
      ProviderActivityResponseSchema.parse({
        data,
        meta: {
          partial: data.some((event) => event.completeness !== 'complete'),
          stale: false,
          providers: [],
        },
      }),
    )
  }),
  http.get('/api/contests', ({ request }) => {
    const url = new URL(request.url)
    const queryResult = ExternalContestsQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    )
    if (!queryResult.success) {
      return HttpResponse.json(
        createApiError(
          'INVALID_CONTEST_QUERY',
          'The contest query parameters are invalid.',
          queryResult.error.issues,
        ),
        { status: 400 },
      )
    }
    const data = mockContests()
      .filter(
        (contest) =>
          queryResult.data.provider === undefined ||
          contest.provider === queryResult.data.provider,
      )
      .filter(
        (contest) =>
          queryResult.data.status === undefined ||
          contest.status === queryResult.data.status,
      )
      .slice(0, queryResult.data.limit)
      .map((contest) => ExternalContestSchema.parse(contest))
    return HttpResponse.json(
      ExternalContestsResponseSchema.parse({
        data,
        meta: { partial: false, stale: false, providers: [] },
      }),
    )
  }),
  http.get('/api/analytics', ({ request }) => {
    const providerResult = LinkableProviderSchema.safeParse(
      new URL(request.url).searchParams.get('provider'),
    )
    const provider = providerResult.success ? providerResult.data : undefined
    const solvedByProvider = {
      codeforces: provider === undefined || provider === 'codeforces' ? 245 : 0,
      codechef: provider === undefined || provider === 'codechef' ? 118 : 0,
      leetcode: provider === undefined || provider === 'leetcode' ? 176 : 0,
      cses: 0,
    }
    return HttpResponse.json(
      UnifiedAnalyticsSchema.parse({
        solvedTotal: Object.values(solvedByProvider).reduce(
          (total, value) => total + value,
          0,
        ),
        solvedByProvider,
        solvedOverTime: { '2026-09-01': 4, '2026-09-02': 7 },
        solvedByDifficulty: { easy: 120, medium: 260, hard: 159 },
        topicCounts: { arrays: 90, graphs: 34, dynamic_programming: 27 },
        languageCounts: { Python: 140, Java: 85, 'C++': 70 },
        acceptanceRate: 68.4,
        ratingHistory: [],
        contestParticipation: [],
        dataCompleteness: 'partial',
        staleProviders: [],
        generatedAt: new Date().toISOString(),
      }),
    )
  }),
  http.post('/api/provider-accounts/:provider/sync', ({ params }) => {
    const providerResult = LinkableProviderSchema.safeParse(params.provider)
    const account = providerResult.success
      ? providerAccounts.find(
          ({ provider }) => provider === providerResult.data,
        )
      : undefined
    if (!providerResult.success || account === undefined) {
      return HttpResponse.json(
        createApiError(
          'PROVIDER_ACCOUNT_NOT_LINKED',
          'Link this provider account before requesting synchronization.',
          {},
        ),
        { status: 404 },
      )
    }
    const now = new Date().toISOString()
    const provider = providerResult.data
    const jobId =
      mockSyncJobs.get(provider) ??
      `00000000-0000-4000-8000-${String(providerOptionsIndex(provider)).padStart(12, '0')}`
    mockSyncJobs.set(provider, jobId)
    return HttpResponse.json(
      ProviderSyncRequestResponseSchema.parse({
        data: {
          provider,
          accepted: true,
          nextAllowedAt: new Date(Date.now() + 900_000).toISOString(),
          job: {
            id: jobId,
            provider,
            capability: 'linked_user_sync',
            status: 'queued',
            queuedAt: now,
            runAfter: now,
            attempts: 0,
          },
        },
      }),
      { status: 202 },
    )
  }),
  http.get('/api/provider-accounts/:provider/sync-status', ({ params }) => {
    const providerResult = LinkableProviderSchema.safeParse(params.provider)
    if (!providerResult.success) {
      return HttpResponse.json(
        createApiError(
          'UNSUPPORTED_LINK_PROVIDER',
          'That provider is not supported.',
          {},
        ),
        { status: 400 },
      )
    }
    const provider = providerResult.data
    const now = new Date().toISOString()
    const jobId = mockSyncJobs.get(provider)
    return HttpResponse.json(
      ProviderSyncStatusResponseSchema.parse({
        data: {
          provider,
          state: {
            provider,
            capability: 'linked_user_sync',
            status: jobId === undefined ? 'idle' : 'queued',
            attempts: 0,
            completeness: 'unknown',
            stale: false,
            nextRunAt: now,
          },
          ...(jobId === undefined
            ? {}
            : {
                job: {
                  id: jobId,
                  provider,
                  capability: 'linked_user_sync',
                  status: 'queued',
                  queuedAt: now,
                  runAfter: now,
                  attempts: 0,
                },
              }),
        },
      }),
    )
  }),
  http.delete('/api/provider-accounts/:provider/history', ({ params }) => {
    const providerResult = LinkableProviderSchema.safeParse(params.provider)
    if (!providerResult.success) {
      return HttpResponse.json(
        createApiError(
          'UNSUPPORTED_LINK_PROVIDER',
          'That provider is not supported.',
          {},
        ),
        { status: 400 },
      )
    }
    providerAccounts = providerAccounts.map((account) =>
      account.provider === providerResult.data
        ? ProviderAccountSchema.parse({
            ...account,
            activityAccess: 'not_enabled',
            verifiedActivity: { enabled: false, status: 'not_enabled' },
            publicStats: { status: 'not_synced' },
            updatedAt: new Date().toISOString(),
          })
        : account,
    )
    mockSyncJobs.delete(providerResult.data)
    return new HttpResponse(null, { status: 204 })
  }),
  http.get('/api/problems/:provider/:externalId', ({ params }) => {
    const providerResult = LinkableProviderSchema.safeParse(params.provider)
    if (!providerResult.success) {
      return HttpResponse.json(
        createApiError(
          'PROBLEM_NOT_FOUND',
          'That problem is not available.',
          {},
        ),
        { status: 404 },
      )
    }
    const provider = providerResult.data
    const externalId = String(params.externalId)
    const fixture = problemFixtures.find(
      (problem) =>
        problem.provider === provider && problem.externalId === externalId,
    )
    const canonicalUrl = platformCanonicalUrl(provider, externalId)
    const summary = ExternalProblemSummarySchema.parse(
      fixture ?? {
        provider,
        externalId,
        title:
          provider === 'codechef'
            ? 'Add Two Numbers'
            : provider === 'leetcode'
              ? 'Two Sum'
              : 'Provider problem',
        canonicalUrl,
        normalizedDifficulty: provider === 'leetcode' ? 'easy' : 'medium',
        providerTags:
          provider === 'leetcode'
            ? ['Array', 'Hash Table']
            : ['implementation'],
        topics: ['arrays'],
        contentAvailable: true,
        extractionStrategy: 'official_json',
        schemaVersion: `${provider}-mock-v1`,
        completeness: 'complete',
        stale: false,
        fetchedAt: new Date().toISOString(),
      },
    )
    const content = ProblemContentSchema.parse({
      provider,
      externalId,
      canonicalUrl,
      title: summary.title,
      statementHtml: `<p>Use the public provider page to solve <strong>${summary.title}</strong>.</p>`,
      statementText: `Use the public provider page to solve ${summary.title}.`,
      constraints: ['Input and output follow the provider statement.'],
      examples: [{ input: '1 2', output: '3' }],
      hints: ['Start by identifying the invariant in the input.'],
      isPaidOnly: summary.isPaidOnly ?? false,
      completeness: 'complete',
      provenance: platformProvenance(provider, externalId, canonicalUrl),
    })
    return HttpResponse.json(
      ProblemDetailResponseSchema.parse({ data: { summary, content } }),
    )
  }),
  http.get('/api/recommendations', async () => {
    await delay(mockDelayMs)
    return HttpResponse.json(recommendationResponse())
  }),
  http.post('/api/recommendations/refresh', async () => {
    await delay(mockDelayMs)
    recommendationGeneration += 1
    return HttpResponse.json(recommendationResponse())
  }),
  http.patch(
    '/api/recommendation-items/:itemId/feedback',
    async ({ params, request }) => {
      const itemId = String(params.itemId)
      const inputResult = RecommendationFeedbackInputSchema.safeParse(
        await request.json().catch(() => null),
      )

      if (!inputResult.success) {
        return HttpResponse.json(
          createApiError(
            'INVALID_RECOMMENDATION_FEEDBACK',
            'The recommendation feedback is invalid.',
            inputResult.error.issues,
          ),
          { status: 400 },
        )
      }

      const current = recommendationFeedback.get(itemId) ?? {}
      const next = { ...current, ...inputResult.data }
      recommendationFeedback.set(itemId, next)
      const now = new Date().toISOString()

      return HttpResponse.json(
        RecommendationFeedbackResponseSchema.parse({
          data: {
            id: itemId,
            recommendationItemId: itemId,
            ...next,
            createdAt: now,
            updatedAt: now,
          },
        }),
      )
    },
  ),
  http.post('/api/recommendation-items/:itemId/dismiss', ({ params }) => {
    const item = recommendationProblems().find(
      (problem) =>
        recommendationItemId(recommendationProblems().indexOf(problem)) ===
        params.itemId,
    )

    if (item === undefined) {
      return HttpResponse.json(
        createApiError(
          'RECOMMENDATION_ITEM_NOT_FOUND',
          'The recommendation item could not be found.',
          {},
        ),
        { status: 404 },
      )
    }

    dismissedRecommendationIds.add(`${item.provider}:${item.externalId}`)
    return HttpResponse.json(
      RecommendationDismissalResponseSchema.parse({
        data: {
          provider: item.provider,
          externalId: item.externalId,
          dismissedAt: new Date().toISOString(),
          problem: item,
        },
      }),
    )
  }),
  http.get('/api/recommendation-dismissals', () =>
    HttpResponse.json(
      RecommendationDismissalsResponseSchema.parse({
        data: [...dismissedRecommendationIds].map((key) => {
          const separator = key.indexOf(':')
          const provider = key.slice(0, separator)
          const externalId = key.slice(separator + 1)
          const problem = problemFixtures.find(
            (candidate) =>
              `${candidate.provider}:${candidate.externalId}` === key,
          )

          return {
            provider,
            externalId,
            dismissedAt: new Date().toISOString(),
            ...(problem === undefined ? {} : { problem }),
          }
        }),
      }),
    ),
  ),
  http.post(
    '/api/recommendation-dismissals/:provider/:externalId',
    ({ params }) => {
      const provider = String(params.provider)
      const externalId = String(params.externalId)
      const key = `${provider}:${externalId}`
      const problem = problemFixtures.find(
        (candidate) =>
          candidate.provider === provider &&
          candidate.externalId === externalId,
      )

      if (problem === undefined) {
        return HttpResponse.json(
          createApiError(
            'RECOMMENDATION_ITEM_NOT_FOUND',
            'That problem is not in the trusted catalog.',
            {},
          ),
          { status: 404 },
        )
      }

      dismissedRecommendationIds.add(key)
      return HttpResponse.json(
        RecommendationDismissalResponseSchema.parse({
          data: {
            provider,
            externalId,
            dismissedAt: new Date().toISOString(),
            problem,
          },
        }),
      )
    },
  ),
  http.delete(
    '/api/recommendation-dismissals/:provider/:externalId',
    ({ params }) => {
      const provider = String(params.provider)
      const externalId = String(params.externalId)
      dismissedRecommendationIds.delete(`${provider}:${externalId}`)
      return HttpResponse.json(
        RecommendationRestorationResponseSchema.parse({
          data: { provider, externalId, restored: true },
        }),
      )
    },
  ),
  http.get('/api/problems', async ({ request }) => {
    await delay(mockDelayMs)

    const url = new URL(request.url)
    const rawQuery = Object.fromEntries(url.searchParams)
    const mockScenario = url.searchParams.get('scenario')
    const queryResult =
      ExternalProblemCatalogQueryParamsSchema.safeParse(rawQuery)

    if (!queryResult.success) {
      const errorResponse = createApiError(
        'INVALID_QUERY_PARAMETERS',
        'The external problem catalog query parameters are invalid.',
        queryResult.error.issues,
      )

      return HttpResponse.json(errorResponse, { status: 400 })
    }

    if (mockScenario === 'error') {
      const failureCount =
        (transientScenarioFailureCounts.get(mockScenario) ?? 0) + 1
      transientScenarioFailureCounts.set(mockScenario, failureCount)

      if (failureCount <= 2) {
        const errorResponse = createApiError(
          'CATALOG_REQUEST_FAILED',
          'The problem catalog could not be loaded.',
          { scenario: mockScenario },
        )

        return HttpResponse.json(errorResponse, { status: 500 })
      }
    }

    if (mockScenario === 'rate-limited') {
      const errorResponse = createApiError(
        'PROVIDER_RATE_LIMITED',
        'Codeforces is temporarily rate limiting catalog requests.',
        { provider: 'codeforces' },
      )

      return HttpResponse.json(errorResponse, { status: 429 })
    }

    if (mockScenario === 'unavailable') {
      const errorResponse = createApiError(
        'PROVIDER_UNAVAILABLE',
        'Codeforces is temporarily unavailable.',
        { provider: 'codeforces' },
      )

      return HttpResponse.json(errorResponse, { status: 503 })
    }

    const {
      search,
      provider,
      difficulty,
      topic,
      status,
      minRating,
      maxRating,
      page,
      pageSize,
    } = queryResult.data
    let filteredProblems = problemFixtures

    if (search) {
      const normalizedSearch = normalizeSearchText(search)
      filteredProblems = filteredProblems.filter((problem) =>
        [problem.title, problem.externalId, ...problem.providerTags].some(
          (value) => normalizeSearchText(value).includes(normalizedSearch),
        ),
      )
    }

    if (provider) {
      filteredProblems = filteredProblems.filter(
        (problem) => problem.provider === provider,
      )
    }

    if (difficulty) {
      filteredProblems = filteredProblems.filter(
        (problem) => problem.normalizedDifficulty === difficulty,
      )
    }

    if (topic) {
      filteredProblems = filteredProblems.filter((problem) =>
        problem.topics.includes(topic),
      )
    }

    if (status) {
      filteredProblems = filteredProblems.filter(
        (problem) => problem.learnerStatus === status,
      )
    }

    if (minRating !== undefined || maxRating !== undefined) {
      filteredProblems = filteredProblems.filter((problem) => {
        const rating = problem.providerDifficulty

        return (
          typeof rating === 'number' &&
          (minRating === undefined || rating >= minRating) &&
          (maxRating === undefined || rating <= maxRating)
        )
      })
    }

    const total = filteredProblems.length
    const totalPages = Math.ceil(total / pageSize)
    const startIndex = (page - 1) * pageSize
    const endIndex = startIndex + pageSize
    const summaries = filteredProblems
      .slice(startIndex, endIndex)
      .map((problem) => ExternalProblemSummarySchema.parse(problem))
    const warnings =
      mockScenario === 'partial'
        ? [
            {
              provider: 'codeforces' as const,
              code: 'PARTIAL_RESULTS',
              message:
                'Codeforces returned only part of the catalog. Available problems are shown.',
            },
          ]
        : mockScenario === 'stale'
          ? [
              {
                provider: 'codeforces' as const,
                code: 'STALE_DATA',
                message:
                  'Showing the most recent cached Codeforces catalog while fresh data is unavailable.',
              },
            ]
          : []
    const catalogResponse = ExternalProblemCatalogResponseSchema.parse({
      data: summaries,
      meta: {
        page,
        pageSize,
        total,
        totalPages,
        partial: mockScenario === 'partial',
        warnings,
      },
    })

    return HttpResponse.json(catalogResponse)
  }),
]
