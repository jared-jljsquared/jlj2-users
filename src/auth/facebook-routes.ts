import type { Context } from 'hono'
import { nanoid } from 'nanoid'
import { log } from '../plumbing/logger.ts'
import { getFacebookAuthorizationUrl } from '../providers/facebook.ts'
import {
  FACEBOOK_TOKEN_URL,
  getFacebookConfig,
} from '../providers/facebook-config.ts'
import { authenticateWithFacebook } from '../users/service.ts'
import {
  getRedirectUri,
  sanitizeReturnTo,
  setSessionCookieAndRedirect,
} from './auth-utils.ts'
import { consumeOAuthState, storeOAuthState } from './oauth-state-storage.ts'

const PROVIDER = 'facebook' as const

/**
 * GET /auth/facebook
 * Redirect to Facebook OAuth authorization URL.
 */
export const handleFacebookAuth = async (c: Context) => {
  const { isConfigured } = getFacebookConfig()
  if (!isConfigured) {
    return c.json(
      {
        error:
          'Facebook OAuth is not configured. Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET.',
      },
      503,
    )
  }

  const returnTo = sanitizeReturnTo(c.req.query('return_to'))
  const state = nanoid(32)

  await storeOAuthState({ state, returnTo })

  const redirectUri = getRedirectUri(PROVIDER)
  const authUrl = getFacebookAuthorizationUrl(redirectUri, state)
  return c.redirect(authUrl, 302)
}

/**
 * GET /auth/facebook/callback
 * Handle Facebook OAuth callback, exchange code for access token, validate, authenticate user.
 */
export const handleFacebookCallback = async (c: Context) => {
  const { isConfigured, clientId, clientSecret } = getFacebookConfig()
  if (!isConfigured) {
    return c.redirect('/login?error=facebook_not_configured', 302)
  }

  const state = c.req.query('state')
  const code = c.req.query('code')
  const errorParam = c.req.query('error')

  if (errorParam) {
    return c.redirect(`/login?error=facebook_${errorParam}`, 302)
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
    const tokenUrl = new URL(FACEBOOK_TOKEN_URL)
    tokenUrl.searchParams.set('client_id', clientId)
    tokenUrl.searchParams.set('client_secret', clientSecret)
    tokenUrl.searchParams.set('redirect_uri', redirectUri)
    tokenUrl.searchParams.set('code', code)

    const tokenResponse = await fetch(tokenUrl.toString())
    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text()
      throw new Error(
        `Token exchange failed: ${tokenResponse.status} ${errText}`,
      )
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string
      error?: { message?: string }
    }

    if (tokenData.error || !tokenData.access_token) {
      throw new Error(tokenData.error?.message ?? 'No access_token in response')
    }

    const user = await authenticateWithFacebook(tokenData.access_token)
    return setSessionCookieAndRedirect(c, user.sub, returnTo)
  } catch (err) {
    log({
      message: 'Facebook auth failed',
      error: err instanceof Error ? err.message : String(err),
    })
    return c.redirect(
      `/login?return_to=${encodeURIComponent(returnTo)}&error=facebook_auth_failed`,
      302,
    )
  }
}
