import type { Context, Next } from 'hono'
import { getOidcConfig } from '../oidc/config.ts'
import { parseJwt, verifyJwt } from '../tokens/jwt.ts'
import {
  getActiveKeyPair,
  getLatestActiveKey,
} from '../tokens/key-management.ts'

export interface AccessTokenPayload {
  sub: string
  scope?: string
  client_id?: string
  iss?: string
  aud?: string | string[]
  exp?: number
  iat?: number
  nbf?: number
}

const extractBearerToken = (authHeader: string | undefined): string | null => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  const token = authHeader.slice(7).trim()
  return token.length > 0 ? token : null
}

const validateAccessTokenClaims = (
  payload: Record<string, unknown>,
  issuer: string,
): void => {
  const iss = payload.iss as string | undefined
  if (iss !== issuer) {
    throw new Error(
      `Invalid issuer: expected ${issuer}, got ${iss ?? 'undefined'}`,
    )
  }

  const exp = payload.exp as number | undefined
  if (typeof exp !== 'number' || exp <= 0) {
    throw new Error('Invalid or missing exp claim')
  }
  const now = Math.floor(Date.now() / 1000)
  if (exp < now) {
    throw new Error('Token has expired')
  }

  const nbf = payload.nbf as number | undefined
  if (nbf !== undefined && typeof nbf === 'number' && nbf > now) {
    throw new Error('Token not yet valid')
  }
}

/**
 * Hono middleware that validates Bearer access tokens and attaches the payload to context.
 * Returns 401 with WWW-Authenticate header on invalid or missing token.
 *
 * Use c.get('accessTokenPayload') to access the validated payload in downstream handlers.
 */
export const requireAccessToken = async (
  c: Context,
  next: Next,
): Promise<Response | undefined> => {
  const token = extractBearerToken(c.req.header('Authorization'))

  if (!token) {
    c.status(401)
    c.header(
      'WWW-Authenticate',
      'Bearer error="invalid_request", error_description="Authorization header required"',
    )
    return c.json({
      error: 'invalid_token',
      error_description: 'Missing or invalid Authorization header',
    })
  }

  try {
    const { header } = parseJwt(token)
    const kid = header.kid as string | undefined
    const keyPair = kid ? getActiveKeyPair(kid) : getLatestActiveKey('RS256')

    if (!keyPair) {
      c.status(401)
      c.header(
        'WWW-Authenticate',
        'Bearer error="invalid_token", error_description="Token verification failed"',
      )
      return c.json({
        error: 'invalid_token',
        error_description: 'Unable to verify token',
      })
    }

    const { payload: verifiedPayload } = verifyJwt(
      token,
      keyPair.publicKey,
      keyPair.algorithm,
    )

    const issuer = getOidcConfig().issuer
    validateAccessTokenClaims(verifiedPayload, issuer)

    const accessTokenPayload: AccessTokenPayload = {
      sub: verifiedPayload.sub as string,
      scope: verifiedPayload.scope as string | undefined,
      client_id: verifiedPayload.client_id as string | undefined,
      iss: verifiedPayload.iss as string | undefined,
      aud: verifiedPayload.aud as string | string[] | undefined,
      exp: verifiedPayload.exp as number | undefined,
      iat: verifiedPayload.iat as number | undefined,
      nbf: verifiedPayload.nbf as number | undefined,
    }

    c.set('accessTokenPayload', accessTokenPayload)
    await next()
    return undefined
  } catch {
    c.status(401)
    c.header(
      'WWW-Authenticate',
      'Bearer error="invalid_token", error_description="Token validation failed"',
    )
    return c.json({
      error: 'invalid_token',
      error_description: 'Token validation failed',
    })
  }
}

/**
 * Factory for middleware that additionally requires the token to have a specific scope.
 * Use when a route needs a particular scope (e.g. "profile" for userinfo).
 */
export const requireScope = (requiredScope: string) => {
  return async (c: Context, next: Next): Promise<Response | undefined> => {
    const payload = c.get('accessTokenPayload') as
      | AccessTokenPayload
      | undefined
    if (!payload) {
      c.status(401)
      c.header(
        'WWW-Authenticate',
        'Bearer error="invalid_token", error_description="Access token required"',
      )
      return c.json({
        error: 'invalid_token',
        error_description: 'Access token required',
      })
    }

    const scopes = (payload.scope ?? '').split(/\s+/).filter(Boolean)
    if (!scopes.includes(requiredScope)) {
      c.status(403)
      c.header(
        'WWW-Authenticate',
        `Bearer error="insufficient_scope", scope="${requiredScope}"`,
      )
      return c.json({
        error: 'insufficient_scope',
        error_description: `Scope "${requiredScope}" is required`,
      })
    }

    await next()
    return undefined
  }
}
