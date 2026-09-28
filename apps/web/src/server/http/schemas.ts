import {
  LinkableProviderSchema,
  ProblemReferenceSchema,
} from '@algomemtor/shared-contracts'
import { z } from 'zod'

import { httpError } from './errors'

// CSES accounts link only through the browser connector; routes that make the
// server read a provider profile reject it as an unsupported provider.
export const ServerFetchedProviderSchema = LinkableProviderSchema.exclude([
  'cses',
])

export const recommendationItemIdSchema = z.uuid()

export const recommendationExternalIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^\S+$/)

// The `[provider]/[externalId]` path segments of a learner problem route.
export const problemReference = (params: {
  provider?: string
  externalId?: string
}) => {
  const result = ProblemReferenceSchema.safeParse({
    provider: params.provider,
    externalId: params.externalId,
  })
  if (result.success) return result.data
  throw httpError(
    400,
    'INVALID_PROBLEM_REFERENCE',
    'The provider problem reference is invalid.',
    { details: result.error.issues },
  )
}

// The optional `?provider=` filter of the activity and analytics routes.
export const providerFilter = (query: URLSearchParams) => {
  const values = query.getAll('provider')
  const result = LinkableProviderSchema.safeParse(
    values.length === 1 ? values[0] : undefined,
  )
  if (values.length > 0 && !result.success) {
    throw httpError(
      400,
      'INVALID_PROVIDER_FILTER',
      'The provider filter is invalid.',
    )
  }
  return result.success ? result.data : undefined
}
