import type { ContestProblemsHint } from '../integrations/providers/contest-problems'
import {
  ExternalProblemCatalogResponseSchema,
  ProviderFreshnessSchema,
  ProviderSummarySchema,
  TopicsResponseSchema,
  type ExternalProblemCatalogQueryParams,
  type LearnerProblemStatus,
  type ProviderKey,
  type ProviderWarning,
} from '@algomemtor/shared-contracts'

import { ProviderError } from '../errors/provider-error'
import type { ProblemProvider } from '../integrations/providers/problem-provider'

const topicName = (slug: string) =>
  slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

export class ProblemCatalogService {
  private readonly providers: readonly ProblemProvider[]

  constructor(provider: ProblemProvider | readonly ProblemProvider[]) {
    this.providers = Array.isArray(provider) ? provider : [provider]
    if (this.providers.length === 0) {
      throw new Error('At least one problem provider is required.')
    }
  }

  private selected(provider?: ProviderKey) {
    return provider === undefined
      ? this.providers
      : this.providers.filter((item) => item.key === provider)
  }

  private label(provider: ProviderKey) {
    if (provider === 'codeforces') return 'Codeforces'
    if (provider === 'codechef') return 'CodeChef'
    if (provider === 'leetcode') return 'LeetCode'
    return 'CSES'
  }

  private async searchAll(
    providers: readonly ProblemProvider[],
    query: Omit<ExternalProblemCatalogQueryParams, 'page' | 'pageSize'>,
    requestId?: string,
  ) {
    const settled = await Promise.allSettled(
      providers.map((provider) =>
        provider.search(query, requestId === undefined ? {} : { requestId }),
      ),
    )
    const results = settled.flatMap((item, index) => {
      const provider = providers[index]
      if (provider === undefined) return []
      if (item.status === 'fulfilled') return [item.value]
      const error =
        item.reason instanceof ProviderError ? item.reason : undefined
      return [
        {
          problems: [],
          freshness: ProviderFreshnessSchema.parse({
            provider: provider.key,
            availability: 'unavailable',
            stale: false,
            ...(error === undefined ? {} : { lastErrorCode: error.code }),
          }),
          warnings: [
            {
              provider: provider.key,
              code: error?.code ?? 'PROVIDER_UNAVAILABLE',
              message: `${this.label(provider.key)} is temporarily unavailable.`,
            },
          ] as ProviderWarning[],
        },
      ]
    })
    const successful = results.filter((item) => item.problems.length > 0)
    if (successful.length === 0) {
      const failure = settled.find((item) => item.status === 'rejected')
      if (failure?.status === 'rejected') throw failure.reason
    }
    return results
  }

  getProviders() {
    return {
      data: this.providers.map((provider) => {
        const freshness = provider.getHealth()
        return ProviderSummarySchema.parse({
          key: provider.key,
          label: this.label(provider.key),
          availability: freshness.availability,
          freshness,
        })
      }),
    }
  }

  async getTopics(requestId?: string) {
    const results = await this.searchAll(this.providers, {}, requestId)
    const slugs = [
      ...new Set(
        results.flatMap((result) =>
          result.problems.flatMap((problem) => problem.topics),
        ),
      ),
    ]
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right))

    return TopicsResponseSchema.parse({
      data: slugs.map((slug) => ({
        id: `topic_${slug.replace(/-/g, '_')}`,
        slug,
        name: topicName(slug),
      })),
    })
  }

  async getProblems(
    query: ExternalProblemCatalogQueryParams,
    requestId?: string,
    learnerStatuses?: ReadonlyMap<string, LearnerProblemStatus>,
  ) {
    const providers = this.selected(query.provider)
    if (providers.length === 0) {
      throw new Error('The requested provider is not configured.')
    }
    const providerQuery =
      learnerStatuses === undefined ? query : { ...query, status: undefined }
    const results = await this.searchAll(providers, providerQuery, requestId)
    const problems = results
      .flatMap((result) => result.problems)
      .filter((problem) =>
        query.status === undefined || learnerStatuses === undefined
          ? true
          : (learnerStatuses.get(`${problem.provider}:${problem.externalId}`) ??
              'unsolved') === query.status,
      )
      .sort(
        (left, right) =>
          left.provider.localeCompare(right.provider) ||
          left.externalId.localeCompare(right.externalId),
      )
    const total = problems.length
    const totalPages = Math.ceil(total / query.pageSize)
    const startIndex = (query.page - 1) * query.pageSize
    const data = problems.slice(startIndex, startIndex + query.pageSize)
    const warnings = results.flatMap((result) => result.warnings)
    const freshness = results.map((result) => result.freshness)

    return ExternalProblemCatalogResponseSchema.parse({
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages,
        partial: warnings.some((warning) => warning.code !== 'STALE_DATA'),
        stale: freshness.some((item) => item.stale),
        warnings,
        providers: freshness,
      },
    })
  }

  async getProblem(
    provider: ProviderKey,
    externalId: string,
    requestId?: string,
  ) {
    const providers = this.selected(provider)
    if (providers.length === 0) return null
    const results = await this.searchAll(providers, {}, requestId)
    return (
      results
        .flatMap((result) => result.problems)
        .find(
          (problem) =>
            problem.provider === provider && problem.externalId === externalId,
        ) ?? null
    )
  }

  async getProblemContent(
    provider: ProviderKey,
    externalId: string,
    requestId?: string,
  ) {
    const selected = this.selected(provider)[0]
    if (selected === undefined || selected.getContent === undefined) return null
    return selected.getContent(externalId, {
      ...(requestId === undefined ? {} : { requestId }),
    })
  }

  async getContestProblems(
    provider: ProviderKey,
    contestCode: string,
    hint: ContestProblemsHint,
  ) {
    const selected = this.selected(provider)[0]
    if (selected?.contestProblems === undefined) return []
    return selected.contestProblems(contestCode, hint)
  }

  async getCommunitySolutions(
    provider: ProviderKey,
    externalId: string,
    language: string,
  ) {
    const selected = this.selected(provider)[0]
    if (selected?.communitySolutions === undefined) return []
    return selected.communitySolutions(externalId, language)
  }
}
