import { createApiClient, normalizeApiUrl } from './api.js'
import { MANUAL_SYNC_COOLDOWN_MINUTES, WEB_URL } from './config.js'
import { createPageReader } from './provider-page.js'
import {
  emptyState,
  parseSettings,
  parseState,
  type ConnectorSettings,
  type ConnectorState,
  type SyncOutcome,
} from './state.js'
import { codeChefPageHandle, syncClaim } from './claims.js'
import { syncCodeChef } from './codechef.js'
import { fetchLeetCodeStatuses } from './leetcode.js'
import { failure, syncCses, syncLeetCode, type SyncDeps } from './sync.js'
import { SYNC_PROVIDERS, type SyncProvider } from './types.js'

// Background script (Chrome service worker, Firefox event page): syncs on a
// schedule, right after pairing, and whenever the extension starts; continues
// unfinished history a few minutes later; and notifies when a sync finishes.

const SYNC_ALARM = 'algomemtor-sync'
const CONTINUE_ALARM = 'algomemtor-continue'
// A start-up sync is skipped when the last run was this recent.
const STARTUP_SYNC_AFTER_MS = 10 * 60 * 1000
// Settings → Linked platforms, where the site connects the extension.
const CONNECT_PATH = '/settings#platforms'
const MANUAL_SYNC_COOLDOWN_MS = MANUAL_SYNC_COOLDOWN_MINUTES * 60 * 1000

const labels: Record<SyncProvider, string> = {
  leetcode: 'LeetCode',
  cses: 'CSES',
  codeforces: 'Codeforces',
  codechef: 'CodeChef',
}

const loadSettings = async () =>
  parseSettings((await chrome.storage.local.get('settings')).settings)
const saveSettings = (settings: ConnectorSettings) =>
  chrome.storage.local.set({ settings })
const loadState = async () =>
  parseState((await chrome.storage.local.get('state')).state)

const schedule = async (settings: ConnectorSettings) => {
  await chrome.alarms.clear(SYNC_ALARM)
  await chrome.alarms.create(SYNC_ALARM, {
    delayInMinutes: settings.intervalMinutes,
    periodInMinutes: settings.intervalMinutes,
  })
}

// Direct request with the browser's cookies. Works where the provider's
// session cookie is not restricted to same-site requests.
const readDirect = (url: string) =>
  fetch(url, {
    credentials: 'include',
    headers: { accept: 'application/json, text/html;q=0.9' },
  })

const describe = (provider: SyncProvider, outcome: SyncOutcome) => {
  const name = labels[provider]
  if (outcome.status === 'synced') {
    if (provider === 'codeforces' || provider === 'codechef')
      return `${name}: ${outcome.message}`
    return outcome.uploadedSubmissions > 0
      ? `${name}: ${outcome.uploadedSubmissions} submissions synced${outcome.historyComplete ? '' : ', more history loading'}.`
      : `${name}: up to date.`
  }
  if (outcome.status === 'signed_out') return `${name}: sign in to sync.`
  if (outcome.status === 'rate_limited')
    return `${name}: paused by rate limit, continuing shortly.`
  return `${name}: ${outcome.message}`
}

