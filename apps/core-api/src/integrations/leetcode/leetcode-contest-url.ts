const titleSlugPattern = /^[a-z0-9][a-z0-9-]{0,159}$/

export const createLeetCodeContestUrl = (rawSlug: string) => {
  const slug = rawSlug.trim().toLowerCase()
  if (!titleSlugPattern.test(slug)) {
    throw new Error('The LeetCode contest slug is invalid.')
  }
  return new URL(`/contest/${slug}/`, 'https://leetcode.com').toString()
}
