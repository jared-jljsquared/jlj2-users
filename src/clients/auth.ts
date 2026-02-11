import type { Context, Next } from 'hono'
import { authenticateClient } from './service.ts'
import type { Client } from './types/client.ts'

export type ClientAuthContext = {
  client: Client
}

/**
 * Extract client credentials from request.
 * Supports:
 * - client_secret_basic: Authorization header with Basic base64(client_id:client_secret)
 * - client_secret_post: client_id and client_secret in POST body or application/x-www-form-urlencoded
 */
export const extractClientCredentials = (
  c: Context,
): { clientId: string; clientSecret: string } | null => {
  // Try Authorization header (client_secret_basic)
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Basic ')) {
    try {
      const base64 = authHeader.slice(6)
      const decoded = atob(base64)
      const colonIndex = decoded.indexOf(':')
      if (colonIndex > 0) {
        const clientId = decoded.slice(0, colonIndex)
        const clientSecret = decoded.slice(colonIndex + 1)
        if (clientId && clientSecret) {
          return { clientId, clientSecret }
        }
      }
    } catch {
      // Fall through to try POST body
    }
  }

  // Try POST body (client_secret_post) - for application/x-www-form-urlencoded or JSON
  const contentType = c.req.header('Content-Type') ?? ''
  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('application/json')
  ) {
    // We need to parse the body - this may have been consumed
    // For form-urlencoded, we'd need to get the raw body
    // The middleware will need to handle this - for now we rely on the caller
    // to pass credentials via a different mechanism
    return null
  }

  return null
}

/**
 * Extract client credentials from URL-encoded form data (for token endpoint)
 */
export const extractClientCredentialsFromForm = (
  formData: URLSearchParams,
): { clientId: string; clientSecret: string } | null => {
  const clientId = formData.get('client_id')
  const clientSecret = formData.get('client_secret')

  if (clientId && clientSecret) {
    return { clientId, clientSecret }
  }
  return null
}

/**
 * Hono middleware that validates client credentials and attaches client to context.
 * Expects credentials to be extracted beforehand (e.g. from Authorization header or form body).
 * Use with createClientAuthMiddleware that receives credentials.
 */
export const createClientAuthMiddleware = (
  getCredentials: (c: Context) => {
    clientId: string
    clientSecret: string
  } | null,
) => {
  return async (c: Context, next: Next): Promise<undefined | Response> => {
    const credentials = getCredentials(c)
    if (!credentials) {
      return c.json(
        {
          error: 'invalid_client',
          error_description: 'Client authentication required',
        },
        401,
      )
    }

    const client = await authenticateClient(
      credentials.clientId,
      credentials.clientSecret,
    )

    if (!client) {
      return c.json(
        {
          error: 'invalid_client',
          error_description: 'Invalid client credentials',
        },
        401,
      )
    }

    c.set('client', client)
    await next()
  }
}
