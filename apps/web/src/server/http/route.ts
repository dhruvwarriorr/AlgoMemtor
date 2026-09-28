import 'server-only'

import { randomUUID, timingSafeEqual } from 'node:crypto'

import { ConnectorSecretSchema } from '@algomemtor/shared-contracts'
import type { NextRequest } from 'next/server'

import { getServerContext, type ServerContext } from '../context'
import type { AiUsageFeature } from '../services/ai-usage-limiter'
import { ProgressOutboxUnavailableError } from '../services/progress-service'
import { aiUsageLimitMessage } from './ai-usage'
import { createApiError, deletionPending, HttpError, httpError } from './errors'

// Every route handler goes through `route()`. It does what the Express
// middleware stack used to: request IDs, security headers, JSON bodies with a
// size limit, authentication, the pending-deletion gate, AI usage limits,
// connector CORS and the final error mapping.

type AuthMode =
  // A Supabase session (Bearer access token) for the signed-in site.
  | 'user'
  // A browser-connector token; these routes are called from the extension.
  | 'connector'
  // The AI service, with the shared internal service token.
  | 'internal'
  | 'public'

type Params = Record<string, string | string[]>

type RouteOptions = {
  auth: AuthMode
  // Largest accepted request body, in bytes (JSON by default).
  bodyLimit?: number
  // 'raw' hands the handler the bytes of a body whose type is in rawTypes.
  body?: 'json' | 'raw'
  rawTypes?: readonly string[]
  // User routes a learner can reach while their data deletion finishes.
  allowDuringDeletion?: boolean
  // Counts the request against the learner's AI allowance; `aiUsageApplies`
  // narrows counting to requests that will call a model.
  aiUsage?: AiUsageFeature
  aiUsageApplies?: (body: unknown) => boolean
}

export type RouteContext<P extends Params> = {
  request: NextRequest
  params: P
  query: URLSearchParams
  requestId: string
  // The parsed JSON body; undefined when the request has none.
  body: unknown
  // The raw body for `body: 'raw'` routes; null when absent or another type.
  rawBody: Buffer | null
  // The learner: the verified session subject, or the connector's owner.
  subject: string
  connectorToken: { authUserId: string; label: string } | null
  app: ServerContext
}

const DEFAULT_BODY_LIMIT = 1024 * 1024

// The Helmet defaults the Express API sent with every response.
const securityHeaders: Record<string, string> = {
  'content-security-policy':
    "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests",
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'origin-agent-cluster': '?1',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-dns-prefetch-control': 'off',
  'x-download-options': 'noopen',
  'x-frame-options': 'SAMEORIGIN',
  'x-permitted-cross-domain-policies': 'none',
  'x-xss-protection': '0',
}

// The browser connector calls its token-authenticated routes from its
// extension origin (chrome-extension:// or moz-extension://). They accept
// only a connector token, never cookies or a Supabase session.
const extensionOrigin = /^(chrome-extension|moz-extension):\/\/[a-z0-9-]+$/i

const connectorCorsHeaders = (request: Request): Record<string, string> => {
  const origin = request.headers.get('origin')
  return origin !== null && extensionOrigin.test(origin)
    ? { 'access-control-allow-origin': origin, vary: 'Origin' }
    : { vary: 'Origin' }
}

// Answers the CORS preflight for connector routes (export it as OPTIONS).
export function connectorPreflight(request: Request) {
  return new Response(null, {
    status: 204,
    headers: {
      ...connectorCorsHeaders(request),
      'access-control-allow-methods': 'GET,POST',
      'access-control-allow-headers': 'authorization,content-type',
      'content-length': '0',
    },
  })
}

const unauthorized = () =>
  new HttpError(
    401,
    {
      error: {
        code: 'UNAUTHORIZED',
        message: 'A valid bearer token is required.',
      },
    },
    { 'www-authenticate': 'Bearer' },
  )

const bearerToken = (header: string | null) =>
  header === null
    ? null
    : (/^Bearer\s+(\S+)$/i.exec(header.trim())?.[1] ?? null)

