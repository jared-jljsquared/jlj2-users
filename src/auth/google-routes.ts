import type { Context } from 'hono'
import { nanoid } from 'nanoid'
import { log } from '../plumbing/logger.ts'
import { getGoogleAuthorizationUrl } from '../providers/google.ts'
import {
  GOOGLE_TOKEN_URL,
  getGoogleConfig,
} from '../providers/google-config.ts'
import { authenticateWithGoogle } from '../users/service.ts'
import {
  getRedirectUri,
  sanitizeReturnTo,
  setSessionCookieAndRedirect,
} from './auth-utils.ts'
import { consumeOAuthState, storeOAuthState } from './oauth-state-storage.ts'

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
export const handleGoogleCallback = async (c: Context) => {
  const { isConfigured, clientId, clientSecret } = getGoogleConfig()
  if (!isConfigured) {
    return c.redirect('/login?error=google_not_configured', 302)
  }

  const state = c.req.query('state')
  const code = c.req.query('code')
  const errorParam = c.req.query('error')

  if (errorParam) {
    return c.redirect(`/login?error=google_${errorParam}`, 302)
  }

  if (!state || !code) {
    return c.redirect('/login?error=missing_callback_params', 302)
  }

  const stateData = await consumeOAuthState(state)
  if (!stateData) {
    return c.redirect('/login?error=invalid_state', 302)
  }

  const { returnTo } = stateData

  try {
    const redirectUri = getRedirectUri(PROVIDER)
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
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
      access_token?: string
      error?: string
    }

    if (tokenData.error || !tokenData.id_token) {
      throw new Error(tokenData.error ?? 'No id_token in response')
    }

    const user = await authenticateWithGoogle(tokenData.id_token)
    return setSessionCookieAndRedirect(c, user.sub, returnTo)
  } catch (err) {
    log({
      message: 'Google auth failed',
      error: err instanceof Error ? err.message : String(err),
    })
    return c.redirect(
      `/login?return_to=${encodeURIComponent(returnTo)}&error=google_auth_failed`,
      302,
    )
  }
}
