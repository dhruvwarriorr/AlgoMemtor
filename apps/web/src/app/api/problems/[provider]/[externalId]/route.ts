import {
  ProblemDetailResponseSchema,
  ProviderKeySchema,
} from '@algomemtor/shared-contracts'

import {
  httpError,
  mapErrors,
  rethrowProviderError,
} from '@/server/http/errors'
import { json, route } from '@/server/http/route'

export const GET = route<{ provider: string; externalId: string }>(
  { auth: 'user' },
  async ({ app, params, requestId }) => {
    const providerResult = ProviderKeySchema.safeParse(params.provider)
    const externalId = params.externalId
    if (!providerResult.success) {
      throw httpError(
        400,
        'INVALID_PROBLEM_REFERENCE',
        'The provider problem reference is invalid.',
      )
    }
    return mapErrors(async () => {
      const summary = await app.catalogService.getProblem(
        providerResult.data,
        externalId,
        requestId,
      )
      if (summary === null) {
        throw httpError(
          404,
          'PROBLEM_NOT_FOUND',
          'That problem is not available in the provider catalog.',
        )
      }
      const contentResult = await app.catalogService.getProblemContent(
        providerResult.data,
        externalId,
        requestId,
      )
      return json(
        ProblemDetailResponseSchema.parse({
          data: {
            summary,
            content: contentResult?.content ?? null,
          },
          ...(contentResult === null || contentResult === undefined
            ? {}
            : {
                meta: {
                  warnings: contentResult.warnings,
                  freshness: contentResult.freshness,
                },
              }),
        }),
      )
    }, rethrowProviderError)
  },
)
