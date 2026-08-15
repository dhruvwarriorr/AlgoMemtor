import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
} from 'jose'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { createApp } from '../app.js'
import { CodeforcesProvider } from '../integrations/codeforces/codeforces-provider.js'
import {
  createSupabaseJwtVerifier,
  readSupabaseJwtConfig,
  type SupabaseJwtVerifier,
} from './supabase-jwt.js'

const ISSUER = 'https://project-ref.supabase.co/auth/v1'
const SUBJECT = '00000000-0000-4000-8000-000000000001'
const KEY_ID = 'test-signing-key'

let signingKey: CryptoKey
let invalidSigningKey: CryptoKey
let verifyAccessToken: SupabaseJwtVerifier
let verificationJwk: Awaited<ReturnType<typeof exportJWK>>

const servers: Server[] = []

beforeAll(async () => {
  const keyPair = await generateKeyPair('RS256')
  const invalidKeyPair = await generateKeyPair('RS256')
  const publicJwk = await exportJWK(keyPair.publicKey)

  signingKey = keyPair.privateKey
  invalidSigningKey = invalidKeyPair.privateKey
  verificationJwk = {
    ...publicJwk,
    alg: 'RS256',
    kid: KEY_ID,
    use: 'sig',
  }
  verifyAccessToken = createSupabaseJwtVerifier(
    {
      issuer: ISSUER,
      jwksUrl: new URL(`${ISSUER}/.well-known/jwks.json`),
    },
    createLocalJWKSet({
      keys: [verificationJwk],
    }),
  )
})

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

type TokenOptions = {
  audience?: string | null
  expiresAt?: number
  issuer?: string
  role?: string | null
  signingKey?: CryptoKey
  subject?: string | null
}

const createToken = async (options: TokenOptions = {}) => {
  const token = new SignJWT({
    ...(options.role === null ? {} : { role: options.role ?? 'authenticated' }),
  })
    .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
    .setIssuer(options.issuer ?? ISSUER)
    .setExpirationTime(options.expiresAt ?? Math.floor(Date.now() / 1000) + 300)

  if (options.audience !== null) {
    token.setAudience(options.audience ?? 'authenticated')
  }

  if (options.subject !== null) {
    token.setSubject(options.subject ?? SUBJECT)
  }

  return token.sign(options.signingKey ?? signingKey)
}

const startApp = (jwtVerifier = verifyAccessToken) => {
  const provider = new CodeforcesProvider({
    baseUrl: 'https://mock.codeforces.test/api',
    fetchImpl: vi.fn(),
    minRequestIntervalMs: 0,
  })
  const server = createApp({
    jwtVerifier,
    problemProvider: provider,
  }).listen(0)
  servers.push(server)
  const address = server.address() as AddressInfo

  return `http://127.0.0.1:${address.port}`
}

const startRemoteJwksVerifier = async () => {
  const jwksServer = createServer((request, response) => {
    if (request.url !== '/auth/v1/.well-known/jwks.json') {
      response.writeHead(404).end()
      return
    }

    response
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ keys: [verificationJwk] }))
  })
  await new Promise<void>((resolve) => jwksServer.listen(0, resolve))
  servers.push(jwksServer)
  const address = jwksServer.address() as AddressInfo
  const issuer = `http://127.0.0.1:${address.port}/auth/v1`

  return {
    issuer,
    jwtVerifier: createSupabaseJwtVerifier({
      issuer,
      jwksUrl: new URL(`${issuer}/.well-known/jwks.json`),
    }),
  }
}

describe('Supabase JWT configuration', () => {
  it('derives the JWKS URL from the validated issuer', () => {
    expect(
      readSupabaseJwtConfig({ SUPABASE_JWT_ISSUER: `${ISSUER}/` }),
    ).toEqual({
      issuer: ISSUER,
      jwksUrl: new URL(`${ISSUER}/.well-known/jwks.json`),
    })
  })

  it.each([
    undefined,
    'not-a-url',
    'http://project-ref.supabase.co/auth/v1',
    'https://user:password@project-ref.supabase.co/auth/v1',
    'https://project-ref.supabase.co/auth/v1?unsafe=true',
  ])('rejects an invalid Supabase issuer: %s', (issuer) => {
    expect(() =>
      readSupabaseJwtConfig({ SUPABASE_JWT_ISSUER: issuer }),
    ).toThrow()
  })
})

describe('GET /api/me authentication', () => {
  it('fetches a signing key from JWKS before accepting a valid token', async () => {
    const { issuer, jwtVerifier } = await startRemoteJwksVerifier()
    const response = await fetch(`${startApp(jwtVerifier)}/api/me`, {
      headers: {
        authorization: `Bearer ${await createToken({ issuer })}`,
      },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ user: { id: SUBJECT } })
  })

  it('accepts a correctly signed token with valid registered claims', async () => {
    const response = await fetch(`${startApp()}/api/me`, {
      headers: { authorization: `Bearer ${await createToken()}` },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ user: { id: SUBJECT } })
  })

  it.each([
    ['missing', undefined],
    ['wrong scheme', 'Basic credentials'],
    ['missing token', 'Bearer'],
    ['multiple values', 'Bearer first second'],
    ['malformed token', 'Bearer not-a-jwt'],
  ])('rejects a %s authorization header', async (_name, authorization) => {
    const response = await fetch(`${startApp()}/api/me`, {
      ...(authorization === undefined ? {} : { headers: { authorization } }),
    })

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
  })

  it.each([
    [
      'expired token',
      () => createToken({ expiresAt: Math.floor(Date.now() / 1000) - 60 }),
    ],
    [
      'wrong issuer',
      () => createToken({ issuer: 'https://attacker.example/auth/v1' }),
    ],
    ['wrong audience', () => createToken({ audience: 'anon' })],
    ['missing audience', () => createToken({ audience: null })],
    ['wrong role', () => createToken({ role: 'service_role' })],
    ['missing role', () => createToken({ role: null })],
    ['missing subject', () => createToken({ subject: null })],
    ['invalid signature', () => createToken({ signingKey: invalidSigningKey })],
  ])('rejects a token with %s', async (_name, tokenFactory) => {
    const response = await fetch(`${startApp()}/api/me`, {
      headers: { authorization: `Bearer ${await tokenFactory()}` },
    })

    expect(response.status).toBe(401)
  })
})
