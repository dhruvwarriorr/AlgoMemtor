import { z } from 'zod'

// The full problem list of one contest, in contest order, from the
// platforms' public contest APIs. Only identifiers, titles and links.

export type ContestProblemLink = {
  externalId: string
  problemKey: string
  title: string
  canonicalUrl: string
  position: string
}

export type ContestProblemsHint = {
  // Problem keys the learner submitted in this contest; they identify the
  // division on platforms that split one contest into several.
  submittedKeys: readonly string[]
  rating?: number
}

const codeChefCode = /^[A-Z0-9_]{1,40}$/i
const leetcodeSlug = /^[a-z0-9-]{1,120}$/

export const codeChefContestCode = (canonicalUrl: string) => {
  try {
    const url = new URL(canonicalUrl)
    if (!url.hostname.endsWith('codechef.com')) return undefined
    const code = url.pathname.split('/').filter(Boolean).at(-1)
    return code !== undefined && codeChefCode.test(code) ? code : undefined
  } catch {
    return undefined
  }
}

export const leetcodeContestSlug = (canonicalUrl: string) => {
  const slug = /\/contest\/([a-z0-9-]+)/i.exec(canonicalUrl)?.[1]?.toLowerCase()
  return slug !== undefined && leetcodeSlug.test(slug) ? slug : undefined
}

const CodeChefProblemSchema = z.object({
  code: z.string().regex(codeChefCode),
  name: z.string(),
  category_name: z.string().optional(),
  successful_submissions: z.union([z.string(), z.number()]).optional(),
})

export const CodeChefContestSchema = z.object({
  status: z.string().optional(),
  problems: z
    .union([z.record(z.string(), z.unknown()), z.array(z.unknown())])
    .optional(),
  child_contests: z
    .record(
      z.string(),
      z.object({
        contest_code: z.string().regex(codeChefCode),
        div: z
          .object({
            min_rating: z.number().optional(),
            max_rating: z.number().optional(),
          })
          .optional(),
      }),
    )
    .nullable()
    .optional(),
})
export type CodeChefContest = z.infer<typeof CodeChefContestSchema>

// Divisions of a parent contest, the one the learner took part in first.
export const codeChefDivisionOrder = (
  contest: CodeChefContest,
  hint: ContestProblemsHint,
): string[] => {
  const children = Object.values(contest.child_contests ?? {})
  if (children.length === 0) return []
  const rating = hint.rating
  return children
    .map((child) => ({
      code: child.contest_code,
      fits:
        rating !== undefined &&
        rating >= (child.div?.min_rating ?? 0) &&
        rating <= (child.div?.max_rating ?? Number.MAX_SAFE_INTEGER),
    }))
    .sort((left, right) => Number(right.fits) - Number(left.fits))
    .map((child) => child.code)
}

// Scored problems, easiest (most solved) first.
export const codeChefContestProblems = (
  contest: CodeChefContest,
): ContestProblemLink[] => {
  const raw = Array.isArray(contest.problems)
    ? contest.problems
    : Object.values(contest.problems ?? {})
  const problems = raw.flatMap((item) => {
    const parsed = CodeChefProblemSchema.safeParse(item)
    if (!parsed.success) return []
    if (parsed.data.category_name === 'unscored') return []
    return [parsed.data]
  })
  problems.sort(
    (left, right) =>
      Number(right.successful_submissions ?? 0) -
      Number(left.successful_submissions ?? 0),
  )
  return problems.slice(0, 26).map((problem, index) => ({
    externalId: problem.code,
    problemKey: problem.code,
    title: problem.name.trim().slice(0, 512) || problem.code,
    canonicalUrl: `https://www.codechef.com/problems/${problem.code}`,
    position: `P${index + 1}`,
  }))
}

export const leetcodeContestQuery = `query contestQuestionList($contestSlug: String!) {
  contestQuestionList(contestSlug: $contestSlug) { title titleSlug credit }
}`

export const LeetCodeContestSchema = z.object({
  data: z
    .object({
      contestQuestionList: z
        .array(
          z.object({
            title: z.string(),
            titleSlug: z.string().regex(leetcodeSlug),
            credit: z.number().optional(),
          }),
        )
        .nullable(),
    })
    .nullable(),
  errors: z.array(z.unknown()).optional(),
})

export const leetcodeContestProblems = (
  body: z.infer<typeof LeetCodeContestSchema>,
): ContestProblemLink[] =>
  (body.data?.contestQuestionList ?? []).slice(0, 8).map((item, index) => ({
    externalId: item.titleSlug,
    problemKey: item.titleSlug,
    title: item.title.trim().slice(0, 512) || item.titleSlug,
    canonicalUrl: `https://leetcode.com/problems/${item.titleSlug}/`,
    position: `Q${index + 1}`,
  }))
