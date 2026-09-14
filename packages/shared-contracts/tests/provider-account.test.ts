import { describe, expect, it } from 'vitest'

import {
  LinkProviderAccountRequestSchema,
  ProviderAccountSchema,
  ProviderAccountsResponseSchema,
  ProviderActivitySyncResponseSchema,
  RefreshProviderPublicStatsRequestSchema,
  SetProviderActivityConsentRequestSchema,
} from '../src/provider-account.js'

const account = {
  provider: 'codeforces',
  handle: 'tourist',
  profileUrl: 'https://codeforces.com/profile/tourist',
  consentScope: 'store_public_profile_reference',
  verification: 'not_verified',
  activityAccess: 'not_enabled',
  verifiedActivity: { enabled: false, status: 'not_enabled' },
  publicStats: { status: 'not_synced' },
  linkedAt: '2026-08-27T12:00:00.000Z',
  updatedAt: '2026-08-27T12:00:00.000Z',
} as const

describe('provider account contracts', () => {
  it('accepts a consented public handle and canonical profile URL', () => {
    expect(
      LinkProviderAccountRequestSchema.parse({
        handle: 'tourist',
        consent: true,
      }),
    ).toEqual({ handle: 'tourist', consent: true })
    expect(ProviderAccountSchema.parse(account)).toEqual(account)
  })

  it('requires explicit consent and rejects credential-like handles', () => {
    expect(
      LinkProviderAccountRequestSchema.safeParse({
        handle: 'tourist',
        consent: false,
      }).success,
    ).toBe(false)
    expect(
      RefreshProviderPublicStatsRequestSchema.safeParse({ consent: false })
        .success,
    ).toBe(false)
    expect(
      LinkProviderAccountRequestSchema.safeParse({
        handle: 'https://codeforces.com/profile/tourist',
        consent: true,
      }).success,
    ).toBe(false)
  })

  it('rejects arbitrary or mismatched provider profile URLs', () => {
    expect(
      ProviderAccountSchema.safeParse({
        ...account,
        profileUrl: 'https://example.com/profile/tourist',
      }).success,
    ).toBe(false)

    expect(
      ProviderAccountSchema.safeParse({
        ...account,
        provider: 'leetcode',
      }).success,
    ).toBe(false)
  })

  it('allows at most one link for each provider', () => {
    expect(
      ProviderAccountsResponseSchema.safeParse({ data: [account, account] })
        .success,
    ).toBe(false)
  })

  it('accepts provider-matched public solved statistics', () => {
    expect(
      ProviderAccountSchema.safeParse({
        ...account,
        activityAccess: 'public_solved_count',
        publicStatsConsentAt: '2026-08-27T12:01:00.000Z',
        publicStats: {
          status: 'available',
          solvedCount: 42,
          complete: true,
          source: 'codeforces_api',
          fetchedAt: '2026-08-27T12:01:00.000Z',
          stale: false,
        },
      }).success,
    ).toBe(true)

    expect(
      ProviderAccountSchema.safeParse({
        ...account,
        activityAccess: 'public_solved_count',
        publicStatsConsentAt: '2026-08-27T12:01:00.000Z',
        publicStats: {
          status: 'available',
          solvedCount: 42,
          complete: true,
          source: 'leetcode_website_graphql',
          fetchedAt: '2026-08-27T12:01:00.000Z',
          stale: false,
        },
      }).success,
    ).toBe(false)
  })

  it('validates consented verified activity states and sync summaries', () => {
    expect(
      SetProviderActivityConsentRequestSchema.parse({
        enabled: true,
        policyVersion: 'codeforces-public-activity-v1',
      }),
    ).toEqual({
      enabled: true,
      policyVersion: 'codeforces-public-activity-v1',
    })
    expect(
      ProviderAccountSchema.safeParse({
        ...account,
        verifiedActivity: {
          enabled: true,
          status: 'synced',
          lastSucceededAt: '2026-08-27T12:01:00.000Z',
          acceptedProblemCount: 3,
          complete: true,
        },
      }).success,
    ).toBe(true)
    expect(
      ProviderActivitySyncResponseSchema.parse({
        data: {
          provider: 'codeforces',
          discovered: 3,
          added: 2,
          confirmedSolved: 2,
          complete: true,
          syncedAt: '2026-08-27T12:01:00.000Z',
          nextAllowedAt: '2026-08-27T12:16:00.000Z',
        },
      }).data.confirmedSolved,
    ).toBe(2)
  })
})
