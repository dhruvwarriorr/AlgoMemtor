import {
  ExternalContestsQuerySchema,
  ExternalContestsResponseSchema,
  ProblemDetailResponseSchema,
  ProviderActivityResponseSchema,
  ProviderSyncRequestResponseSchema,
  ProviderSyncStatusResponseSchema,
  UnifiedAnalyticsSchema,
  UnifiedProfileResponseSchema,
  type ExternalContestsQuery,
  type LinkableProvider,
  type ProviderSyncRequestResponse,
  type ProviderSyncStatusResponse,
} from '@algomemtor/shared-contracts'

import { requestJson } from '@/features/discovery/api/client'

const emptyResponseSchema = {
  safeParse(value: unknown) {
    return value === null
      ? { success: true as const, data: undefined }
      : { success: false as const, error: { issues: [] } }
  },
}

const providerParam = (provider: LinkableProvider | undefined) =>
  provider === undefined ? '' : `?provider=${encodeURIComponent(provider)}`

export function fetchUnifiedProfile({ signal }: { signal?: AbortSignal } = {}) {
  return requestJson('/api/unified-profile', {
    authentication: 'required',
    schema: UnifiedProfileResponseSchema,
    signal,
  })
}

export function fetchActivity(
  provider?: LinkableProvider,
  { signal }: { signal?: AbortSignal } = {},
) {
  return requestJson(`/api/activity${providerParam(provider)}`, {
    authentication: 'required',
    schema: ProviderActivityResponseSchema,
    signal,
  })
}

export function fetchAnalytics(
  provider?: LinkableProvider,
  { signal }: { signal?: AbortSignal } = {},
) {
  return requestJson(`/api/analytics${providerParam(provider)}`, {
    authentication: 'required',
    schema: UnifiedAnalyticsSchema,
    signal,
  })
}

export function fetchContests(
  query: Partial<ExternalContestsQuery> = {},
  { signal }: { signal?: AbortSignal } = {},
) {
  const parsed = ExternalContestsQuerySchema.parse({ ...query })
  const params = new URLSearchParams()
  if (parsed.provider !== undefined) params.set('provider', parsed.provider)
  if (parsed.status !== undefined) params.set('status', parsed.status)
  if (parsed.startsAfter !== undefined)
    params.set('startsAfter', parsed.startsAfter)
  if (parsed.endsBefore !== undefined)
    params.set('endsBefore', parsed.endsBefore)
  params.set('limit', String(parsed.limit))
  return requestJson(`/api/contests?${params.toString()}`, {
    authentication: 'required',
    schema: ExternalContestsResponseSchema,
    signal,
  })
}

export function fetchProblemDetail(
  provider: LinkableProvider,
  externalId: string,
  { signal }: { signal?: AbortSignal } = {},
) {
  return requestJson(
    `/api/problems/${encodeURIComponent(provider)}/${encodeURIComponent(externalId)}`,
    {
      authentication: 'required',
      schema: ProblemDetailResponseSchema,
      signal,
    },
  )
}

export function requestProviderSync(provider: LinkableProvider) {
  return requestJson<ProviderSyncRequestResponse>(
    `/api/provider-accounts/${encodeURIComponent(provider)}/sync`,
    {
      authentication: 'required',
      method: 'POST',
      schema: ProviderSyncRequestResponseSchema,
    },
  )
}

export function fetchProviderSyncStatus(
  provider: LinkableProvider,
  { signal }: { signal?: AbortSignal } = {},
) {
  return requestJson<ProviderSyncStatusResponse>(
    `/api/provider-accounts/${encodeURIComponent(provider)}/sync-status`,
    {
      authentication: 'required',
      schema: ProviderSyncStatusResponseSchema,
      signal,
    },
  )
}

export function deleteProviderHistory(provider: LinkableProvider) {
  return requestJson<undefined>(
    `/api/provider-accounts/${encodeURIComponent(provider)}/history`,
    {
      authentication: 'required',
      method: 'DELETE',
      schema: emptyResponseSchema,
    },
  )
}
