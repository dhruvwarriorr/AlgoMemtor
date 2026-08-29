import {
  ProviderAccountSchema,
  type LinkableProvider,
  type ProviderAccount,
} from '@algomemtor/shared-contracts'

import type { ProviderAccountRecord } from '../repositories/provider-account-repository.js'

export function providerProfileUrl(provider: LinkableProvider, handle: string) {
  const encodedHandle = encodeURIComponent(handle)

  if (provider === 'codeforces') {
    return `https://codeforces.com/profile/${encodedHandle}`
  }

  if (provider === 'codechef') {
    return `https://www.codechef.com/users/${encodedHandle}`
  }

  return `https://leetcode.com/u/${encodedHandle}/`
}

export function serializeProviderAccount(
  record: ProviderAccountRecord,
): ProviderAccount {
  const {
    solvedCount,
    statsAttemptedAt,
    statsComplete,
    statsErrorCode,
    statsErrorRetryable,
    statsFetchedAt,
    statsSource,
  } = record
  const hasSuccessfulStats =
    solvedCount !== null &&
    statsComplete !== null &&
    statsSource !== null &&
    statsFetchedAt !== null
  const hasFailedAttempt =
    statsAttemptedAt !== null &&
    statsErrorCode !== null &&
    statsErrorRetryable !== null
  const publicStats = hasSuccessfulStats
    ? {
        status: 'available' as const,
        solvedCount,
        complete: statsComplete,
        source: statsSource,
        fetchedAt: statsFetchedAt.toISOString(),
        stale: hasFailedAttempt,
        ...(hasFailedAttempt
          ? {
              lastErrorCode: statsErrorCode,
              lastAttemptedAt: statsAttemptedAt.toISOString(),
            }
          : {}),
      }
    : hasFailedAttempt
      ? {
          status: 'unavailable' as const,
          attemptedAt: statsAttemptedAt.toISOString(),
          errorCode: statsErrorCode,
          retryable: statsErrorRetryable,
        }
      : { status: 'not_synced' as const }

  return ProviderAccountSchema.parse({
    provider: record.provider,
    handle: record.externalHandle,
    profileUrl: providerProfileUrl(record.provider, record.externalHandle),
    consentScope: record.consentScope,
    verification: record.verificationStatus,
    activityAccess: record.activityAccess,
    ...(record.publicStatsConsentAt === null
      ? {}
      : { publicStatsConsentAt: record.publicStatsConsentAt.toISOString() }),
    publicStats,
    linkedAt: record.linkedAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  })
}
