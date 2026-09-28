import { z } from 'zod'

// Accepted or top-voted solutions in the learner's language, read from the
// platforms' own public APIs (Codeforces contest.status, LeetCode's solution
// list). Only links, titles and aggregate facts are used; code stays on the
// platform.

export type CommunitySolutionLink = {
  title: string
  url: string
  publisher: string
  language: string
  note?: string
}

export type LanguageFamily = 'cpp' | 'java' | 'python' | 'other'

export const languageFamily = (value: string): LanguageFamily => {
  const text = value.toLowerCase()
  if (/c\+\+|g\+\+|clang|\bcpp\b|gnu c\b/.test(text)) return 'cpp'
  if (/\bjava\b(?!script)/.test(text)) return 'java'
  if (/python|pypy/.test(text)) return 'python'
  return 'other'
}

const CodeforcesSubmissionSchema = z.object({
  id: z.number().int().positive(),
  contestId: z.number().int().positive().optional(),
  problem: z.object({ index: z.string() }),
  programmingLanguage: z.string(),
  verdict: z.string().optional(),
  timeConsumedMillis: z.number().nonnegative(),
  memoryConsumedBytes: z.number().nonnegative(),
  author: z.object({
    members: z.array(z.object({ handle: z.string() })),
  }),
})

export const CodeforcesStatusEnvelopeSchema = z.object({
  status: z.literal('OK'),
  result: z.array(z.unknown()),
})

// The fastest accepted submissions for one problem in the chosen language,
// one per author.
export const codeforcesCommunitySolutions = (
  result: readonly unknown[],
  contestId: number,
  index: string,
  language: string,
  limit = 3,
): CommunitySolutionLink[] => {
  const family = languageFamily(language)
  const accepted = result.flatMap((item) => {
    const parsed = CodeforcesSubmissionSchema.safeParse(item)
    if (!parsed.success) return []
    const submission = parsed.data
    return submission.verdict === 'OK' &&
      submission.problem.index.toUpperCase() === index.toUpperCase() &&
      (family === 'other' ||
        languageFamily(submission.programmingLanguage) === family)
      ? [submission]
      : []
  })
  accepted.sort(
    (left, right) =>
      left.timeConsumedMillis - right.timeConsumedMillis ||
      left.memoryConsumedBytes - right.memoryConsumedBytes,
  )
  const authors = new Set<string>()
  const links: CommunitySolutionLink[] = []
  for (const submission of accepted) {
    const author = submission.author.members[0]?.handle ?? ''
    if (authors.has(author)) continue
    authors.add(author)
    links.push({
      // Attributed to the public Codeforces author of the submission.
      title:
        `${author === '' ? 'Accepted' : `${author}'s accepted`} ${submission.programmingLanguage} solution · ${submission.timeConsumedMillis} ms`.slice(
          0,
          200,
        ),
      url: `https://codeforces.com/contest/${contestId}/submission/${submission.id}`,
      publisher: 'Codeforces',
      language: submission.programmingLanguage.slice(0, 64),
      note: `Among the fastest accepted ${submission.programmingLanguage} submissions for this problem (${submission.timeConsumedMillis} ms). Opens on Codeforces.`,
    })
    if (links.length === limit) break
  }
  return links
}

export const leetcodeLanguageTag = (language: string) => {
  const family = languageFamily(language)
  return family === 'cpp'
    ? 'cpp'
    : family === 'java'
      ? 'java'
      : family === 'python'
        ? 'python3'
        : undefined
}

export const leetcodeSolutionsQuery = `query ugcArticleSolutionArticles($questionSlug: String!, $orderBy: ArticleOrderByEnum, $tagSlugs: [String!], $skip: Int, $first: Int) {
  ugcArticleSolutionArticles(questionSlug: $questionSlug, orderBy: $orderBy, tagSlugs: $tagSlugs, skip: $skip, first: $first) {
    edges { node { title slug topicId reactions { count reactionType } } }
  }
}`

export const LeetCodeSolutionsEnvelopeSchema = z.object({
  data: z
    .object({
      ugcArticleSolutionArticles: z
        .object({
          edges: z.array(
            z.object({
              node: z.object({
                title: z.string(),
                slug: z.string().regex(/^[a-z0-9-]{1,200}$/),
                topicId: z.number().int().positive(),
                reactions: z
                  .array(
                    z.object({ count: z.number(), reactionType: z.string() }),
                  )
                  .optional(),
              }),
            }),
          ),
        })
        .nullable(),
    })
    .nullable(),
  errors: z.array(z.unknown()).optional(),
})

export const leetcodeCommunitySolutions = (
  envelope: z.infer<typeof LeetCodeSolutionsEnvelopeSchema>,
  questionSlug: string,
  language: string,
  limit = 3,
): CommunitySolutionLink[] =>
  (envelope.data?.ugcArticleSolutionArticles?.edges ?? [])
    .slice(0, limit)
    .map(({ node }) => {
      const upvotes = node.reactions?.find(
        (reaction) => reaction.reactionType === 'UPVOTE',
      )?.count
      return {
        title: node.title.trim().slice(0, 200) || 'Community solution',
        url: `https://leetcode.com/problems/${questionSlug}/solutions/${node.topicId}/${node.slug}/`,
        publisher: 'LeetCode',
        language,
        ...(upvotes === undefined
          ? {}
          : { note: `${upvotes.toLocaleString('en-US')} upvotes.` }),
      }
    })
