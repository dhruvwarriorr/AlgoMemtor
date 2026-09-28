import {
  ProviderKeySchema,
  type ProviderKey,
} from '@algomemtor/shared-contracts'
import { z } from 'zod'

import {
  httpError,
  mapErrors,
  rethrowProviderError,
} from '@/server/http/errors'
import { json, route } from '@/server/http/route'
import {
  leetcodeIdForSlug,
  linkedProblemFromContent,
  providerProblemFromUrl,
} from '@/server/services/coach-links'

// The coach agent opens a platform problem the learner mentioned (by link or
// ID) through the same provider adapters as the problem detail page.
export const POST = route(
  { auth: 'internal' },
  async ({ app, body, requestId }) => {
    const input = z
      .union([
        z.object({ url: z.string().trim().min(8).max(2_048) }).strict(),
        z
          .object({
            provider: ProviderKeySchema,
            externalId: z.string().trim().min(1).max(128),
          })
          .strict(),
      ])
      .safeParse(body ?? {})
    if (!input.success) {
      throw httpError(
        400,
        'INVALID_COACH_PROBLEM_REFERENCE',
        'Send a platform problem link or a provider and problem ID.',
      )
    }
    let provider: ProviderKey | undefined
    let externalId: string | undefined
    if ('url' in input.data) {
      const reference = providerProblemFromUrl(input.data.url)
      provider = reference?.provider
      externalId = reference?.externalId
      if (reference?.leetcodeSlug !== undefined) {
        externalId = leetcodeIdForSlug(
          reference.leetcodeSlug,
          (
            await Promise.all(
              app.providers
                .filter((item) => item.key === 'leetcode')
                .map((item) =>
                  item.search({}).then(
                    (result) => result.problems,
                    () => [],
                  ),
                ),
            )
          ).flat(),
        )
      }
    } else {
      provider = input.data.provider
      externalId = input.data.externalId
    }
    if (provider === undefined || externalId === undefined) {
      throw httpError(
        404,
        'COACH_PROBLEM_NOT_FOUND',
        'That link is not a known platform problem.',
      )
    }
    const result = await mapErrors(
      () =>
        app.catalogService.getProblemContent(provider, externalId, requestId),
      rethrowProviderError,
    )
    if (result?.content === null || result?.content === undefined) {
      throw httpError(
        404,
        'COACH_PROBLEM_NOT_FOUND',
        'That problem statement is not available.',
      )
    }
    return json({ data: linkedProblemFromContent(result.content) })
  },
)
