import {
  ExternalProblemCatalogResponseSchema,
  ProviderSummarySchema,
  TopicsResponseSchema,
  type ExternalProblemCatalogQueryParams,
} from '@algomemtor/shared-contracts'

import type { ProblemProvider } from '../integrations/providers/problem-provider.js'

const topicName = (slug: string) =>
  slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

export class ProblemCatalogService {
  constructor(private readonly provider: ProblemProvider) {}

  getProviders() {
    const freshness = this.provider.getHealth()

    return {
      data: [
        ProviderSummarySchema.parse({
          key: this.provider.key,
          label: 'Codeforces',
          availability: freshness.availability,
          freshness,
        }),
      ],
    }
  }

  async getTopics(requestId?: string) {
    const result = await this.provider.search(
      {},
      requestId === undefined ? {} : { requestId },
    )
    const slugs = [
      ...new Set(result.problems.flatMap((problem) => problem.topics)),
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
  ) {
    const result = await this.provider.search(
      query,
      requestId === undefined ? {} : { requestId },
    )
    const total = result.problems.length
    const totalPages = Math.ceil(total / query.pageSize)
    const startIndex = (query.page - 1) * query.pageSize
    const data = result.problems.slice(startIndex, startIndex + query.pageSize)

    return ExternalProblemCatalogResponseSchema.parse({
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages,
        partial: result.warnings.some(
          (warning) => warning.code !== 'STALE_DATA',
        ),
        stale: result.freshness.stale,
        warnings: result.warnings,
        providers: [result.freshness],
      },
    })
  }
}
