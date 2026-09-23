import { DEFAULT_API_URL, WEB_URL } from './config.js'
import { parseSettings, parseState, type ConnectorSettings } from './state.js'
import { SYNC_PROVIDERS, type SyncProvider } from './types.js'

const labels: Record<SyncProvider, string> = {
  leetcode: 'LeetCode',
  cses: 'CSES',
  codeforces: 'Codeforces',
  codechef: 'CodeChef',
}

// Sites this extension reads: the providers and the AlgoMemtor API/site.
// Permission patterns carry no port.
const hostPattern = (value: string) => {
  const url = new URL(value)
  return `${url.protocol}//${url.hostname}/*`
}
const requiredOrigins = [
  ...new Set([
    'https://leetcode.com/*',
    'https://cses.fi/*',
    'https://codeforces.com/*',
    'https://www.codechef.com/*',
    hostPattern(DEFAULT_API_URL),
    hostPattern(WEB_URL),
  ]),
]

const element = <T extends HTMLElement>(id: string) => {
  const found = document.getElementById(id)
  if (found === null) throw new Error(`Missing #${id}`)
  return found as T
}

const pairedAs = element<HTMLParagraphElement>('paired-as')
const providerList = element<HTMLUListElement>('providers')
const interval = element<HTMLSelectElement>('interval')
const notifyToggle = element<HTMLInputElement>('notify')
const syncNow = element<HTMLButtonElement>('sync-now')
const connect = element<HTMLButtonElement>('connect')
const unpair = element<HTMLButtonElement>('unpair')
const access = element<HTMLElement>('access')
const message = element<HTMLParagraphElement>('message')

const loadSettings = async () =>
  parseSettings((await chrome.storage.local.get('settings')).settings)

const saveSettings = async (settings: ConnectorSettings) => {
  await chrome.storage.local.set({ settings })
  await chrome.runtime.sendMessage({ type: 'settings-changed' })
}

const relative = (iso: string) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`
}

const render = async () => {
  const settings = await loadSettings()
  const state = parseState((await chrome.storage.local.get('state')).state)
  const paired = settings.secret !== undefined
  access.hidden = await chrome.permissions.contains({
    origins: requiredOrigins,
  })
  interval.value = String(settings.intervalMinutes)
  notifyToggle.checked = settings.notify
  pairedAs.textContent = paired
    ? `Connected as “${settings.tokenLabel ?? 'browser extension'}”.`
    : 'Not connected. Connect once while signed in to AlgoMemtor; syncing then starts automatically.'
  connect.hidden = paired
  unpair.hidden = !paired
  syncNow.disabled = !paired
  providerList.replaceChildren(
    ...SYNC_PROVIDERS.map((provider) => {
      const item = document.createElement('li')
      const label = document.createElement('label')
      const toggle = document.createElement('input')
      toggle.type = 'checkbox'
      toggle.checked = settings.providers[provider]
      toggle.addEventListener('change', () => {
        void saveSettings({
          ...settings,
          providers: { ...settings.providers, [provider]: toggle.checked },
        }).then(render)
      })
      label.append(toggle, labels[provider])
      const status = document.createElement('p')
      const outcome = state.outcomes[provider]
      status.className = `status ${outcome?.status ?? ''}`
      status.textContent =
        outcome === undefined
          ? 'Not synced yet.'
          : `${outcome.handle === undefined ? '' : `${outcome.handle} · `}${outcome.message} (${relative(outcome.at)})`
      item.append(label, status)
      return item
    }),
  )
}

element<HTMLButtonElement>('grant').addEventListener('click', () => {
  void chrome.permissions.request({ origins: requiredOrigins }).then(render)
})

connect.addEventListener('click', () => {
  void chrome.tabs.create({
    url: `${WEB_URL}/settings#platforms`,
    active: true,
  })
  window.close()
})

unpair.addEventListener('click', () => {
  void (async () => {
    const {
      secret: _secret,
      tokenLabel: _label,
      ...rest
    } = await loadSettings()
    await saveSettings(rest)
    await chrome.runtime.sendMessage({ type: 'reset-history' })
    message.textContent =
      'Disconnected. You can also revoke it in AlgoMemtor settings.'
    await render()
  })()
})

interval.addEventListener('change', () => {
  void (async () => {
    await saveSettings({
      ...(await loadSettings()),
      intervalMinutes: Number(interval.value),
    })
    message.textContent = 'Schedule updated.'
  })()
})

notifyToggle.addEventListener('change', () => {
  void (async () => {
    await saveSettings({
      ...(await loadSettings()),
      notify: notifyToggle.checked,
    })
  })()
})

syncNow.addEventListener('click', () => {
  void (async () => {
    syncNow.disabled = true
    message.textContent = 'Syncing… this can take a minute.'
    const result = (await chrome.runtime.sendMessage({ type: 'sync-now' })) as {
      ok?: boolean
      reason?: string
      nextAllowedAt?: string
    } | null
    message.textContent =
      result?.ok === true
        ? 'Sync finished.'
        : result?.reason === 'cooldown' && result.nextAllowedAt !== undefined
          ? `Synced recently. You can sync again at ${new Date(result.nextAllowedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
          : 'The sync could not start.'
    await render()
  })()
})

void render()
