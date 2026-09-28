// Talks to the AlgoMemtor Connector extension through its content script on
// this site. Messages stay within this window and origin.

const SOURCE_WEB = 'algomemtor-web'
const SOURCE_EXTENSION = 'algomemtor-extension'

export type ExtensionReady = { paired: boolean; nextManualSyncAt?: string }

type ExtensionMessage = {
  source?: unknown
  type?: unknown
  paired?: unknown
  nextManualSyncAt?: unknown
  result?: unknown
  ok?: unknown
  error?: unknown
}

const listen = <T>(
  accept: (data: ExtensionMessage) => T | undefined,
  timeoutMs: number,
): Promise<T | null> =>
  new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', handler)
      resolve(null)
    }, timeoutMs)
    function handler(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin)
        return
      const data = event.data as ExtensionMessage | null
      if (data?.source !== SOURCE_EXTENSION) return
      const value = accept(data)
      if (value === undefined) return
      window.clearTimeout(timer)
      window.removeEventListener('message', handler)
      resolve(value)
    }
    window.addEventListener('message', handler)
  })

// Resolves null when no extension answers (not installed or disabled).
export function detectExtension(timeoutMs = 2500) {
  const ready = listen<ExtensionReady>(
    (data) =>
      data.type === 'connector-ready'
        ? {
            paired: data.paired === true,
            ...(typeof data.nextManualSyncAt === 'string'
              ? { nextManualSyncAt: data.nextManualSyncAt }
              : {}),
          }
        : undefined,
    timeoutMs,
  )
  window.postMessage(
    { source: SOURCE_WEB, type: 'connector-hello' },
    window.location.origin,
  )
  return ready
}

export async function sendTokenToExtension(input: {
  secret: string
  apiUrl: string
  label: string
}) {
  const result = listen<{ ok: boolean; error?: string }>(
    (data) =>
      data.type === 'connector-paired'
        ? {
            ok: data.ok === true,
            ...(typeof data.error === 'string' ? { error: data.error } : {}),
          }
        : undefined,
    20_000,
  )
  window.postMessage(
    { source: SOURCE_WEB, type: 'connector-pair', ...input },
    window.location.origin,
  )
  return (
    (await result) ?? { ok: false, error: 'The extension did not respond.' }
  )
}

// Where the extension sends uploads: this site, which serves the API.
export function connectorApiAddress() {
  return window.location.origin
}

export type BrowserFamily = 'firefox' | 'chrome'

export function browserFamily(): BrowserFamily {
  return /firefox\//i.test(navigator.userAgent) ? 'firefox' : 'chrome'
}

export function browserLabel() {
  const agent = navigator.userAgent
  if (/zen\//i.test(agent)) return 'Zen'
  if (/firefox\//i.test(agent)) return 'Firefox'
  if (/edg\//i.test(agent)) return 'Edge'
  if (/brave/i.test(agent)) return 'Brave'
  return 'Chrome'
}

export type ExtensionSyncResult =
  | {
      ok: true
      nextAllowedAt: string
      results: Array<{ provider: string; status: string; message: string }>
    }
  | {
      ok: false
      reason: 'cooldown' | 'unpaired' | 'error' | 'timeout'
      nextAllowedAt?: string
      message?: string
    }

// Asks the extension to sync every platform now (its own 15-minute limit
// applies) and resolves when the sync finishes.
export async function requestExtensionSync(): Promise<ExtensionSyncResult> {
  const result = listen<unknown>(
    (data) => (data.type === 'connector-sync-result' ? data.result : undefined),
    10 * 60 * 1000,
  )
  window.postMessage(
    { source: SOURCE_WEB, type: 'connector-sync' },
    window.location.origin,
  )
  const value = (await result) as ExtensionSyncResult | null
  if (value === null) return { ok: false, reason: 'timeout' }
  return typeof value === 'object' && 'ok' in value
    ? value
    : { ok: false, reason: 'error' }
}
