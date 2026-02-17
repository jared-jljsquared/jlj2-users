import type { Context } from 'hono'
import { nanoid } from 'nanoid'
import { getGoogleAuthorizationUrl } from '../providers/google.ts'
import {
  GOOGLE_TOKEN_URL,
  getGoogleConfig,
} from '../providers/google-config.ts'
import { authenticateWithGoogle } from '../users/service.ts'
import { handleOAuthCallback } from './auth-callback-handler.ts'
import { getRedirectUri, sanitizeReturnTo } from './auth-utils.ts'
import { storeOAuthState } from './oauth-state-storage.ts'

const PROVIDER = 'google' as const

/**
 * GET /auth/google
 * Redirect to Google OAuth authorization URL.
 */
export const handleGoogleAuth = async (c: Context) => {
  const { isConfigured } = getGoogleConfig()
  if (!isConfigured) {
    return c.json(
      {
        error:
          'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      },
      503,
    )
  }

  const returnTo = sanitizeReturnTo(c.req.query('return_to'))
  const state = nanoid(32)

  await storeOAuthState({ state, returnTo })

  const redirectUri = getRedirectUri(PROVIDER)
  const authUrl = getGoogleAuthorizationUrl(redirectUri, state)
  return c.redirect(authUrl, 302)
}

/**
 * GET /auth/google/callback
 * Handle Google OAuth callback, exchange code for tokens, validate id_token, authenticate user.
 */
export const handleGoogleCallback = (c: Context) =>
  handleOAuthCallback(c, {
    provider: 'google',
    getConfig: getGoogleConfig,
    getRedirectUri: () => getRedirectUri(PROVIDER),
    exchangeAndAuthenticate: async ({
      code,
      redirectUri,
      clientId,
      clientSecret,
    }) => {
      const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      })

      if (!tokenResponse.ok) {
        const errText = await tokenResponse.text()
        throw new Error(
          `Token exchange failed: ${tokenResponse.status} ${errText}`,
        )
      }

      const tokenData = (await tokenResponse.json()) as {
        id_token?: string
        error?: string
      }

      if (tokenData.error || !tokenData.id_token) {
        throw new Error(tokenData.error ?? 'No id_token in response')
      }

      const user = await authenticateWithGoogle(tokenData.id_token)
      return { sub: user.sub }
    },
  })
