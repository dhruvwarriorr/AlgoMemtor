const codeChefProblemCodePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

export const createCodeChefProblemUrl = (rawCode: string) => {
  const code = rawCode.trim()
  if (!codeChefProblemCodePattern.test(code)) {
    throw new Error('The CodeChef problem code is invalid.')
  }
  const url = new URL(`/problems/${code}`, 'https://www.codechef.com')
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'www.codechef.com' ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('The CodeChef problem URL could not be constructed safely.')
  }
  return url.toString()
}
