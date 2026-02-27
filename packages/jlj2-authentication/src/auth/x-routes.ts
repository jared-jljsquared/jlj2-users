import type { Context } from 'hono'
import { nanoid } from 'nanoid'
import { generateCodeChallenge, generateCodeVerifier } from '../flows/pkce.ts'
import { getXAuthorizationUrl } from '../providers/x.ts'
import { getXConfig, X_TOKEN_URL } from '../providers/x-config.ts'
import { authenticateWithX } from '../users/service.ts'
import { handleOAuthCallback } from './auth-callback-handler.ts'
import { getRedirectUri, sanitizeReturnTo } from './auth-utils.ts'
import { storeOAuthState } from './oauth-state-storage.ts'

const PROVIDER = 'x' as const

/**
 * GET /auth/x
 * Redirect to X OAuth authorization URL with PKCE.
 */
export const handleXAuth = async (c: Context) => {
  const { isConfigured } = getXConfig()
  if (!isConfigured) {
    return c.json(
      {
        error:
          'X OAuth is not configured. Set X_CLIENT_ID and X_CLIENT_SECRET.',
      },
      503,
    )
  }

  const returnTo = sanitizeReturnTo(c.req.query('return_to'))
  const state = nanoid(32)
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier, 'S256')

  await storeOAuthState({ state, returnTo, codeVerifier })

  const redirectUri = getRedirectUri(PROVIDER)
  const authUrl = getXAuthorizationUrl(redirectUri, state, codeChallenge)
  return c.redirect(authUrl, 302)
}

/**
 * GET /auth/x/callback
 * Handle X OAuth callback, exchange code for access token (with PKCE), validate, authenticate user.
 */
export const handleXCallback = (c: Context) =>
  handleOAuthCallback(c, {
    provider: 'x',
    getConfig: getXConfig,
    getRedirectUri: () => getRedirectUri(PROVIDER),
    requireCodeVerifier: true,
    exchangeAndAuthenticate: async ({
      code,
      redirectUri,
      stateData,
      clientId,
      clientSecret,
    }) => {
      const codeVerifier = stateData.codeVerifier
      if (!codeVerifier) {
        throw new Error('code_verifier required for X OAuth flow')
      }
      const credentials = Buffer.from(
        `${clientId}:${clientSecret}`,
        'utf8',
      ).toString('base64')

      const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      })

      const tokenResponse = await fetch(X_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
        body: tokenBody.toString(),
      })

      if (!tokenResponse.ok) {
        const errText = await tokenResponse.text()
        throw new Error(
          `Token exchange failed: ${tokenResponse.status} ${errText}`,
        )
      }

      const tokenData = (await tokenResponse.json()) as {
        access_token?: string
        error?: string
        error_description?: string
      }

      if (tokenData.error || !tokenData.access_token) {
        throw new Error(
          tokenData.error_description ??
            tokenData.error ??
            'No access_token in response',
        )
      }

      const user = await authenticateWithX(tokenData.access_token)
      return { sub: user.sub }
    },
  })