const notify = async (
  settings: ConnectorSettings,
  results: Array<[SyncProvider, SyncOutcome]>,
) => {
  if (!settings.notify || results.length === 0) return
  const failed = results.some(
    ([, outcome]) =>
      outcome.status === 'error' || outcome.status === 'unpaired',
  )
  try {
    await chrome.notifications.create(`algomemtor-sync-${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon-128.png'),
      title: failed
        ? 'AlgoMemtor sync needs attention'
        : 'AlgoMemtor sync finished',
      message: results
        .map(([provider, outcome]) => describe(provider, outcome))
        .join('\n'),
    })
  } catch {
    // Notifications can be disabled by the browser or OS.
  }
}

type SyncBase = Omit<SyncDeps, 'read' | 'post'>

// Requests go direct when the browser attaches the provider's session cookie
// to extension requests, and through a provider tab when it does not.
const syncProvider = async (
  provider: SyncProvider,
  state: ConnectorState,
  base: SyncBase,
  pageDeps: SyncDeps,
  api: ReturnType<typeof createApiClient>,
): Promise<{ state: ConnectorState; outcome: SyncOutcome }> => {
  const directDeps: SyncDeps = { ...base, read: readDirect }
  if (provider === 'leetcode') {
    // The LeetCode page is the reliable route (its own cookies and CSRF
    // header); direct requests are a fallback when the page route fails.
    const viaPage = await syncLeetCode(pageDeps, state)
    if (!['error', 'signed_out'].includes(viaPage.outcome.status)) {
      return viaPage
    }
    const direct = await fetchLeetCodeStatuses(readDirect).catch(() => null)
    if (direct?.username == null) return viaPage
    const viaDirect = await syncLeetCode(directDeps, state)
    return viaDirect.outcome.status === 'synced' ? viaDirect : viaPage
  }
  if (provider === 'cses') {
    const result = await syncCses(directDeps, state)
    return result.outcome.status === 'signed_out'
      ? syncCses(pageDeps, state)
      : result
  }
  const claim = (claimProvider: 'codeforces' | 'codechef', handle: string) =>
    api.claim(claimProvider, handle)
  const direct = await syncClaim(provider, readDirect, claim, base.now).catch(
    () => null,
  )
  const probe =
    provider === 'codechef' && pageDeps.evaluate !== undefined
      ? async () =>
          (await pageDeps.evaluate?.(
            'https://www.codechef.com',
            codeChefPageHandle,
          )) ?? null
      : undefined
  const outcome =
    direct !== null && direct.status !== 'signed_out'
      ? direct
      : await syncClaim(provider, pageDeps.read, claim, base.now, probe)
  if (
    provider !== 'codechef' ||
    outcome.status !== 'synced' ||
    outcome.handle === undefined
  ) {
    return { state, outcome }
  }
  // The claim linked and verified the handle; now upload its history. The
  // feed is public, so direct reads work; a CodeChef tab is the fallback.
  const history = async (read: SyncDeps['read']) =>
    syncCodeChef({ ...base, read }, state.codechef, outcome.handle ?? '')
  let result = await history(readDirect)
  if (result.outcome.status === 'error') {
    const viaPage = await history(pageDeps.read)
    if (viaPage.outcome.status !== 'error') result = viaPage
  }
  return {
    state: { ...state, codechef: result.state },
    outcome: {
      ...result.outcome,
      message: `${outcome.message} ${result.outcome.message}`.slice(0, 280),
    },
  }
}

// One platform never holds up or stops the others: each gets a time limit,
// and a failure is recorded for that platform alone.
const PROVIDER_TIME_LIMIT_MS = 4 * 60 * 1000

const withTimeLimit = <T>(work: Promise<T>, provider: SyncProvider) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `${provider} took longer than ${PROVIDER_TIME_LIMIT_MS / 60_000} minutes; it will continue next sync.`,
          ),
        ),
      PROVIDER_TIME_LIMIT_MS,
    )
    work.then(resolve, reject).finally(() => clearTimeout(timer))
  })

// Extension API calls keep an idle background (Chrome's service worker,
// Firefox's event page) from being stopped in the middle of a long sync.
const keepAlive = () => {
  const timer = setInterval(() => {
    void chrome.runtime.getPlatformInfo().catch(() => undefined)
  }, 20_000)
  return () => clearInterval(timer)
}

let running: Promise<ConnectorState> | undefined

const runSync = async () => {
  if (running !== undefined) return running
  running = (async () => {
    const settings = await loadSettings()
    let state = await loadState()
    if (settings.secret === undefined) return state
    const api = createApiClient(settings.apiUrl, settings.secret)
    const pages = createPageReader()
    const base = {
      upload: (upload: Parameters<SyncDeps['upload']>[0]) => api.upload(upload),
      sleep: (ms: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, ms)),
      now: () => new Date(),
    }
    const pageDeps: SyncDeps = {
      ...base,
      read: pages.read,
      post: pages.post,
      evaluate: pages.evaluate,
    }
    const stopKeepAlive = keepAlive()
    const results: Array<[SyncProvider, SyncOutcome]> = []
    let continueSoon = false
    let rateLimited = false
    try {
      for (const provider of SYNC_PROVIDERS) {
        if (!settings.providers[provider]) continue
        let result: { state: ConnectorState; outcome: SyncOutcome }
        try {
          result = await withTimeLimit(
            syncProvider(provider, state, base, pageDeps, api),
            provider,
          )
        } catch (error) {
          result = {
            state,
            outcome: failure({ ...base, read: readDirect }, error),
          }
        }
        state = {
          ...result.state,
          outcomes: { ...result.state.outcomes, [provider]: result.outcome },
        }
        await chrome.storage.local.set({ state }).catch(() => undefined)
        results.push([provider, result.outcome])
        await api.report(
          provider,
          result.outcome.status,
          result.outcome.message,
        )
        continueSoon ||= result.outcome.continueSoon
        rateLimited ||= result.outcome.status === 'rate_limited'
      }
    } finally {
      stopKeepAlive()
      await pages.close()
    }
    await saveSettings({ ...settings, lastRunAt: new Date().toISOString() })
    if (continueSoon) {
      await chrome.alarms.create(CONTINUE_ALARM, {
        delayInMinutes: rateLimited ? 5 : 2,
      })
    }
    await notify(settings, results)
    return state
  })()
  try {
    return await running
  } finally {
    running = undefined
  }
}

// A sync the learner asked for (popup or website button), at most once per
// cooldown. Scheduled, start-up, and continuation syncs are not limited.
const manualSync = async () => {
  const settings = await loadSettings()
  if (settings.secret === undefined) {
    return { ok: false, reason: 'unpaired' as const }
  }
  const last =
    settings.lastManualSyncAt === undefined
      ? 0
      : Date.parse(settings.lastManualSyncAt)
  const nextAllowed = last + MANUAL_SYNC_COOLDOWN_MS
  if (Date.now() < nextAllowed) {
    return {
      ok: false,
      reason: 'cooldown' as const,
      nextAllowedAt: new Date(nextAllowed).toISOString(),
    }
  }
  const startedAt = new Date()
  await saveSettings({ ...settings, lastManualSyncAt: startedAt.toISOString() })
  const state = await runSync()
  return {
    ok: true,
    nextAllowedAt: new Date(
      startedAt.getTime() + MANUAL_SYNC_COOLDOWN_MS,
    ).toISOString(),
    results: SYNC_PROVIDERS.filter((provider) => settings.providers[provider])
      .map((provider) => ({ provider, outcome: state.outcomes[provider] }))
      .flatMap((item) =>
        item.outcome === undefined
          ? []
          : [
              {
                provider: item.provider,
                status: item.outcome.status,
                message: item.outcome.message,
              },
            ],
      ),
  }
}

// Called by the AlgoMemtor site (through the pairing content script) with a
// token it created for the signed-in learner.
const pair = async (message: {
  secret: string
  apiUrl: string
  label: string
}) => {
  const origin = normalizeApiUrl(message.apiUrl)
  // Permission patterns have no port, so check the host the browser granted.
  const url = new URL(origin)
  const granted = await chrome.permissions.contains({
    origins: [`${url.protocol}//${url.hostname}/*`],
  })
  if (!granted) {
    return {
      ok: false,
      error: `The extension is not allowed to reach ${origin} yet. Open the AlgoMemtor Connector popup, choose Grant access, then try again.`,
    }
  }
  const session = await createApiClient(origin, message.secret).session()
  const settings = await loadSettings()
  const changedAccount =
    settings.secret !== undefined && settings.apiUrl !== origin
  await saveSettings({
    ...settings,
    apiUrl: origin,
    secret: message.secret,
    tokenLabel: session.tokenLabel,
  })
  if (changedAccount) await chrome.storage.local.set({ state: emptyState() })
  await schedule(await loadSettings())
  void runSync()
  return { ok: true }
}

