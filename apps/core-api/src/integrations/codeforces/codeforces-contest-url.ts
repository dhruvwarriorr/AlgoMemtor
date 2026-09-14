const contestIdPattern = /^[1-9][0-9]{0,9}$/

export const createCodeforcesContestUrl = (rawId: number | string) => {
  const id = String(rawId).trim()
  if (!contestIdPattern.test(id)) {
    throw new Error('The Codeforces contest ID is invalid.')
  }
  return new URL(`/contests/${id}`, 'https://codeforces.com').toString()
}
