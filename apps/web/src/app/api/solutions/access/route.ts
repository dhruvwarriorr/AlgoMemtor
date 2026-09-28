import { SolutionAccessResponseSchema } from '@algomemtor/shared-contracts'
import { z } from 'zod'

import { invalidMentorInput, mentor } from '@/server/http/mentor'
import { json, queryRecord, route } from '@/server/http/route'

const httpsUrlQuery = z.string().trim().url().max(2_048)
const languageQuery = z.string().trim().min(1).max(64)

export const GET = route({ auth: 'user' }, async ({ app, subject, query }) => {
  const record = queryRecord(query)
  const url = httpsUrlQuery.safeParse(record.problemUrl)
  const language = languageQuery.safeParse(record.language ?? 'C++')
  if (!url.success || !language.success) {
    throw invalidMentorInput('Provide a problem link.')
  }
  return json(
    SolutionAccessResponseSchema.parse({
      data: await mentor(() =>
        app.mentorService.solutionAccess(subject, url.data, language.data),
      ),
    }),
  )
})
