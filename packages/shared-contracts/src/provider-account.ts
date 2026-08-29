import { z } from 'zod'

const hasUniqueValues = (values: readonly string[]) =>
  new Set(values).size === values.length

export const LinkableProviderSchema = z.enum([
  'codeforces',
  'codechef',
  'leetcode',
])

export type LinkableProvider = z.infer<typeof LinkableProviderSchema>

export const PublicProviderHandleSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^(?=.*[A-Za-z0-9])[A-Za-z0-9_.-]+$/,
    'Use only letters, numbers, dots, underscores, or hyphens.',
  )

export type PublicProviderHandle = z.infer<typeof PublicProviderHandleSchema>

export const ProviderAccountConsentScopeSchema = z.literal(
  'store_public_profile_reference',
)

export type ProviderAccountConsentScope = z.infer<
  typeof ProviderAccountConsentScopeSchema
>

export const ProviderAccountActivityAccessSchema = z.enum([
  'not_enabled',
  'public_solved_count',
])

export type ProviderAccountActivityAccess = z.infer<
  typeof ProviderAccountActivityAccessSchema
>

export const ProviderPublicStatsSourceSchema = z.enum([
  'codeforces_api',
  'codechef_public_profile_html',
  'leetcode_website_graphql',
])

export type ProviderPublicStatsSource = z.infer<
  typeof ProviderPublicStatsSourceSchema
>

export const ProviderPublicStatsErrorCodeSchema = z.enum([
  'PROVIDER_ACCOUNT_NOT_FOUND',
  'PROVIDER_TIMEOUT',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_INVALID_RESPONSE',
])

export type ProviderPublicStatsErrorCode = z.infer<
  typeof ProviderPublicStatsErrorCodeSchema
>

const ProviderPublicStatsAvailableSchema = z
  .object({
    status: z.literal('available'),
    solvedCount: z.number().int().nonnegative(),
    complete: z.boolean(),
    source: ProviderPublicStatsSourceSchema,
    fetchedAt: z.iso.datetime({ offset: true }),
    stale: z.boolean(),
    lastErrorCode: ProviderPublicStatsErrorCodeSchema.optional(),
    lastAttemptedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((stats, context) => {
    const hasFailure =
      stats.lastErrorCode !== undefined && stats.lastAttemptedAt !== undefined

    if (stats.stale !== hasFailure) {
      context.addIssue({
        code: 'custom',
        message: 'Stale public statistics require a recorded refresh failure.',
        path: ['stale'],
      })
    }
  })

export const ProviderPublicStatsSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('not_synced') }).strict(),
  ProviderPublicStatsAvailableSchema,
  z
    .object({
      status: z.literal('unavailable'),
      attemptedAt: z.iso.datetime({ offset: true }),
      errorCode: ProviderPublicStatsErrorCodeSchema,
      retryable: z.boolean(),
    })
    .strict(),
])

export type ProviderPublicStats = z.infer<typeof ProviderPublicStatsSchema>

export const LinkProviderAccountRequestSchema = z
  .object({
    handle: PublicProviderHandleSchema,
    consent: z.literal(true),
  })
  .strict()

export type LinkProviderAccountRequest = z.infer<
  typeof LinkProviderAccountRequestSchema
>

export const RefreshProviderPublicStatsRequestSchema = z
  .object({ consent: z.literal(true) })
  .strict()

export type RefreshProviderPublicStatsRequest = z.infer<
  typeof RefreshProviderPublicStatsRequestSchema
>

const canonicalProfileUrl = (
  provider: LinkableProvider,
  handle: PublicProviderHandle,
) => {
  const encodedHandle = encodeURIComponent(handle)

  if (provider === 'codeforces') {
    return `https://codeforces.com/profile/${encodedHandle}`
  }

  if (provider === 'codechef') {
    return `https://www.codechef.com/users/${encodedHandle}`
  }

  return `https://leetcode.com/u/${encodedHandle}/`
}

export const ProviderAccountSchema = z
  .object({
    provider: LinkableProviderSchema,
    handle: PublicProviderHandleSchema,
    profileUrl: z.url(),
    consentScope: ProviderAccountConsentScopeSchema,
    verification: z.literal('not_verified'),
    activityAccess: ProviderAccountActivityAccessSchema,
    publicStatsConsentAt: z.iso.datetime({ offset: true }).optional(),
    publicStats: ProviderPublicStatsSchema,
    linkedAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine(
    (
      {
        activityAccess,
        handle,
        profileUrl,
        provider,
        publicStats,
        publicStatsConsentAt,
      },
      context,
    ) => {
      if (profileUrl !== canonicalProfileUrl(provider, handle)) {
        context.addIssue({
          code: 'custom',
          message: 'Provider profile URL is not canonical.',
          path: ['profileUrl'],
        })
      }

      const expectedSourceByProvider: Record<
        LinkableProvider,
        ProviderPublicStatsSource
      > = {
        codeforces: 'codeforces_api',
        codechef: 'codechef_public_profile_html',
        leetcode: 'leetcode_website_graphql',
      }

      if (
        publicStats.status === 'available' &&
        publicStats.source !== expectedSourceByProvider[provider]
      ) {
        context.addIssue({
          code: 'custom',
          message: 'The public statistics source does not match the provider.',
          path: ['publicStats', 'source'],
        })
      }

      const hasStatsConsent = publicStatsConsentAt !== undefined
      const hasStatsAccess = activityAccess === 'public_solved_count'
      const hasStatsAttempt = publicStats.status !== 'not_synced'

      if (
        hasStatsConsent !== hasStatsAccess ||
        hasStatsAccess !== hasStatsAttempt
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Public statistics access, consent, and sync state must agree.',
          path: ['activityAccess'],
        })
      }
    },
  )

export type ProviderAccount = z.infer<typeof ProviderAccountSchema>

export const ProviderAccountResponseSchema = z
  .object({ data: ProviderAccountSchema })
  .strict()

export type ProviderAccountResponse = z.infer<
  typeof ProviderAccountResponseSchema
>

export const DisconnectProviderAccountResponseSchema = z
  .object({
    data: z.object({ provider: LinkableProviderSchema }).strict(),
  })
  .strict()

export type DisconnectProviderAccountResponse = z.infer<
  typeof DisconnectProviderAccountResponseSchema
>

export const ProviderAccountsResponseSchema = z
  .object({
    data: z
      .array(ProviderAccountSchema)
      .max(LinkableProviderSchema.options.length)
      .refine(
        (accounts) => hasUniqueValues(accounts.map(({ provider }) => provider)),
        'Each provider can have at most one linked account.',
      ),
  })
  .strict()

export type ProviderAccountsResponse = z.infer<
  typeof ProviderAccountsResponseSchema
>
