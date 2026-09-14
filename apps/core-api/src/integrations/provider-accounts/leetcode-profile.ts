import {
  ProviderProfileSchema,
  type ProviderProfile,
  type PublicProviderHandle,
} from '@algomemtor/shared-contracts'
import { z } from 'zod'

import { ProviderError } from '../../errors/provider-error.js'
import { RequestGate } from '../../utils/request-gate.js'
import {
  fetchProviderJson,
  isProviderHostnameAllowed,
  type ProviderHttpRequest,
} from '../providers/provider-http-client.js'
import {
  ProviderPublicStatsError,
  type ProviderProfileFetcher,
} from './provider-public-stats.js'

const CountSchema = z
  .object({
    difficulty: z.string().trim().min(1),
    count: z.number().int().nonnegative(),
  })
  .passthrough()
const LanguageSchema = z
  .object({
    languageName: z.string().trim().min(1),
    problemsSolved: z.number().int().nonnegative(),
  })
  .passthrough()
const TopicSchema = z
  .object({
    tagName: z.string().trim().min(1),
    problemsSolved: z.number().int().nonnegative(),
  })
  .passthrough()
const TopicCategoriesSchema = z
  .object({
    advanced: z.array(TopicSchema).optional(),
    intermediate: z.array(TopicSchema).optional(),
    fundamental: z.array(TopicSchema).optional(),
  })
  .passthrough()
const ProfileEnvelopeSchema = z
  .object({
    data: z
      .object({
        matchedUser: z
          .object({
            username: z.string().trim().min(1),
            profile: z
              .object({
                realName: z.string().trim().nullish(),
                userAvatar: z.string().url().nullish(),
                ranking: z.number().int().positive().nullish(),
              })
              .passthrough()
              .optional(),
            badges: z
              .array(
                z
                  .object({ displayName: z.string().trim().min(1) })
                  .passthrough(),
              )
              .optional(),
            submitStatsGlobal: z
              .object({
                acSubmissionNum: z.array(CountSchema),
                totalSubmissionNum: z.array(CountSchema),
              })
              .passthrough()
              .optional(),
            languageProblemCount: z.array(LanguageSchema).optional(),
            tagProblemCounts: TopicCategoriesSchema.optional(),
            submissionCalendar: z.string().optional(),
          })
          .passthrough()
          .nullable(),
        userContestRanking: z
          .object({
            rating: z.number().finite().nullish(),
            globalRanking: z.number().int().positive().nullish(),
          })
          .nullable()
          .optional(),
      })
      .passthrough()
      .optional(),
    errors: z.array(z.object({ message: z.string().max(1000) })).optional(),
  })
  .passthrough()

const query = `query getUserProfile($username: String!) { matchedUser(username: $username) { username profile { realName userAvatar ranking } badges { displayName } submitStatsGlobal { acSubmissionNum { difficulty count } totalSubmissionNum { difficulty count } } languageProblemCount { languageName problemsSolved } tagProblemCounts { advanced { tagName problemsSolved } intermediate { tagName problemsSolved } fundamental { tagName problemsSolved } } submissionCalendar } userContestRanking(username: $username) { rating globalRanking } }`

const parseCalendar = (value: string | undefined) => {
  if (value === undefined) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
      return {}
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, count]) => {
        const numeric = typeof count === 'number' ? count : Number(count)
        return Number.isInteger(numeric) && numeric >= 0 ? [[key, numeric]] : []
      }),
    )
  } catch {
    return {}
  }
}

