// Content script on the AlgoMemtor website. It lets the signed-in site hand
// this extension a connector token, so the learner never copies one by hand.
// Only messages from this same page (same window and origin) are accepted.

const SOURCE_WEB = 'algomemtor-web'
const SOURCE_EXTENSION = 'algomemtor-extension'

const announce = async () => {
  let status: { paired?: boolean; nextManualSyncAt?: string } | null = null
  try {
    status = (await chrome.runtime.sendMessage({ type: 'status' })) as {
      paired?: boolean
      nextManualSyncAt?: string
    } | null
  } catch {
    status = null
  }
  window.postMessage(
    {
      source: SOURCE_EXTENSION,
      type: 'connector-ready',
      paired: status?.paired === true,
      ...(typeof status?.nextManualSyncAt === 'string'
        ? { nextManualSyncAt: status.nextManualSyncAt }
        : {}),
    },
    window.location.origin,
  )
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.origin !== window.location.origin) return
  const data = event.data as {
    source?: unknown
    type?: unknown
    secret?: unknown
    apiUrl?: unknown
    label?: unknown
  } | null
  if (data?.source !== SOURCE_WEB) return
  if (data.type === 'connector-hello') {
    void announce()
    return
  }
  // The website's Sync button: run the same rate-limited sync as the popup.
  if (data.type === 'connector-sync') {
    const reply = (result: unknown) =>
      window.postMessage(
        { source: SOURCE_EXTENSION, type: 'connector-sync-result', result },
        window.location.origin,
      )
    void chrome.runtime
      .sendMessage({ type: 'sync-now' })
      .then(reply, () => reply({ ok: false, reason: 'error' }))
    return
  }
  if (
    data.type === 'connector-pair' &&
    typeof data.secret === 'string' &&
    typeof data.apiUrl === 'string'
  ) {
    void chrome.runtime
      .sendMessage({
        type: 'pair',
        secret: data.secret,
        apiUrl: data.apiUrl,
        label:
          typeof data.label === 'string' ? data.label : 'Browser extension',
      })
      .then(
        (result: unknown) => {
          const outcome = result as { ok?: boolean; error?: string } | null
          window.postMessage(
            {
              source: SOURCE_EXTENSION,
              type: 'connector-paired',
              ok: outcome?.ok === true,
              ...(outcome?.error === undefined ? {} : { error: outcome.error }),
            },
            window.location.origin,
          )
        },
        () => {
          window.postMessage(
            {
              source: SOURCE_EXTENSION,
              type: 'connector-paired',
              ok: false,
              error: 'The extension could not be reached.',
            },
            window.location.origin,
          )
        },
      )
  }
})

void announce()
