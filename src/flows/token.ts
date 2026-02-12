import type { Context } from 'hono'
import {
  extractClientCredentialsFromBasicAuthHeader,
  extractClientCredentialsFromForm,
} from '../clients/auth.ts'
import { authenticateClient } from '../clients/service.ts'
import { getOidcConfig } from '../oidc/config.ts'
import { signJwt } from '../tokens/jwt.ts'
import { initializeKeys } from '../tokens/key-management.ts'
import { getUserById } from '../users/service.ts'
import { consumeAuthorizationCode } from './authorization-code-storage.ts'
import { verifyCodeVerifier } from './pkce.ts'

const ACCESS_TOKEN_EXPIRY_SECONDS = 3600
const ID_TOKEN_EXPIRY_SECONDS = 3600

const tokenError = (
  error: string,
  errorDescription?: string,
  status = 400,
): Response => {
  return new Response(
    JSON.stringify({
      error,
      ...(errorDescription && { error_description: errorDescription }),
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      },
    },
  )
}

export const handleTokenRequest = async (c: Context): Promise<Response> => {
  const contentType = c.req.header('Content-Type') ?? ''
  if (!contentType.includes('application/x-www-form-urlencoded')) {
    return tokenError(
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

  const grantType = params.get('grant_type')
  if (grantType !== 'authorization_code') {
    return tokenError(
      'unsupported_grant_type',
      'Only authorization_code grant is supported',
    )
  }

  const clientId = params.get('client_id')
  const code = params.get('code')
  const redirectUri = params.get('redirect_uri')
  const codeVerifier = params.get('code_verifier')

  if (!code || !redirectUri) {
    return tokenError('invalid_request', 'code and redirect_uri are required')
  }

  const credentials =
    extractClientCredentialsFromForm(params) ??
    extractClientCredentialsFromBasicAuthHeader(c.req.header('Authorization'))

  if (!credentials) {
    return tokenError('invalid_client', 'Client authentication required', 401)
  }

  const client = await authenticateClient(
    credentials.clientId,
    credentials.clientSecret,
  )
  if (!client) {
    return tokenError('invalid_client', 'Invalid client credentials', 401)
  }

  if (!client.grantTypes.includes('authorization_code')) {
    return tokenError(
      'unauthorized_client',
      'Client is not authorized for authorization_code grant',
    )
  }

  if (clientId && credentials.clientId !== clientId) {
    return tokenError(
      'invalid_request',
      'client_id in body must match Authorization header',
    )
  }

  const codeData = await consumeAuthorizationCode(code, client.id, redirectUri)
  if (!codeData) {
    return tokenError('invalid_grant', 'Invalid or expired authorization code')
  }

  if (codeData.code_challenge) {
    if (!codeVerifier) {
      return tokenError(
        'invalid_request',
        'code_verifier is required when PKCE was used',
      )
    }
    const method = codeData.code_challenge_method ?? 'plain'
    if (!verifyCodeVerifier(codeVerifier, codeData.code_challenge, method)) {
      return tokenError('invalid_grant', 'Invalid code_verifier')
    }
  }

  const user = await getUserById(codeData.user_id)
  if (!user) {
    return tokenError('server_error', 'User not found')
  }

  const config = getOidcConfig()
  const keyPair = initializeKeys()
  const now = Math.floor(Date.now() / 1000)

  const accessTokenPayload = {
    iss: config.issuer,
    sub: user.sub,
    aud: client.id,
    exp: now + ACCESS_TOKEN_EXPIRY_SECONDS,
    iat: now,
    scope: codeData.scopes.join(' '),
    client_id: client.id,
  }

  const accessToken = signJwt(
    accessTokenPayload,
    keyPair.privateKey,
    'RS256',
    keyPair.kid,
  )

  const idTokenPayload: Record<string, unknown> = {
    iss: config.issuer,
    sub: user.sub,
    aud: client.id,
    exp: now + ID_TOKEN_EXPIRY_SECONDS,
    iat: now,
    auth_time: now,
    ...(codeData.nonce && { nonce: codeData.nonce }),
    ...(codeData.scopes.includes('email') && {
      email: user.email,
      email_verified: user.emailVerified,
    }),
    ...(codeData.scopes.includes('profile') && {
      name: user.name,
      given_name: user.givenName,
      family_name: user.familyName,
      picture: user.picture,
    }),
  }

  const idToken = signJwt(
    idTokenPayload,
    keyPair.privateKey,
    'RS256',
    keyPair.kid,
  )

  const response = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_EXPIRY_SECONDS,
    scope: codeData.scopes.join(' '),
    id_token: idToken,
  }

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
  })
}