const safeHttpsUrl = (value: string | null | undefined) => {
  if (value === null || value === undefined) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

export type LeetCodeProfileFetcherOptions = {
  endpoint?: string
  timeoutMs?: number
  maxAttempts?: number
  minRequestIntervalMs?: number
  requestGate?: RequestGate
  fetchImpl?: typeof fetch
}

export class LeetCodeProfileFetcher implements ProviderProfileFetcher {
  readonly provider = 'leetcode' as const
  private readonly endpoint: URL
  private readonly fetchImpl: typeof fetch
  private readonly requestGate: RequestGate
  private readonly timeoutMs: number
  private readonly maxAttempts: number

  constructor(options: LeetCodeProfileFetcherOptions = {}) {
    this.endpoint = new URL(options.endpoint ?? 'https://leetcode.com/graphql')
    const hasCustomFetch = options.fetchImpl !== undefined
    if (
      this.endpoint.protocol !== 'https:' ||
      !isProviderHostnameAllowed(
        this.provider,
        this.endpoint.hostname,
        'leetcode.com',
        hasCustomFetch,
      ) ||
      this.endpoint.username !== '' ||
      this.endpoint.password !== '' ||
      this.endpoint.port !== '' ||
      this.endpoint.search !== '' ||
      this.endpoint.hash !== '' ||
      this.endpoint.pathname !== '/graphql'
    ) {
      throw new Error('The LeetCode profile URL is unsafe.')
    }
    this.fetchImpl = options.fetchImpl ?? fetch
    this.requestGate =
      options.requestGate ??
      new RequestGate({ minIntervalMs: options.minRequestIntervalMs ?? 1000 })
    this.timeoutMs = options.timeoutMs ?? 8000
    this.maxAttempts = options.maxAttempts ?? 2
  }

  async fetchProfile(
    handle: PublicProviderHandle,
    signal?: AbortSignal,
  ): Promise<ProviderProfile> {
    const body = await fetchProviderJson({
      provider: this.provider,
      url: this.endpoint,
      allowedHostname: 'leetcode.com',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        referer: 'https://leetcode.com/',
      },
      body: JSON.stringify({ query, variables: { username: handle } }),
      requestGate: this.requestGate,
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      maxAttempts: this.maxAttempts,
      maxResponseBytes: 2_000_000,
      ...(signal === undefined ? {} : { signal }),
    } satisfies ProviderHttpRequest)
    const envelope = ProfileEnvelopeSchema.safeParse(body)
    if (!envelope.success || envelope.data.errors?.length) {
      throw new ProviderError(
        'LeetCode returned an invalid profile response.',
        {
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: this.provider,
          retryable: false,
        },
      )
    }
    const user = envelope.data.data?.matchedUser
    if (user === null || user === undefined) {
      throw new ProviderPublicStatsError(
        'The LeetCode account was not found.',
        {
          provider: this.provider,
          code: 'PROVIDER_ACCOUNT_NOT_FOUND',
          retryable: false,
        },
      )
    }
    const solved = user.submitStatsGlobal?.acSubmissionNum.find(
      (item) => item.difficulty === 'All',
    )?.count
    const total = user.submitStatsGlobal?.totalSubmissionNum.find(
      (item) => item.difficulty === 'All',
    )?.count
    const acceptanceRate =
      solved !== undefined && total !== undefined && total > 0
        ? (solved / total) * 100
        : undefined
    const profileUrl = new URL(
      `/u/${encodeURIComponent(user.username)}/`,
      'https://leetcode.com',
    ).toString()
    const fetchedAt = new Date().toISOString()
    const topicCounts = Object.values(user.tagProblemCounts ?? {}).reduce<
      Record<string, number>
    >((counts, items) => {
      if (!Array.isArray(items)) return counts
      for (const rawItem of items) {
        const item = TopicSchema.safeParse(rawItem)
        if (item.success) {
          counts[item.data.tagName] =
            (counts[item.data.tagName] ?? 0) + item.data.problemsSolved
        }
      }
      return counts
    }, {})
    const contestRanking = envelope.data.data?.userContestRanking
    return ProviderProfileSchema.parse({
      provider: this.provider,
      externalId: user.username,
      handle: user.username,
      ...(user.profile?.realName ? { displayName: user.profile.realName } : {}),
      profileUrl,
      ...(safeHttpsUrl(user.profile?.userAvatar) === undefined
        ? {}
        : { avatarUrl: safeHttpsUrl(user.profile?.userAvatar) }),
      ...(contestRanking?.globalRanking !== undefined &&
      contestRanking.globalRanking !== null
        ? { globalRank: contestRanking.globalRanking }
        : user.profile?.ranking === undefined || user.profile.ranking === null
        ? {}
        : { globalRank: user.profile.ranking }),
      ...(contestRanking?.rating === undefined || contestRanking.rating === null
        ? {}
        : { rating: contestRanking.rating }),
      ...(solved === undefined ? {} : { solvedCount: solved }),
      ...(acceptanceRate === undefined ? {} : { acceptanceRate }),
      languageCounts: Object.fromEntries(
        (user.languageProblemCount ?? []).map((item) => [
          item.languageName,
          item.problemsSolved,
        ]),
      ),
      topicCounts,
      badges: (user.badges ?? []).map((badge) => badge.displayName),
      calendar: parseCalendar(user.submissionCalendar),
      completeness: 'partial',
      provenance: {
        provider: this.provider,
        providerId: user.username,
        canonicalUrl: profileUrl,
        sourceUrl: this.endpoint.toString(),
        extractionStrategy: 'public_graphql',
        schemaVersion: 'leetcode-matched-user-v2',
        completeness: 'partial',
        fetchedAt,
        stale: false,
      },
    })
  }
}
