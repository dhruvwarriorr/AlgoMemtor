import { supabase } from '@/lib/supabase'

export const sessionExpiredMessage =
  'Your session expired or is no longer valid. Please sign in again.'

export const sessionExpiredEventName = 'algomemtor:session-expired'

export class AuthSessionExpiredError extends Error {
  constructor(options?: ErrorOptions) {
    super(sessionExpiredMessage, options)
    this.name = 'AuthSessionExpiredError'
  }
}

// In production the browser calls the Core API origin directly: a hosting
// proxy in between (Vercel's external rewrite) cuts requests off after two
// minutes, and long AI answers or a sleeping API can take longer. Unset, the
// relative /api path uses the Vite dev proxy or the site's own rewrite.
export function apiUrl(input: RequestInfo | URL): RequestInfo | URL {
  const configured: unknown = import.meta.env.VITE_API_BASE_URL
  if (
    typeof input !== 'string' ||
    !input.startsWith('/api/') ||
    typeof configured !== 'string' ||
    configured.trim() === ''
  ) {
    return input
  }
  return `${configured.trim().replace(/\/+$/, '')}${input}`
}

function requestWithAccessToken(
  input: RequestInfo | URL,
  init: RequestInit,
  accessToken: string,
) {
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${accessToken}`)

  return fetch(apiUrl(input), { ...init, headers })
}

async function expireLocalSession(cause?: unknown): Promise<never> {
  window.dispatchEvent(new Event(sessionExpiredEventName))

  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // The session-expired event still clears React's authenticated state.
  }

  throw new AuthSessionExpiredError({ cause })
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const sessionResult = await supabase.auth.getSession()
  const session = sessionResult.data.session

  if (sessionResult.error || !session) {
    return expireLocalSession(sessionResult.error)
  }

  const response = await requestWithAccessToken(
    input,
    init,
    session.access_token,
  )

  if (response.status !== 401) {
    return response
  }

  if (init.signal?.aborted) {
    throw init.signal.reason
  }

  const refreshResult = await supabase.auth.refreshSession()
  const refreshedSession = refreshResult.data.session

  if (refreshResult.error || !refreshedSession) {
    return expireLocalSession(refreshResult.error)
  }

  const retryResponse = await requestWithAccessToken(
    input,
    init,
    refreshedSession.access_token,
  )

  if (retryResponse.status === 401) {
    return expireLocalSession()
  }

  return retryResponse
}
