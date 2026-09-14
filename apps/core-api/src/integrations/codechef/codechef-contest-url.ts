const contestCodePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

export const createCodeChefContestUrl = (rawCode: string) => {
  const code = rawCode.trim()
  if (!contestCodePattern.test(code)) {
    throw new Error('The CodeChef contest code is invalid.')
  }
  return new URL(`/${code}`, 'https://www.codechef.com').toString()
}
