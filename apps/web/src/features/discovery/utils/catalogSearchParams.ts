import {
  LearnerProblemStatusSchema,
  NormalizedDifficultySchema,
  ProviderKeySchema,
  type ExternalProblemCatalogQueryParams,
} from '@algomemtor/shared-contracts'

export const defaultCatalogPage = 1
export const defaultCatalogPageSize = 10

function optionalTrimmedValue(value: string | null) {
  const trimmedValue = value?.trim()
  return trimmedValue ? trimmedValue : undefined
}

function nonNegativeNumber(value: string | null) {
  const normalizedValue = optionalTrimmedValue(value)

  if (normalizedValue === undefined) {
    return undefined
  }

  const parsedValue = Number(normalizedValue)
  return Number.isFinite(parsedValue) && parsedValue >= 0
    ? parsedValue
    : undefined
}

function positiveInteger(value: string | null, fallback: number, max?: number) {
  const normalizedValue = optionalTrimmedValue(value)

  if (normalizedValue === undefined) {
    return fallback
  }

  const parsedValue = Number(normalizedValue)

  if (
    !Number.isInteger(parsedValue) ||
    parsedValue <= 0 ||
    (max !== undefined && parsedValue > max)
  ) {
    return fallback
  }

  return parsedValue
}

export function parseCatalogSearchParams(
  searchParams: URLSearchParams,
): ExternalProblemCatalogQueryParams {
  const providerResult = ProviderKeySchema.safeParse(
    optionalTrimmedValue(searchParams.get('provider')),
  )
  const difficultyResult = NormalizedDifficultySchema.safeParse(
    optionalTrimmedValue(searchParams.get('difficulty')),
  )
  const statusResult = LearnerProblemStatusSchema.safeParse(
    optionalTrimmedValue(searchParams.get('status')),
  )
  let minRating = nonNegativeNumber(searchParams.get('minRating'))
  let maxRating = nonNegativeNumber(searchParams.get('maxRating'))

  if (
    minRating !== undefined &&
    maxRating !== undefined &&
    minRating > maxRating
  ) {
    minRating = undefined
    maxRating = undefined
  }

  return {
    search: optionalTrimmedValue(searchParams.get('search')),
    provider: providerResult.success ? providerResult.data : undefined,
    difficulty: difficultyResult.success ? difficultyResult.data : undefined,
    topic: optionalTrimmedValue(searchParams.get('topic')),
    status: statusResult.success ? statusResult.data : undefined,
    minRating,
    maxRating,
    page: positiveInteger(searchParams.get('page'), defaultCatalogPage),
    pageSize: positiveInteger(
      searchParams.get('pageSize'),
      defaultCatalogPageSize,
      100,
    ),
  }
}

function setOptionalParam(
  searchParams: URLSearchParams,
  key: string,
  value: string | number | undefined,
) {
  if (value !== undefined && value !== '') {
    searchParams.set(key, String(value))
  }
}

export function buildCatalogSearchParams(
  filters: ExternalProblemCatalogQueryParams,
) {
  const searchParams = new URLSearchParams()

  setOptionalParam(searchParams, 'search', filters.search?.trim())
  setOptionalParam(searchParams, 'provider', filters.provider)
  setOptionalParam(searchParams, 'difficulty', filters.difficulty)
  setOptionalParam(searchParams, 'topic', filters.topic?.trim())
  setOptionalParam(searchParams, 'status', filters.status)
  setOptionalParam(searchParams, 'minRating', filters.minRating)
  setOptionalParam(searchParams, 'maxRating', filters.maxRating)

  if (filters.page !== defaultCatalogPage) {
    searchParams.set('page', String(filters.page))
  }

  if (filters.pageSize !== defaultCatalogPageSize) {
    searchParams.set('pageSize', String(filters.pageSize))
  }

  return searchParams
}

export function hasActiveCatalogFilters(
  filters: ExternalProblemCatalogQueryParams,
) {
  return Boolean(
    filters.search ||
    filters.provider ||
    filters.difficulty ||
    filters.topic ||
    filters.status ||
    filters.minRating !== undefined ||
    filters.maxRating !== undefined,
  )
}
