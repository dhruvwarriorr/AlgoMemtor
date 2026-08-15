import type { RequestHandler } from 'express'

import type { SupabaseJwtVerifier } from './supabase-jwt.js'

const unauthorizedResponse = {
  error: {
    code: 'UNAUTHORIZED',
    message: 'A valid bearer token is required.',
  },
}

const bearerToken = (authorizationHeader: string | undefined) => {
  if (authorizationHeader === undefined) {
    return null
  }

  const match = /^Bearer\s+(\S+)$/i.exec(authorizationHeader.trim())

  return match?.[1] ?? null
}

export const requireAuth =
  (verifyAccessToken: SupabaseJwtVerifier): RequestHandler =>
  async (request, response, next) => {
    const token = bearerToken(request.header('authorization'))

    if (token === null) {
      response
        .status(401)
        .setHeader('www-authenticate', 'Bearer')
        .json(unauthorizedResponse)
      return
    }

    try {
      response.locals.auth = await verifyAccessToken(token)
      next()
    } catch {
      response
        .status(401)
        .setHeader('www-authenticate', 'Bearer')
        .json(unauthorizedResponse)
    }
  }
