import type { Context } from 'hono'
import {
  extractClientCredentialsFromBasicAuthHeader,
  extractClientCredentialsFromForm,
} from '../clients/auth.ts'
import { authenticateClient } from '../clients/service.ts'
import { getOidcConfig } from '../oidc/config.ts'
import { oidcJsonError } from '../oidc/error-response.ts'
import { parseJwt, verifyJwt } from '../tokens/jwt.ts'
import {
  getActiveKeyPair,
  getLatestActiveKey,
} from '../tokens/key-management.ts'
import { getRefreshTokenByValue } from './refresh-token-storage.ts'

const INTROSPECT_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
} as const

/**
 * RFC 7662 Token Introspection endpoint.
 * POST /introspect with token, optional token_type_hint, and client authentication.
 * Returns active/inactive and token metadata.
 * Client authentication is required (confidential clients only).
 */
export const handleIntrospectRequest = async (
  c: Context,
): Promise<Response> => {
  const contentType = c.req.header('Content-Type') ?? ''
  if (!contentType.includes('application/x-www-form-urlencoded')) {
    return oidcJsonError(
      'invalid_request',
      'Content-Type must be application/x-www-form-urlencoded',
    )
  }

  const formData = await c.req.parseBody()
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(formData)) {
    if (typeof value === 'string') {
      params.set(key, value)
    }
  }

  const token = params.get('token')
  if (!token || token.trim() === '') {
    return oidcJsonError('invalid_request', 'token is required')
  }

  const credentials =
    extractClientCredentialsFromForm(params) ??
    extractClientCredentialsFromBasicAuthHeader(c.req.header('Authorization'))

  if (!credentials) {
    return oidcJsonError(
      'invalid_client',
      'Client authentication required for introspection',
      401,
    )
  }

  const client = await authenticateClient(
    credentials.clientId,
    credentials.clientSecret,
  )
  if (!client) {
    return oidcJsonError('invalid_client', 'Invalid client credentials', 401)
  }

  const tokenTypeHint = params.get('token_type_hint')
  if (
    tokenTypeHint &&
    tokenTypeHint !== 'access_token' &&
    tokenTypeHint !== 'refresh_token'
  ) {
    return oidcJsonError(
      'invalid_request',
      'token_type_hint must be access_token or refresh_token',
    )
  }

  const trimmedToken = token.trim()

  // Try access token first (JWT) unless hint says refresh_token
  if (tokenTypeHint !== 'refresh_token') {
    const accessResult = await introspectAccessToken(trimmedToken)
    if (accessResult !== null) {
      return new Response(JSON.stringify(accessResult), {
        status: 200,
        headers: INTROSPECT_HEADERS,
      })
    }
  }

  // Try refresh token
  if (tokenTypeHint !== 'access_token') {
    const refreshResult = await introspectRefreshToken(trimmedToken)
    if (refreshResult !== null) {
      return new Response(JSON.stringify(refreshResult), {
        status: 200,
        headers: INTROSPECT_HEADERS,
      })
    }
  }

  return new Response(JSON.stringify({ active: false }), {
    status: 200,
    headers: INTROSPECT_HEADERS,
  })
}

const introspectAccessToken = async (
  token: string,
): Promise<Record<string, unknown> | null> => {
  try {
    const config = getOidcConfig()
    const { header } = parseJwt(token)
    const kid = header.kid as string | undefined
    const keyPair = kid ? getActiveKeyPair(kid) : getLatestActiveKey('RS256')
    if (!keyPair) return null

    const { payload } = verifyJwt(token, keyPair.publicKey, keyPair.algorithm)

    if (payload.iss !== config.issuer) return null

    const exp = payload.exp as number | undefined
    if (typeof exp !== 'number' || exp <= 0) return null
    const now = Math.floor(Date.now() / 1000)
    if (exp < now) {
      return { active: false, exp }
    }

    const result: Record<string, unknown> = {
      active: true,
      scope: payload.scope ?? '',
      client_id: payload.client_id,
      username: payload.sub,
      sub: payload.sub,
      token_type: 'Bearer',
      exp: payload.exp,
      iat: payload.iat,
    }
    if (payload.iss) result.iss = payload.iss
    if (payload.aud) result.aud = payload.aud
    if (payload.jti) result.jti = payload.jti

    return result
  } catch {
    return null
  }
}

const introspectRefreshToken = async (
  token: string,
): Promise<Record<string, unknown> | null> => {
  const data = await getRefreshTokenByValue(token)
  if (!data) return null

  const now = new Date()
  if (data.expires_at < now) {
    return { active: false, exp: Math.floor(data.expires_at.getTime() / 1000) }
  }

  return {
    active: true,
    scope: data.scopes.join(' '),
    client_id: data.client_id,
    username: data.user_id,
    sub: data.user_id,
    token_type: 'refresh_token',
    exp: Math.floor(data.expires_at.getTime() / 1000),
    iat: Math.floor(data.created_at.getTime() / 1000),
  }
}
