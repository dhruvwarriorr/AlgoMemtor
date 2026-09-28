import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose'
import { z } from 'zod'

const SUPABASE_JWT_ALGORITHMS = ['ES256', 'RS256'] as const

const SupabaseJwtEnvironmentSchema = z.object({
  SUPABASE_JWT_ISSUER: z.string().url(),
})

export type SupabaseJwtConfig = {
  issuer: string
  jwksUrl: URL
}

export type VerifiedAccessToken = {
  subject: string
  claims: JWTPayload
}

export type SupabaseJwtVerifier = (
  token: string,
) => Promise<VerifiedAccessToken>

export class InvalidAccessTokenError extends Error {
  constructor(options?: ErrorOptions) {
    super('The access token is invalid.', options)
    this.name = 'InvalidAccessTokenError'
  }
}

const isLoopbackHostname = (hostname: string) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'

export const readSupabaseJwtConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): SupabaseJwtConfig => {
  const parsed = SupabaseJwtEnvironmentSchema.parse(environment)
  const issuerUrl = new URL(parsed.SUPABASE_JWT_ISSUER)

  if (
    (issuerUrl.protocol !== 'https:' &&
      !(
        issuerUrl.protocol === 'http:' && isLoopbackHostname(issuerUrl.hostname)
      )) ||
    issuerUrl.username !== '' ||
    issuerUrl.password !== '' ||
    issuerUrl.search !== '' ||
    issuerUrl.hash !== ''
  ) {
    throw new Error(
      'SUPABASE_JWT_ISSUER must be an HTTPS URL, or an HTTP loopback URL for local development, without credentials, query parameters, or fragments.',
    )
  }

  const issuer = issuerUrl.toString().replace(/\/$/, '')

  return {
    issuer,
    jwksUrl: new URL(`${issuer}/.well-known/jwks.json`),
  }
}

export const createSupabaseJwtVerifier =
  (
    config: SupabaseJwtConfig,
    jwks: JWTVerifyGetKey = createRemoteJWKSet(config.jwksUrl),
  ): SupabaseJwtVerifier =>
  async (token) => {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        algorithms: [...SUPABASE_JWT_ALGORITHMS],
        audience: 'authenticated',
        issuer: config.issuer,
        requiredClaims: ['iss', 'aud', 'exp', 'role', 'sub'],
      })

      if (
        typeof payload.sub !== 'string' ||
        payload.sub.trim() === '' ||
        payload.role !== 'authenticated'
      ) {
        throw new InvalidAccessTokenError()
      }

      return {
        subject: payload.sub,
        claims: payload,
      }
    } catch (error) {
      if (error instanceof InvalidAccessTokenError) {
        throw error
      }

      throw new InvalidAccessTokenError({ cause: error })
    }
  }
