import type { Context } from 'hono'
import {
  extractClientCredentialsFromBasicAuthHeader,
  extractClientCredentialsFromForm,
} from '../clients/auth.ts'
import { authenticateClient, getClientById } from '../clients/service.ts'
import type { Client } from '../clients/types/client.ts'
import { getOidcConfig } from '../oidc/config.ts'
import { signJwt } from '../tokens/jwt.ts'
import { initializeKeys } from '../tokens/key-management.ts'
import { getUserById } from '../users/service.ts'
import { consumeAuthorizationCode } from './authorization-code-storage.ts'
import { verifyCodeVerifier } from './pkce.ts'
import {
  consumeRefreshToken,
  generateRefreshToken,
} from './refresh-token-storage.ts'

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
  if (grantType !== 'authorization_code' && grantType !== 'refresh_token') {
    return tokenError(
      'unsupported_grant_type',
      'Only authorization_code and refresh_token grants are supported',
    )
  }

  const clientId = params.get('client_id')
  const credentials =
    extractClientCredentialsFromForm(params) ??
    extractClientCredentialsFromBasicAuthHeader(c.req.header('Authorization'))

  let client: Awaited<ReturnType<typeof getClientById>>

  if (credentials) {
    client = await authenticateClient(
      credentials.clientId,
      credentials.clientSecret,
    )
    if (!client) {
      return tokenError('invalid_client', 'Invalid client credentials', 401)
    }
    if (clientId && credentials.clientId !== clientId) {
      return tokenError(
        'invalid_request',
        'client_id in body must match Authorization header',
      )
    }
  } else {
    // Public client (token_endpoint_auth_method: 'none')
    if (grantType === 'refresh_token') {
      return tokenError(
        'invalid_client',
        'Client authentication required for refresh_token grant',
        401,
      )
    }
    if (!clientId) {
      return tokenError(
        'invalid_request',
        'client_id is required for public clients',
      )
    }
    client = await getClientById(clientId)
    if (!client) {
      return tokenError('invalid_client', 'Unknown client', 401)
    }
    if (client.tokenEndpointAuthMethod !== 'none') {
      return tokenError('invalid_client', 'Client authentication required', 401)
    }
  }

  if (!client) {
    return tokenError('invalid_client', 'Client not found', 401)
  }

  if (grantType === 'authorization_code') {
    return handleAuthorizationCodeGrant(params, client, c)
  }

  if (grantType === 'refresh_token') {
    return handleRefreshTokenGrant(params, client, c)
  }

  return tokenError('unsupported_grant_type', 'Unsupported grant type')
}

const handleAuthorizationCodeGrant = async (
  params: URLSearchParams,
  client: Client,
  _c: Context,
): Promise<Response> => {
  const code = params.get('code')
  const redirectUri = params.get('redirect_uri')
  const codeVerifier = params.get('code_verifier')

  if (!code || !redirectUri) {
    return tokenError('invalid_request', 'code and redirect_uri are required')
  }

  if (!client.grantTypes.includes('authorization_code')) {
    return tokenError(
      'unauthorized_client',
      'Client is not authorized for authorization_code grant',
    )
  }

  const codeData = await consumeAuthorizationCode(code, client.id, redirectUri)
  if (!codeData) {
    return tokenError('invalid_grant', 'Invalid or expired authorization code')
  }

  const isPublicClient = client.tokenEndpointAuthMethod === 'none'
  if (isPublicClient && !codeData.code_challenge) {
    return tokenError('invalid_grant', 'PKCE is required for public clients')
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
    return tokenError('server_error', 'User not found', 500)
  }
  if (!user.isActive) {
    return tokenError('invalid_grant', 'User account is deactivated')
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
    auth_time: codeData.auth_time ?? now,
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

  const scopes = codeData.scopes
  const scopeString = scopes.join(' ')
  const shouldIssueRefreshToken =
    client.grantTypes.includes('refresh_token') &&
    scopes.includes('offline_access')

  let refreshToken: string | undefined
  if (shouldIssueRefreshToken) {
    refreshToken = await generateRefreshToken({
      client_id: client.id,
      user_id: user.sub,
      scopes,
    })
  }

  const response: Record<string, unknown> = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_EXPIRY_SECONDS,
    scope: scopeString,
    id_token: idToken,
  }
  if (refreshToken) {
    response.refresh_token = refreshToken
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

const handleRefreshTokenGrant = async (
  params: URLSearchParams,
  client: Client,
  _c: Context,
): Promise<Response> => {
  const refreshTokenParam = params.get('refresh_token')

  if (!refreshTokenParam) {
    return tokenError('invalid_request', 'refresh_token is required')
  }

  if (!client.grantTypes.includes('refresh_token')) {
    return tokenError(
      'unauthorized_client',
      'Client is not authorized for refresh_token grant',
    )
  }

  const refreshTokenData = await consumeRefreshToken(
    refreshTokenParam,
    client.id,
  )
  if (!refreshTokenData) {
    return tokenError('invalid_grant', 'Invalid or expired refresh token')
  }

  const user = await getUserById(refreshTokenData.user_id)
  if (!user) {
    return tokenError('server_error', 'User not found', 500)
  }
  if (!user.isActive) {
    return tokenError('invalid_grant', 'User account is deactivated')
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
    scope: refreshTokenData.scopes.join(' '),
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
    ...(refreshTokenData.scopes.includes('email') && {
      email: user.email,
      email_verified: user.emailVerified,
    }),
    ...(refreshTokenData.scopes.includes('profile') && {
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

  const newRefreshToken = await generateRefreshToken({
    client_id: client.id,
    user_id: user.sub,
    scopes: refreshTokenData.scopes,
  })

  const response = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_EXPIRY_SECONDS,
    scope: refreshTokenData.scopes.join(' '),
    id_token: idToken,
    refresh_token: newRefreshToken,
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
