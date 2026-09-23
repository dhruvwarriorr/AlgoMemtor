import type { SyncOutcome } from './state.js'
import { ProviderRequestError, type ProviderRead } from './types.js'

// Codeforces and CodeChef publish their data, which AlgoMemtor's server
// syncs. The connector only reads which handle is signed in on this browser,
// which links and verifies the account and queues a server sync.

export type ClaimProvider = 'codeforces' | 'codechef'

const handlePattern = /^(?=.*[A-Za-z0-9])[A-Za-z0-9_.-]{1,64}$/

export const CLAIM_PAGES: Record<ClaimProvider, string> = {
  codeforces: 'https://codeforces.com/',
  codechef: 'https://www.codechef.com/',
}

// Signed in, the header box beside the language flags links to the user's
// profile and a logout URL; signed out, it offers Enter | Register.
export const parseCodeforcesHandle = (html: string) => {
  const start = html.indexOf('class="lang-chooser"')
  if (start < 0) return null
  const header = html.slice(start, start + 3000)
  if (!/\/logout/.test(header)) return null
  const handle = /href="\/profile\/([A-Za-z0-9_.-]{1,64})"/.exec(header)?.[1]
  return handle !== undefined && handlePattern.test(handle) ? handle : null
}

// Every CodeChef page sets `Drupal.settings.username` (null when signed out).
// The settings object can hold markup, so search the whole call rather than
// stopping at the first `<`.
export const parseCodeChefHandle = (html: string) => {
  const start = html.indexOf('jQuery.extend(Drupal.settings,')
  if (start < 0) return null
  const end = html.indexOf('</script>', start)
  const settings = html.slice(start, end < 0 ? start + 200_000 : end)
  const handle = /"username":"([A-Za-z0-9_.-]{1,64})"/.exec(settings)?.[1]
  return handle !== undefined && handlePattern.test(handle) ? handle : null
}

// Runs in the CodeChef tab (serialized by scripting.executeScript), so it
// must not reference anything outside itself. The page's own settings name
// the signed-in user; otherwise the site header links to their profile.
export function codeChefPageHandle(): string | null {
  const pattern = /^(?=.*[A-Za-z0-9])[A-Za-z0-9_.-]{1,64}$/
  const page = window as unknown as {
    Drupal?: { settings?: { username?: unknown } }
  }
  const fromSettings = page.Drupal?.settings?.username
  if (typeof fromSettings === 'string' && pattern.test(fromSettings)) {
    return fromSettings
  }
  const handles = new Set<string>()
  const links = document.querySelectorAll<HTMLAnchorElement>(
    'header a[href*="/users/"], nav a[href*="/users/"], [class*="header" i] a[href*="/users/"]',
  )
  for (const link of links) {
    const match = /^\/users\/([A-Za-z0-9_.-]{1,64})\/?$/.exec(
      new URL(link.href, location.origin).pathname,
    )
    if (match?.[1] !== undefined && pattern.test(match[1]))
      handles.add(match[1])
  }
  return handles.size === 1 ? ([...handles][0] ?? null) : null
}

export type ClaimResult = {
  handle: string
  verified: boolean
  syncQueued: boolean
}

export const syncClaim = async (
  provider: ClaimProvider,
  read: ProviderRead,
  claim: (provider: ClaimProvider, handle: string) => Promise<ClaimResult>,
  now: () => Date,
  // Reads the signed-in handle from the provider's loaded page when its
  // HTML does not name one (page reads only).
  probe?: () => Promise<string | null>,
): Promise<SyncOutcome> => {
  const base = {
    at: now().toISOString(),
    uploadedSubmissions: 0,
    historyComplete: true,
    continueSoon: false,
  }
  const name = provider === 'codeforces' ? 'Codeforces' : 'CodeChef'
  const response = await read(CLAIM_PAGES[provider])
  if (response.status === 429) {
    throw new ProviderRequestError(
      'rate_limited',
      `${name} is rate limiting requests.`,
    )
  }
  if (!response.ok) {
    throw new ProviderRequestError(
      'unavailable',
      `${name} returned HTTP ${response.status}.`,
    )
  }
  const html = await response.text()
  const parsed =
    provider === 'codeforces'
      ? parseCodeforcesHandle(html)
      : parseCodeChefHandle(html)
  const probed =
    parsed === null && probe !== undefined
      ? await probe().catch(() => null)
      : null
  const handle =
    parsed ?? (probed !== null && handlePattern.test(probed) ? probed : null)
  if (handle === null) {
    return {
      ...base,
      status: 'signed_out',
      message: `Sign in to ${name} in this browser to verify it.`,
    }
  }
  const result = await claim(provider, handle)
  return {
    ...base,
    status: 'synced',
    handle: result.handle,
    message: result.syncQueued
      ? 'Verified; AlgoMemtor is syncing it now.'
      : 'Verified; a sync was requested recently.',
  }
}
