const titleSlugPattern = /^[a-z0-9][a-z0-9-]{0,159}$/

export const createLeetCodeProblemUrl = (rawTitleSlug: string) => {
  const titleSlug = rawTitleSlug.trim().toLowerCase()
  if (!titleSlugPattern.test(titleSlug)) {
    throw new Error('The LeetCode title slug is invalid.')
  }
  const url = new URL(`/problems/${titleSlug}/`, 'https://leetcode.com')
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'leetcode.com' ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('The LeetCode problem URL could not be constructed safely.')
  }
  return url.toString()
}
