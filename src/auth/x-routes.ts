import type { Context } from 'hono'
import { nanoid } from 'nanoid'
import { generateCodeChallenge, generateCodeVerifier } from '../flows/pkce.ts'
import { log } from '../plumbing/logger.ts'
import { getXAuthorizationUrl } from '../providers/x.ts'
import { getXConfig, X_TOKEN_URL } from '../providers/x-config.ts'
import { authenticateWithX } from '../users/service.ts'
import {
  getRedirectUri,
  sanitizeReturnTo,
  setSessionCookieAndRedirect,
} from './auth-utils.ts'
import { consumeOAuthState, storeOAuthState } from './oauth-state-storage.ts'

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
export const handleXCallback = async (c: Context) => {
  const { isConfigured, clientId, clientSecret } = getXConfig()
  if (!isConfigured) {
    return c.redirect('/login?error=x_not_configured', 302)
  }

  const state = c.req.query('state')
  const code = c.req.query('code')
  const errorParam = c.req.query('error')

  if (errorParam) {
    return c.redirect(`/login?error=x_${errorParam}`, 302)
  }

  if (!state || !code) {
    return c.redirect('/login?error=missing_callback_params', 302)
  }

  const stateData = await consumeOAuthState(state)
  if (!stateData) {
    return c.redirect('/login?error=invalid_state', 302)
  }

  const { returnTo, codeVerifier } = stateData
  if (!codeVerifier) {
    return c.redirect('/login?error=invalid_state', 302)
  }

  try {
    const redirectUri = getRedirectUri(PROVIDER)
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
    return setSessionCookieAndRedirect(c, user.sub, returnTo)
  } catch (err) {
    log({
      message: 'X auth failed',
      error: err instanceof Error ? err.message : String(err),
    })
    return c.redirect(
      `/login?return_to=${encodeURIComponent(returnTo)}&error=x_auth_failed`,
      302,
    )
  }
}
