import { z } from 'zod'

const hasUniqueValues = (values: readonly string[]) =>
  new Set(values).size === values.length

export const LinkableProviderSchema = z.enum([
  'codeforces',
  'codechef',
  'leetcode',
  'cses',
])

// Providers whose accounts link only through the browser connector, because
// they publish no public per-user data a server could read.
export const ConnectorOnlyProviderSchema = z.enum(['cses'])

export type ConnectorOnlyProvider = z.infer<typeof ConnectorOnlyProviderSchema>

export const isConnectorOnlyProvider = (
  provider: string,
): provider is ConnectorOnlyProvider =>
  ConnectorOnlyProviderSchema.safeParse(provider).success

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
  'browser_connector',
])

export type ProviderPublicStatsSource = z.infer<
  typeof ProviderPublicStatsSourceSchema
>

export const ProviderPublicStatsErrorCodeSchema = z.enum([
  'PROVIDER_ACCOUNT_NOT_FOUND',
  'PROVIDER_TIMEOUT',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_BLOCKED',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_INVALID_RESPONSE',
])

export type ProviderPublicStatsErrorCode = z.infer<
  typeof ProviderPublicStatsErrorCodeSchema
>

export const ProviderVerifiedActivityStatusSchema = z.enum([
  'not_enabled',
  'not_synced',
  'synced',
  'partial',
  'error',
])

export type ProviderVerifiedActivityStatus = z.infer<
  typeof ProviderVerifiedActivityStatusSchema
>

export const ProviderVerifiedActivityErrorCodeSchema = z.enum([
  'PROVIDER_ACTIVITY_CONSENT_REQUIRED',
  'PROVIDER_ACTIVITY_COOLDOWN',
  'PROVIDER_ACCOUNT_NOT_FOUND',
  'PROVIDER_TIMEOUT',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_BLOCKED',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_INVALID_RESPONSE',
])

export type ProviderVerifiedActivityErrorCode = z.infer<
  typeof ProviderVerifiedActivityErrorCodeSchema
>

export const ProviderVerifiedActivitySchema = z
  .object({
    enabled: z.boolean(),
    status: ProviderVerifiedActivityStatusSchema,
    consentedAt: z.iso.datetime({ offset: true }).optional(),
    lastAttemptedAt: z.iso.datetime({ offset: true }).optional(),
    lastSucceededAt: z.iso.datetime({ offset: true }).optional(),
    acceptedProblemCount: z.number().int().nonnegative().optional(),
    complete: z.boolean().optional(),
    errorCode: ProviderVerifiedActivityErrorCodeSchema.optional(),
    retryAfter: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()

export type ProviderVerifiedActivity = z.infer<
  typeof ProviderVerifiedActivitySchema
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

export const SetProviderActivityConsentRequestSchema = z
  .object({
    enabled: z.boolean(),
    policyVersion: z.literal('codeforces-public-activity-v1'),
  })
  .strict()

export type SetProviderActivityConsentRequest = z.infer<
  typeof SetProviderActivityConsentRequestSchema
>

export const ProviderActivitySyncResponseSchema = z
  .object({
    data: z
      .object({
        provider: z.literal('codeforces'),
        discovered: z.number().int().nonnegative(),
        added: z.number().int().nonnegative(),
        confirmedSolved: z.number().int().nonnegative(),
        complete: z.boolean(),
        syncedAt: z.iso.datetime({ offset: true }),
        nextAllowedAt: z.iso.datetime({ offset: true }),
      })
      .strict(),
  })
  .strict()

export type ProviderActivitySyncResponse = z.infer<
  typeof ProviderActivitySyncResponseSchema
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

  if (provider === 'cses') {
    return `https://cses.fi/user/${encodedHandle}`
  }

  return `https://leetcode.com/u/${encodedHandle}/`
}

export const ProviderAccountVerificationStatusSchema = z.enum([
  'not_verified',
  'verified',
])

export type ProviderAccountVerificationStatus = z.infer<
  typeof ProviderAccountVerificationStatusSchema
>

// A one-time code the learner places in a public profile field to prove the
// handle is theirs. It is shown only to the owning learner.
export const ProviderVerificationCodeSchema = z
  .string()
  .regex(/^AM-[A-Z2-9]{8}$/, 'Invalid verification code.')

export const ProviderVerificationChallengeSchema = z
  .object({
    code: ProviderVerificationCodeSchema,
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict()

export type ProviderVerificationChallenge = z.infer<
  typeof ProviderVerificationChallengeSchema
>

export const ProviderAccountSchema = z
  .object({
    provider: LinkableProviderSchema,
    handle: PublicProviderHandleSchema,
    profileUrl: z.url(),
    consentScope: ProviderAccountConsentScopeSchema,
    verification: ProviderAccountVerificationStatusSchema,
    verifiedAt: z.iso.datetime({ offset: true }).optional(),
    verificationChallenge: ProviderVerificationChallengeSchema.optional(),
    // When the learner's browser connector last uploaded this account's data.
    connectorSyncedAt: z.iso.datetime({ offset: true }).optional(),
    activityAccess: ProviderAccountActivityAccessSchema,
    verifiedActivity: ProviderVerifiedActivitySchema,
    syncEnabled: z.boolean().optional(),
    disconnectedAt: z.iso.datetime({ offset: true }).optional(),
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
        verifiedActivity,
        handle,
        profileUrl,
        provider,
        publicStats,
        publicStatsConsentAt,
        verification,
        verificationChallenge,
        verifiedAt,
      },
      context,
    ) => {
      if ((verification === 'verified') !== (verifiedAt !== undefined)) {
        context.addIssue({
          code: 'custom',
          message: 'A verified account requires its verification time.',
          path: ['verifiedAt'],
        })
      }

      if (verification === 'verified' && verificationChallenge !== undefined) {
        context.addIssue({
          code: 'custom',
          message: 'A verified account has no open verification challenge.',
          path: ['verificationChallenge'],
        })
      }

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
        cses: 'browser_connector',
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
        hasStatsAccess !== hasStatsAttempt ||
        (hasStatsAttempt && !hasStatsConsent)
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Public statistics access, consent, and sync state must agree.',
          path: ['activityAccess'],
        })
      }

      const activityStatusEnabled = verifiedActivity.enabled
      const activityStatusNotEnabled = verifiedActivity.status === 'not_enabled'
      if (activityStatusEnabled === activityStatusNotEnabled) {
        context.addIssue({
          code: 'custom',
          message: 'Verified activity consent and status must agree.',
          path: ['verifiedActivity', 'status'],
        })
      }

      if (
        verifiedActivity.status === 'synced' ||
        verifiedActivity.status === 'partial'
      ) {
        if (
          verifiedActivity.lastSucceededAt === undefined ||
          verifiedActivity.acceptedProblemCount === undefined ||
          verifiedActivity.complete === undefined
        ) {
          context.addIssue({
            code: 'custom',
            message:
              'Successful verified activity requires a sync timestamp, count, and completeness flag.',
            path: ['verifiedActivity'],
          })
        }
      }

      if (
        verifiedActivity.status === 'error' &&
        verifiedActivity.errorCode === undefined
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Verified activity errors require a stable error code.',
          path: ['verifiedActivity', 'errorCode'],
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
