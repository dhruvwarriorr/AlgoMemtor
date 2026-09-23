import { UploadError } from './sync.js'
import type { ConnectorUpload } from './types.js'

export type ConnectorSession = {
  tokenLabel: string
  accounts: { provider: string; handle: string; verified: boolean }[]
}

// Only the AlgoMemtor origin the learner configured is ever contacted with
// the connector token.
export const normalizeApiUrl = (value: string) => {
  const url = new URL(value.trim())
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('Use an https:// address (http:// only for localhost).')
  }
  return url.origin
}

const errorMessage = async (response: Response) => {
  try {
    const body = (await response.json()) as { error?: { message?: unknown } }
    if (typeof body.error?.message === 'string') return body.error.message
  } catch {
    // Fall through to the status text.
  }
  return `AlgoMemtor returned HTTP ${response.status}.`
}

export const createApiClient = (
  apiUrl: string,
  secret: string,
  fetchImpl: typeof fetch = fetch,
) => {
  const origin = normalizeApiUrl(apiUrl)
  const headers = { authorization: `Bearer ${secret}` }
  return {
    async session(): Promise<ConnectorSession> {
      const response = await fetchImpl(`${origin}/api/connector/session`, {
        headers,
      })
      if (!response.ok) {
        throw new UploadError(
          response.status === 401,
          await errorMessage(response),
        )
      }
      const body = (await response.json()) as { data: ConnectorSession }
      return body.data
    },
    async claim(provider: 'codeforces' | 'codechef', handle: string) {
      const response = await fetchImpl(`${origin}/api/connector/claim`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ provider, handle }),
      })
      if (!response.ok) {
        throw new UploadError(
          response.status === 401,
          await errorMessage(response),
        )
      }
      const body = (await response.json()) as {
        data: { handle: string; verified: boolean; syncQueued: boolean }
      }
      return body.data
    },
    // Best effort: a sync outcome for the server's logs.
    async report(provider: string, status: string, message: string) {
      try {
        await fetchImpl(`${origin}/api/connector/report`, {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({
            provider,
            status,
            message: message.slice(0, 300),
          }),
        })
      } catch {
        // Reporting never affects the sync.
      }
    },
    async upload(upload: ConnectorUpload) {
      const response = await fetchImpl(`${origin}/api/connector/ingest`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify(upload),
      })
      if (!response.ok) {
        throw new UploadError(
          response.status === 401,
          await errorMessage(response),
        )
      }
    },
  }
}
