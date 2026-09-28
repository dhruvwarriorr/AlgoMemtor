import {
  ExternalProblemCatalogResponseSchema,
  ProvidersResponseSchema,
  TopicsResponseSchema,
  type ExternalProblemCatalogQueryParams,
  type ExternalProblemCatalogResponse,
  type ProvidersResponse,
  type TopicsResponse,
} from '@algomemtor/shared-contracts'

import { requestJson } from './client'

const defaultPage = 1
const defaultPageSize = 10

type RequestOptions = {
  signal?: AbortSignal
}

type CatalogRequestOptions = RequestOptions & {
  mockScenario?: string
}

function setOptionalParam(
  params: URLSearchParams,
  key: string,
  value: string | number | undefined,
) {
  if (value === undefined || value === '') {
    return
  }

  params.set(key, String(value))
}

export function buildProblemCatalogSearchParams(
  query: ExternalProblemCatalogQueryParams,
  mockScenario?: string,
) {
  const params = new URLSearchParams()

  setOptionalParam(params, 'search', query.search?.trim())
  setOptionalParam(params, 'provider', query.provider)
  setOptionalParam(params, 'difficulty', query.difficulty)
  setOptionalParam(params, 'topic', query.topic?.trim())
  setOptionalParam(params, 'status', query.status)
  setOptionalParam(params, 'minRating', query.minRating)
  setOptionalParam(params, 'maxRating', query.maxRating)

  if (query.page !== defaultPage) {
    params.set('page', String(query.page))
  }

  if (query.pageSize !== defaultPageSize) {
    params.set('pageSize', String(query.pageSize))
  }

  if (process.env.NODE_ENV !== 'production' && mockScenario) {
    params.set('scenario', mockScenario)
  }

  return params
}

export function fetchProviders({ signal }: RequestOptions = {}) {
  return requestJson<ProvidersResponse>('/api/providers', {
    authentication: 'required',
    schema: ProvidersResponseSchema,
    signal,
  })
}

export function fetchTopics({ signal }: RequestOptions = {}) {
  return requestJson<TopicsResponse>('/api/topics', {
    authentication: 'required',
    schema: TopicsResponseSchema,
    signal,
  })
}

export function fetchProblemCatalog(
  query: ExternalProblemCatalogQueryParams,
  { signal, mockScenario }: CatalogRequestOptions = {},
) {
  const params = buildProblemCatalogSearchParams(query, mockScenario)
  const queryString = params.toString()
  const url = queryString ? `/api/problems?${queryString}` : '/api/problems'

  return requestJson<ExternalProblemCatalogResponse>(url, {
    authentication: 'required',
    schema: ExternalProblemCatalogResponseSchema,
    signal,
  })
}
