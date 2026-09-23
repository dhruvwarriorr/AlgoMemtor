import type { ProviderRead } from './types.js'

// Provider requests run inside a tab on the provider's own site. From there
// they are ordinary same-site requests, so the browser attaches the learner's
// session cookie in Chrome and Firefox alike (a background request is
// cross-site, and browsers withhold SameSite session cookies from it).

type PageResponse = { status: number; body: string }

// Runs in the provider page (serialized by scripting.executeScript), so it
// must not reference anything outside itself.
async function pageFetch(
  url: string,
  method: 'GET' | 'POST',
  body: string | null,
): Promise<PageResponse> {
  const csrf = /(?:^|;\s*)csrftoken=([^;]+)/.exec(document.cookie)?.[1]
  const response = await fetch(url, {
    method,
    credentials: 'include',
    headers: {
      accept: 'application/json, text/html;q=0.9',
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      ...(csrf === undefined
        ? {}
        : { 'x-csrftoken': decodeURIComponent(csrf) }),
    },
    ...(body === null ? {} : { body }),
  })
  return { status: response.status, body: await response.text() }
}

const TAB_LOAD_TIMEOUT_MS = 30_000

// A new tab first reports a loaded `about:blank` (notably in Firefox) before it
// navigates, so wait until it has loaded a page on the provider's origin.
const waitForTab = async (tabId: number, origin: string) => {
  const deadline = Date.now() + TAB_LOAD_TIMEOUT_MS
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId)
    if (tab.status === 'complete' && tab.url?.startsWith(`${origin}/`) === true)
      return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('The provider page did not load.')
}

// An ordinary HTML page per provider to run requests from (browsers do not
// run extension scripts in plain-text documents). LeetCode's and CSES's
// problemset pages change views without reloading, so a request is not cut
// off by the page navigating away.
const anchorPath = (origin: string) =>
  origin === 'https://leetcode.com' || origin === 'https://cses.fi'
    ? '/problemset/'
    : '/'

// One reader per sync run. It opens its own background tab per provider
// (never touching the learner's tabs), retries once on a fresh tab if the
// page goes away mid-request, and closes its tabs when the run ends.
export const createPageReader = () => {
  const tabs = new Map<string, Promise<number>>()
  const opened = new Set<number>()

  const openTab = async (origin: string, path: string) => {
    const created = await chrome.tabs.create({
      url: `${origin}${path}`,
      active: false,
    })
    if (created.id === undefined)
      throw new Error('The provider tab could not be opened.')
    opened.add(created.id)
    await waitForTab(created.id, origin)
    return created.id
  }

  const tabFor = (origin: string, fresh: boolean) => {
    let tab = fresh ? undefined : tabs.get(origin)
    if (tab === undefined) {
      tab = openTab(origin, anchorPath(origin))
      tabs.set(origin, tab)
    }
    return tab
  }

  const run = async (
    origin: string,
    fresh: boolean,
    args: [string, 'GET' | 'POST', string | null],
  ) => {
    const tabId = await tabFor(origin, fresh)
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: pageFetch,
      args,
    })
    const value = result?.result as PageResponse | undefined
    if (value === undefined)
      throw new Error('The provider page did not answer.')
    return value
  }

  const request = async (
    url: string,
    method: 'GET' | 'POST' = 'GET',
    body: string | null = null,
  ) => {
    const origin = new URL(url).origin
    let value: PageResponse
    try {
      value = await run(origin, false, [url, method, body])
    } catch {
      // The tab was closed, discarded, or navigated: retry on a new tab.
      const stale = await tabs.get(origin)?.catch(() => undefined)
      if (stale !== undefined) {
        opened.delete(stale)
        await chrome.tabs.remove(stale).catch(() => undefined)
      }
      value = await run(origin, true, [url, method, body])
    }
    // A Response cannot carry a body with 1xx/204/205/304 or a status of 0.
    const status =
      value.status >= 200 && value.status <= 599 ? value.status : 502
    return [204, 205, 304].includes(status)
      ? new Response(null, { status })
      : new Response(value.body, { status })
  }

  const read: ProviderRead = (url) => request(url)

  // Runs a self-contained function in the provider's page and returns its
  // result (for values the page's own scripts set, such as the signed-in
  // user).
  const evaluate = async <T>(
    origin: string,
    func: () => T,
  ): Promise<Awaited<T> | undefined> => {
    const tabId = await tabFor(origin, false)
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func,
      args: [],
    })
    return result?.result as Awaited<T> | undefined
  }

  return {
    read,
    evaluate,
    post: (url: string, body: unknown) =>
      request(url, 'POST', JSON.stringify(body)),
    close: async () => {
      await Promise.all(
        [...opened].map((id) => chrome.tabs.remove(id).catch(() => undefined)),
      )
      opened.clear()
      tabs.clear()
    },
  }
}