const payloadTooLarge = () =>
  httpError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.')

const invalidJson = () =>
  httpError(400, 'INVALID_JSON', 'The request body is not valid JSON.')

const mediaType = (request: Request) =>
  request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''

async function readBody(request: Request, limit: number) {
  const declared = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > limit) throw payloadTooLarge()
  if (request.body === null) return Buffer.alloc(0)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel()
        throw payloadTooLarge()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, size)
}

// Like express.json(): only JSON requests are parsed, an empty body stays
// undefined, and only objects and arrays are accepted at the top level.
async function readJsonBody(request: Request, limit: number) {
  if (request.body === null) return undefined
  const type = mediaType(request)
  if (type !== 'application/json' && !type.endsWith('+json')) return undefined
  const text = (await readBody(request, limit)).toString('utf8')
  if (text.trim() === '') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw invalidJson()
  }
  if (typeof parsed !== 'object' || parsed === null) throw invalidJson()
  return parsed
}

const decode = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

// Path segments arrive encoded; Express handed them to handlers decoded.
const decodeParams = (params: Params): Params =>
  Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.map(decode) : decode(value),
    ]),
  )

function requireInternalService(request: Request, app: ServerContext) {
  const configured = Buffer.from(app.internalServiceToken)
  const candidate = Buffer.from(
    request.headers.get('x-internal-service-token') ?? '',
  )
  if (configured.length === 0) {
    throw httpError(
      503,
      'INTERNAL_SERVICE_NOT_CONFIGURED',
      'The internal service is not configured.',
    )
  }
  if (
    candidate.length !== configured.length ||
    !timingSafeEqual(candidate, configured)
  ) {
    throw httpError(
      401,
      'INVALID_INTERNAL_SERVICE_TOKEN',
      'The internal service token is invalid.',
    )
  }
}

async function authenticateConnector(request: Request, app: ServerContext) {
  const secret = ConnectorSecretSchema.safeParse(
    bearerToken(request.headers.get('authorization')),
  )
  const reject = () =>
    httpError(
      401,
      'CONNECTOR_UNAUTHORIZED',
      'This connector is not paired or was revoked. Pair it again from your AlgoMemtor profile.',
      {},
      { 'www-authenticate': 'Bearer' },
    )
  if (!secret.success) throw reject()
  const token = await app.connectorService.authenticate(secret.data)
  if (token === null) throw reject()
  if (
    (await app.progressRepository.hasPendingDeletion(token.authUserId)) === true
  ) {
    throw deletionPending()
  }
  return { authUserId: token.authUserId, label: token.label }
}

async function authenticateUser(
  request: Request,
  app: ServerContext,
  allowDuringDeletion: boolean,
) {
  const token = bearerToken(request.headers.get('authorization'))
  if (token === null) throw unauthorized()
  let subject: string
  try {
    subject = (await app.jwtVerifier(token)).subject
  } catch {
    throw unauthorized()
  }
  if (
    !allowDuringDeletion &&
    (await app.progressRepository.hasPendingDeletion(subject)) === true
  ) {
    throw deletionPending()
  }
  return subject
}

async function limitAiUsage(
  app: ServerContext,
  feature: AiUsageFeature,
  subject: string,
) {
  if (!app.aiUsageLimiter.enabled) return
  const decision = await app.aiUsageLimiter.consume(subject, feature)
  if (decision.allowed) return
  throw httpError(
    429,
    'AI_USAGE_LIMITED',
    aiUsageLimitMessage(feature, decision),
    { retryable: true },
    { 'retry-after': String(decision.retryAfterSeconds) },
  )
}

