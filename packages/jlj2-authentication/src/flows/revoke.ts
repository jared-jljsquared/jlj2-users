import type { Context } from 'hono'
import {
  extractClientCredentialsFromBasicAuthHeader,
  extractClientCredentialsFromForm,
} from '../clients/auth.ts'
import { authenticateClient, getClientById } from '../clients/service.ts'
import { oidcJsonError } from '../oidc/error-response.ts'
import { logSecurityEvent } from '../plumbing/security-log.ts'
import { revokeRefreshToken } from './refresh-token-storage.ts'

/**
 * RFC 7009 Token Revocation endpoint.
 * POST /revoke with token, optional token_type_hint, and client authentication.
 * Revokes refresh tokens. Access tokens are short-lived; revocation invalidates refresh token.
 * Per RFC 7009: returns 200 even when token is invalid/unknown (prevents enumeration).
 */
export const handleRevokeRequest = async (c: Context): Promise<Response> => {
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

  const clientId = params.get('client_id')
  const credentials =
    extractClientCredentialsFromForm(params) ??
    extractClientCredentialsFromBasicAuthHeader(c.req.header('Authorization'))

  let clientIdToUse: string

  if (credentials) {
    const client = await authenticateClient(
      credentials.clientId,
      credentials.clientSecret,
    )
    if (!client) {
      return oidcJsonError('invalid_client', 'Invalid client credentials', 401)
    }
    if (clientId && credentials.clientId !== clientId) {
      return oidcJsonError(
        'invalid_request',
        'client_id in body must match Authorization header',
      )
    }
    clientIdToUse = credentials.clientId
  } else {
    if (!clientId) {
      return oidcJsonError(
        'invalid_request',
        'client_id is required when not using client authentication',
      )
    }
    const client = await getClientById(clientId)
    if (!client) {
      return oidcJsonError('invalid_client', 'Unknown client', 401)
    }
    if (client.tokenEndpointAuthMethod !== 'none') {
      return oidcJsonError(
        'invalid_client',
        'Client authentication required',
        401,
      )
    }
    clientIdToUse = clientId
  }

  const tokenTypeHint = params.get('token_type_hint')
  if (
    tokenTypeHint &&
    tokenTypeHint !== 'refresh_token' &&
    tokenTypeHint !== 'access_token'
  ) {
    return oidcJsonError(
      'unsupported_token_type',
      'token_type_hint must be refresh_token or access_token',
    )
  }

  const revoked = await revokeRefreshToken(token.trim(), clientIdToUse)

  logSecurityEvent({
    event: 'token_revoked',
    client_id: clientIdToUse,
    revoked,
  })

  return new Response(null, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
  })
}
