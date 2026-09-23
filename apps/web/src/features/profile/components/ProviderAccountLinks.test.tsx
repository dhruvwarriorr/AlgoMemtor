import { renderToStaticMarkup } from 'react-dom/server'
import type { ProviderAccount } from '@algomemtor/shared-contracts'
import { describe, expect, it, vi } from 'vitest'

const mutation = () => ({
  error: null,
  isPending: false,
  mutateAsync: vi.fn(),
  reset: vi.fn(),
})

const base = {
  consentScope: 'store_public_profile_reference',
  activityAccess: 'not_enabled',
  verifiedActivity: { enabled: false, status: 'not_enabled' },
  publicStats: { status: 'not_synced' },
  linkedAt: '2026-09-20T12:00:00.000Z',
  updatedAt: '2026-09-20T12:00:00.000Z',
} as const

const accounts: ProviderAccount[] = [
  {
    ...base,
    provider: 'codeforces',
    handle: 'tourist',
    profileUrl: 'https://codeforces.com/profile/tourist',
    verification: 'verified',
    verifiedAt: '2026-09-21T12:00:00.000Z',
  },
  {
    ...base,
    provider: 'codechef',
    handle: 'chef_learner',
    profileUrl: 'https://www.codechef.com/users/chef_learner',
    verification: 'not_verified',
    verificationChallenge: {
      code: 'AM-ABCD2345',
      expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    },
  },
  {
    ...base,
    provider: 'leetcode',
    handle: 'leet-learner',
    profileUrl: 'https://leetcode.com/u/leet-learner/',
    verification: 'not_verified',
  },
]

vi.mock('@/app/useNotification', () => ({
  useNotification: () => ({ notify: vi.fn() }),
}))

vi.mock('@/features/platform/hooks', () => ({
  useDeleteProviderHistory: () => mutation(),
  useProviderSync: () => mutation(),
  useProviderSyncStatus: () => ({ data: undefined }),
}))

vi.mock('../hooks/useProviderAccounts', () => ({
  useProviderAccounts: () => ({
    data: { data: accounts },
    isError: false,
    isPending: false,
  }),
  useDisconnectProviderAccount: () => mutation(),
  useLinkProviderAccount: () => mutation(),
  useProviderVerification: () => ({ start: mutation(), check: mutation() }),
}))

import { ProviderAccountLinks } from './ProviderAccountLinks'

describe('ProviderAccountLinks verification', () => {
  it('shows verified, in-progress, and unverified handles distinctly', () => {
    const markup = renderToStaticMarkup(
      <ProviderAccountLinks idPrefix="test" />,
    )

    // Only the verified Codeforces handle carries the badge.
    expect(markup.match(/Verified/g)).toHaveLength(1)
    // The open CodeChef challenge shows its code, steps, and countdown.
    expect(markup).toContain('AM-ABCD2345')
    expect(markup).toContain('Add it to your name on your CodeChef profile')
    expect(markup).toMatch(/Expires in (19|20) min/)
    expect(markup).toContain('Check now')
    // LeetCode has no challenge yet, so it offers to start one.
    expect(markup.match(/Verify ownership/g)).toHaveLength(1)
    // CSES links only through the browser connector.
    expect(markup).toContain('Connect it with the browser connector below.')
  })
})