function errorResponse(
  error: unknown,
  request: NextRequest,
  requestId: string,
  app: ServerContext | undefined,
) {
  if (error instanceof HttpError) {
    return Response.json(error.body, {
      status: error.status,
      headers: error.headers,
    })
  }
  const logger = app?.logger
  const route = request.nextUrl.pathname
  if (error instanceof ProgressOutboxUnavailableError) {
    logger?.warn('progress_outbox_unavailable', {
      service: 'core-api',
      route,
      requestId,
      errorCode: error.code,
    })
    return Response.json(
      createApiError(
        error.code,
        'Progress processing is temporarily unavailable. Please try again.',
        { retryable: true },
      ),
      { status: 503 },
    )
  }
  const fields = {
    service: 'core-api',
    route,
    requestId,
    httpStatus: 500,
    errorCode: 'INTERNAL_SERVER_ERROR',
    // The error class and a database error code (e.g. P2002) are safe to
    // log; the message and stack are dropped by the logger.
    errorName: error instanceof Error ? error.name : typeof error,
    dbCode:
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : undefined,
  }
  if (logger === undefined) {
    // The context itself failed to start (for example a missing setting).
    console.error('unhandled_request_error', fields, error)
  } else {
    logger.error('unhandled_request_error', fields)
    // The structured log drops messages and stacks; show them locally.
    if (process.env.NODE_ENV === 'development') console.error(error)
  }
  return Response.json(
    createApiError(
      'INTERNAL_SERVER_ERROR',
      'The application service could not complete the request.',
    ),
    { status: 500 },
  )
}

export function route<P extends Params = Params>(
  options: RouteOptions,
  handler: (context: RouteContext<P>) => Promise<Response> | Response,
) {
  return async (
    request: NextRequest,
    segment: { params: Promise<P> },
  ): Promise<Response> => {
    const supplied = request.headers.get('x-request-id')
    const requestId =
      supplied !== null && /^[A-Za-z0-9_-]{1,100}$/.test(supplied)
        ? supplied
        : randomUUID()
    let app: ServerContext | undefined
    let response: Response
    try {
      const limit = options.bodyLimit ?? DEFAULT_BODY_LIMIT
      let body: unknown
      let rawBody: Buffer | null = null
      if (options.body === 'raw') {
        rawBody =
          request.body !== null &&
          (options.rawTypes ?? []).includes(mediaType(request))
            ? await readBody(request, limit)
            : null
      } else {
        body = await readJsonBody(request, limit)
      }

      app = getServerContext()
      let subject = ''
      let connectorToken: RouteContext<P>['connectorToken'] = null
      if (options.auth === 'user') {
        subject = await authenticateUser(
          request,
          app,
          options.allowDuringDeletion === true,
        )
      } else if (options.auth === 'connector') {
        connectorToken = await authenticateConnector(request, app)
        subject = connectorToken.authUserId
      } else if (options.auth === 'internal') {
        requireInternalService(request, app)
      }

      if (
        options.aiUsage !== undefined &&
        (options.aiUsageApplies?.(body) ?? true)
      ) {
        await limitAiUsage(app, options.aiUsage, subject)
      }

      response = await handler({
        request,
        params: decodeParams((await segment.params) ?? {}) as P,
        query: request.nextUrl.searchParams,
        requestId,
        body,
        rawBody,
        subject,
        connectorToken,
        app,
      })
    } catch (error) {
      response = errorResponse(error, request, requestId, app)
    }

    const headers = new Headers(response.headers)
    headers.set('x-request-id', requestId)
    for (const [name, value] of Object.entries(securityHeaders)) {
      if (!headers.has(name)) headers.set(name, value)
    }
    if (options.auth === 'connector') {
      for (const [name, value] of Object.entries(connectorCorsHeaders(request)))
        headers.set(name, value)
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }
}

// Query parameters the way Express handed them to the schemas: a repeated
// key becomes an array.
export const queryRecord = (params: URLSearchParams) => {
  const record: Record<string, string | string[]> = {}
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key)
    record[key] = values.length === 1 ? (values[0] ?? '') : values
  }
  return record
}

// Small helpers for handler results.
export const json = (body: unknown, status = 200) =>
  Response.json(body, { status })

export const noContent = () => new Response(null, { status: 204 })
