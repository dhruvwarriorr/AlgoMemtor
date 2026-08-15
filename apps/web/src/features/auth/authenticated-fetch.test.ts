import { afterEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: authMocks },
}))

import {
  authenticatedFetch,
  AuthSessionExpiredError,
  sessionExpiredEventName,
} from './authenticated-fetch'

const session = (accessToken: string) => ({ access_token: accessToken })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('authenticatedFetch', () => {
  it('attaches the current access token while preserving request headers', async () => {
    authMocks.getSession.mockResolvedValue({
      data: { session: session('current-token') },
      error: null,
    })
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(() => Promise.resolve(new Response(null, { status: 200 })))
    vi.stubGlobal('fetch', fetchMock)

    const response = await authenticatedFetch('/api/problems', {
      headers: { 'x-request-id': 'request-1' },
    })

    expect(response.status).toBe(200)
    const requestInit = fetchMock.mock.calls[0]?.[1]
    const headers = new Headers(requestInit?.headers)
    expect(headers.get('authorization')).toBe('Bearer current-token')
    expect(headers.get('x-request-id')).toBe('request-1')
    expect(authMocks.refreshSession).not.toHaveBeenCalled()
  })

  it('refreshes once after a 401 and retries with the new token', async () => {
    authMocks.getSession.mockResolvedValue({
      data: { session: session('expired-token') },
      error: null,
    })
    authMocks.refreshSession.mockResolvedValue({
      data: { session: session('refreshed-token') },
      error: null,
    })
    const fetchMock = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await authenticatedFetch('/api/problems')

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const retryHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers)
    expect(retryHeaders.get('authorization')).toBe('Bearer refreshed-token')
    expect(authMocks.signOut).not.toHaveBeenCalled()
  })

  it('clears and announces an unrecoverable session', async () => {
    authMocks.getSession.mockResolvedValue({
      data: { session: null },
      error: new Error('Invalid refresh token'),
    })
    authMocks.signOut.mockResolvedValue({ error: null })
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })

    await expect(authenticatedFetch('/api/problems')).rejects.toBeInstanceOf(
      AuthSessionExpiredError,
    )
    expect(authMocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(dispatchEvent).toHaveBeenCalledOnce()
    expect(dispatchEvent.mock.calls[0]?.[0]).toMatchObject({
      type: sessionExpiredEventName,
    })
  })

  it('expires the session when the refreshed token is also rejected', async () => {
    authMocks.getSession.mockResolvedValue({
      data: { session: session('expired-token') },
      error: null,
    })
    authMocks.refreshSession.mockResolvedValue({
      data: { session: session('rejected-refreshed-token') },
      error: null,
    })
    authMocks.signOut.mockResolvedValue({ error: null })
    vi.stubGlobal(
      'fetch',
      vi.fn<
        (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
      >(() => Promise.resolve(new Response(null, { status: 401 }))),
    )
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })

    await expect(authenticatedFetch('/api/problems')).rejects.toBeInstanceOf(
      AuthSessionExpiredError,
    )
    expect(authMocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(dispatchEvent).toHaveBeenCalledOnce()
  })
})
