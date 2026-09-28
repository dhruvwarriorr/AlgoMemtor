import {
  ExternalContestsResponseSchema,
  ProviderFreshnessSchema,
  type ExternalContestsQuery,
  type ProviderKey,
  type ProviderWarning,
} from '@algomemtor/shared-contracts'

import { ProviderError } from '../errors/provider-error'
import type { ContestProvider } from '../integrations/providers/contest-provider'

export class ContestCatalogService {
  private readonly providers: readonly ContestProvider[]

  constructor(provider: ContestProvider | readonly ContestProvider[]) {
    this.providers = Array.isArray(provider) ? provider : [provider]
    if (this.providers.length === 0) {
      throw new Error('At least one contest provider is required.')
    }
  }

  private selected(provider?: ProviderKey) {
    return provider === undefined
      ? this.providers
      : this.providers.filter((item) => item.key === provider)
  }

  async getContests(query: ExternalContestsQuery, requestId?: string) {
    const providers = this.selected(query.provider)
    if (providers.length === 0)
      throw new Error('The requested provider is not configured.')
    const settled = await Promise.allSettled(
      providers.map((provider) =>
        provider.list(
          {
            ...(query.status === undefined ? {} : { status: query.status }),
            ...(query.startsAfter === undefined
              ? {}
              : { startsAfter: new Date(query.startsAfter) }),
            ...(query.endsBefore === undefined
              ? {}
              : { endsBefore: new Date(query.endsBefore) }),
            limit: query.limit,
          },
          requestId === undefined ? {} : { requestId },
        ),
      ),
    )
    const warnings: ProviderWarning[] = []
    const freshness = []
    const contests = []
    let failed = 0
    for (const [index, result] of settled.entries()) {
      const provider = providers[index]
      if (provider === undefined) continue
      if (result.status === 'fulfilled') {
        contests.push(...result.value.contests)
        warnings.push(...result.value.warnings)
        freshness.push(result.value.freshness)
        continue
      }
      failed += 1
      const error =
        result.reason instanceof ProviderError ? result.reason : undefined
      freshness.push(
        ProviderFreshnessSchema.parse({
          provider: provider.key,
          availability: 'unavailable',
          stale: false,
          ...(error === undefined ? {} : { lastErrorCode: error.code }),
        }),
      )
      warnings.push({
        provider: provider.key,
        code: error?.code ?? 'PROVIDER_UNAVAILABLE',
        message: `${provider.key} contest data is temporarily unavailable.`,
      })
    }
    if (contests.length === 0 && failed === providers.length) {
      const firstFailure = settled.find(
        (result) => result.status === 'rejected',
      )
      if (firstFailure?.status === 'rejected') throw firstFailure.reason
    }
    contests.sort((left, right) => {
      const leftTime =
        left.startsAt === undefined
          ? Number.MAX_SAFE_INTEGER
          : Date.parse(left.startsAt)
      const rightTime =
        right.startsAt === undefined
          ? Number.MAX_SAFE_INTEGER
          : Date.parse(right.startsAt)
      return (
        leftTime - rightTime ||
        left.provider.localeCompare(right.provider) ||
        left.externalId.localeCompare(right.externalId)
      )
    })
    return ExternalContestsResponseSchema.parse({
      data: contests.slice(0, query.limit),
      meta: {
        partial: warnings.some((warning) => warning.code !== 'STALE_DATA'),
        stale: freshness.some((item) => item.stale),
        providers: freshness,
      },
    })
  }

  getProviders() {
    return this.providers.map((provider) => provider.getHealth())
  }
}
