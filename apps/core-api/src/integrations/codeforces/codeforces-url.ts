const codeforcesProblemIndexPattern = /^[A-Z0-9]+$/

export const createCodeforcesProblemUrl = (
  contestId: number,
  rawIndex: string,
) => {
  const index = rawIndex.trim().toUpperCase()

  if (!Number.isSafeInteger(contestId) || contestId <= 0) {
    throw new Error('A positive integer contest ID is required.')
  }

  if (!codeforcesProblemIndexPattern.test(index)) {
    throw new Error('The Codeforces problem index is invalid.')
  }

  const url = new URL(
    `/problemset/problem/${contestId}/${index}`,
    'https://codeforces.com',
  )

  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'codeforces.com' ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error(
      'The Codeforces problem URL could not be constructed safely.',
    )
  }

  return url.toString()
}
