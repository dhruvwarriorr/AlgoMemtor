import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApp } from './app.js'
import type { SupabaseJwtVerifier } from './auth/supabase-jwt.js'
import { CodeforcesProvider } from './integrations/codeforces/codeforces-provider.js'
import { InMemoryAvatarRepository } from './repositories/avatar-repository.js'

const subjects: Record<string, string> = {
  'first-token': '00000000-0000-4000-8000-000000000001',
  'second-token': '00000000-0000-4000-8000-000000000002',
}

const jwtVerifier: SupabaseJwtVerifier = async (token) => {
  const subject = subjects[token]
  if (subject === undefined) throw new Error('Invalid test token.')
  return { subject, claims: { role: 'authenticated' } }
}

const servers: ReturnType<ReturnType<typeof createApp>['listen']>[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) =>
            error === undefined ? resolve() : reject(error),
          )
        }),
    ),
  )
})

const startApp = () => {
  const server = createApp({
    jwtVerifier,
    avatarRepository: new InMemoryAvatarRepository(),
    problemProvider: new CodeforcesProvider({
      baseUrl: 'https://mock.codeforces.test/api',
      fetchImpl: vi.fn(),
      minRequestIntervalMs: 0,
    }),
  }).listen(0)
  servers.push(server)
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

const webp = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x10, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
  Buffer.alloc(16, 1),
])

const upload = (
  baseUrl: string,
  token: string,
  body: Buffer,
  type = 'image/webp',
) =>
  fetch(`${baseUrl}/api/me/avatar`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': type },
    body: new Uint8Array(body),
  })

describe('learner avatar API', () => {
  it('stores, serves, isolates and deletes a profile picture', async () => {
    const baseUrl = startApp()
    const saved = await upload(baseUrl, 'first-token', webp)
    expect(saved.status).toBe(200)

    const own = await fetch(`${baseUrl}/api/me/avatar`, {
      headers: { authorization: 'Bearer first-token' },
    })
    expect(own.status).toBe(200)
    expect(own.headers.get('content-type')).toBe('image/webp')
    expect(Buffer.from(await own.arrayBuffer()).equals(webp)).toBe(true)

    const other = await fetch(`${baseUrl}/api/me/avatar`, {
      headers: { authorization: 'Bearer second-token' },
    })
    expect(other.status).toBe(404)

    const removed = await fetch(`${baseUrl}/api/me/avatar`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer first-token' },
    })
    expect(removed.status).toBe(204)
    const after = await fetch(`${baseUrl}/api/me/avatar`, {
      headers: { authorization: 'Bearer first-token' },
    })
    expect(after.status).toBe(404)
  })

  it('rejects non-images, mismatched types, oversized files and anonymous calls', async () => {
    const baseUrl = startApp()
    expect(
      (await upload(baseUrl, 'first-token', Buffer.from('<svg onload=1>')))
        .status,
    ).toBe(415)
    expect(
      (await upload(baseUrl, 'first-token', webp, 'image/png')).status,
    ).toBe(415)
    expect(
      (
        await upload(
          baseUrl,
          'first-token',
          Buffer.concat([webp, Buffer.alloc(300 * 1024)]),
        )
      ).status,
    ).toBe(413)
    const anonymous = await fetch(`${baseUrl}/api/me/avatar`, {
      method: 'PUT',
      headers: { 'content-type': 'image/webp' },
      body: new Uint8Array(webp),
    })
    expect(anonymous.status).toBe(401)
  })
})
