import {
  DisconnectProviderAccountResponseSchema,
  ProviderAccountResponseSchema,
  ProviderAccountsResponseSchema,
  ProviderActivitySyncResponseSchema,
  RefreshProviderPublicStatsRequestSchema,
  SetProviderActivityConsentRequestSchema,
  type LinkableProvider,
  type LinkProviderAccountRequest,
  type ProviderAccountResponse,
  type ProviderAccountsResponse,
  type ProviderActivitySyncResponse,
  type RefreshProviderPublicStatsRequest,
} from '@algomemtor/shared-contracts'

import { requestJson } from '@/features/discovery/api/client'

type RequestOptions = {
  signal?: AbortSignal
}

export function fetchProviderAccounts({ signal }: RequestOptions = {}) {
  return requestJson<ProviderAccountsResponse>('/api/provider-accounts', {
    authentication: 'required',
    schema: ProviderAccountsResponseSchema,
    signal,
  })
}

export function linkProviderAccount(
  provider: LinkableProvider,
  account: LinkProviderAccountRequest,
) {
  return requestJson<ProviderAccountResponse>(
    `/api/provider-accounts/${encodeURIComponent(provider)}`,
    {
      authentication: 'required',
      body: JSON.stringify(account),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
      schema: ProviderAccountResponseSchema,
    },
  )
}

export function disconnectProviderAccount(provider: LinkableProvider) {
  return requestJson(`/api/provider-accounts/${encodeURIComponent(provider)}`, {
    authentication: 'required',
    method: 'DELETE',
    schema: DisconnectProviderAccountResponseSchema,
  })
}

export function refreshProviderPublicStats(
  provider: LinkableProvider,
  consent: RefreshProviderPublicStatsRequest = { consent: true },
) {
  return requestJson<ProviderAccountResponse>(
    `/api/provider-accounts/${encodeURIComponent(provider)}/public-stats/refresh`,
    {
      authentication: 'required',
      body: JSON.stringify(
        RefreshProviderPublicStatsRequestSchema.parse(consent),
      ),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      schema: ProviderAccountResponseSchema,
    },
  )
}

export function setProviderActivityConsent(
  provider: LinkableProvider,
  consent: { enabled: boolean; policyVersion: 'codeforces-public-activity-v1' },
) {
  return requestJson<ProviderAccountResponse>(
    `/api/provider-accounts/${encodeURIComponent(provider)}/activity-consent`,
    {
      authentication: 'required',
      body: JSON.stringify(
        SetProviderActivityConsentRequestSchema.parse(consent),
      ),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
      schema: ProviderAccountResponseSchema,
    },
  )
}

export function syncProviderActivity(provider: LinkableProvider) {
  return requestJson<ProviderActivitySyncResponse>(
    `/api/provider-accounts/${encodeURIComponent(provider)}/activity-sync`,
    {
      authentication: 'required',
      method: 'POST',
      schema: ProviderActivitySyncResponseSchema,
    },
  )
}

export function startProviderVerification(provider: LinkableProvider) {
  return requestJson<ProviderAccountResponse>(
    `/api/provider-accounts/${encodeURIComponent(provider)}/verification`,
    {
      authentication: 'required',
      method: 'POST',
      schema: ProviderAccountResponseSchema,
    },
  )
}

export function checkProviderVerification(provider: LinkableProvider) {
  return requestJson<ProviderAccountResponse>(
    `/api/provider-accounts/${encodeURIComponent(provider)}/verification/check`,
    {
      authentication: 'required',
      method: 'POST',
      schema: ProviderAccountResponseSchema,
    },
  )
}

export function providerAccountErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return 'The provider profile could not be updated. Please try again.'
}
