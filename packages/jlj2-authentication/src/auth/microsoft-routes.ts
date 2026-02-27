import type { Context } from 'hono'
import { nanoid } from 'nanoid'
import { getMicrosoftAuthorizationUrl } from '../providers/microsoft.ts'
import {
  getMicrosoftConfig,
  MICROSOFT_TOKEN_URL,
} from '../providers/microsoft-config.ts'
import { authenticateWithMicrosoft } from '../users/service.ts'
import { handleOAuthCallback } from './auth-callback-handler.ts'
import { getRedirectUri, sanitizeReturnTo } from './auth-utils.ts'
import { storeOAuthState } from './oauth-state-storage.ts'

const PROVIDER = 'microsoft' as const

/**
 * GET /auth/microsoft
 * Redirect to Microsoft OAuth authorization URL.
 */
export const handleMicrosoftAuth = async (c: Context) => {
  const { isConfigured } = getMicrosoftConfig()
  if (!isConfigured) {
    return c.json(
      {
        error:
          'Microsoft OAuth is not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.',
      },
      503,
    )
  }

  const returnTo = sanitizeReturnTo(c.req.query('return_to'))
  const state = nanoid(32)

  await storeOAuthState({ state, returnTo })

  const redirectUri = getRedirectUri(PROVIDER)
  const authUrl = getMicrosoftAuthorizationUrl(redirectUri, state)
  return c.redirect(authUrl, 302)
}

/**
 * GET /auth/microsoft/callback
 * Handle Microsoft OAuth callback, exchange code for tokens, validate id_token, authenticate user.
 */
export const handleMicrosoftCallback = (c: Context) =>
  handleOAuthCallback(c, {
    provider: 'microsoft',
    getConfig: getMicrosoftConfig,
    getRedirectUri: () => getRedirectUri(PROVIDER),
    exchangeAndAuthenticate: async ({
      code,
      redirectUri,
      clientId,
      clientSecret,
    }) => {
      const tokenResponse = await fetch(MICROSOFT_TOKEN_URL, {
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

      const user = await authenticateWithMicrosoft(tokenData.id_token)
      return { sub: user.sub }
    },
  })