const syncIfStale = async () => {
  const settings = await loadSettings()
  if (settings.secret === undefined) return
  const last =
    settings.lastRunAt === undefined ? 0 : Date.parse(settings.lastRunAt)
  if (Date.now() - last >= STARTUP_SYNC_AFTER_MS) void runSync()
}

chrome.runtime.onInstalled.addListener((details) => {
  void (async () => {
    const settings = await loadSettings()
    await schedule(settings)
    if (settings.secret === undefined && details.reason === 'install') {
      // Pairing happens on the signed-in AlgoMemtor site; no token to copy.
      await chrome.tabs.create({
        url: `${WEB_URL}${CONNECT_PATH}`,
        active: true,
      })
      return
    }
    void runSync()
  })()
})
chrome.runtime.onStartup.addListener(() => {
  void syncIfStale()
})
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM || alarm.name === CONTINUE_ALARM) void runSync()
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    sender.id === undefined ||
    typeof message !== 'object' ||
    message === null
  )
    return undefined
  const data = message as Record<string, unknown>
  if (data.type === 'status') {
    void loadSettings().then((settings) =>
      sendResponse({
        paired: settings.secret !== undefined,
        ...(settings.lastManualSyncAt === undefined
          ? {}
          : {
              nextManualSyncAt: new Date(
                Date.parse(settings.lastManualSyncAt) + MANUAL_SYNC_COOLDOWN_MS,
              ).toISOString(),
            }),
      }),
    )
    return true
  }
  if (
    data.type === 'pair' &&
    typeof data.secret === 'string' &&
    typeof data.apiUrl === 'string'
  ) {
    void pair({
      secret: data.secret,
      apiUrl: data.apiUrl,
      label: typeof data.label === 'string' ? data.label : 'Browser extension',
    }).then(sendResponse, (error: unknown) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'Pairing failed.',
      }),
    )
    return true
  }
  if (data.type === 'sync-now') {
    void manualSync().then(sendResponse, (error: unknown) =>
      sendResponse({
        ok: false,
        reason: 'error',
        message: error instanceof Error ? error.message : String(error),
      }),
    )
    return true
  }
  if (data.type === 'settings-changed') {
    void loadSettings()
      .then(schedule)
      .then(() => sendResponse(true))
    return true
  }
  if (data.type === 'reset-history') {
    void chrome.storage.local
      .set({ state: emptyState() })
      .then(() => sendResponse(true))
    return true
  }
  return undefined
})

// Turning the extension on (or the browser waking it) starts the background
// script; sync right away unless a run just happened.
void syncIfStale()
