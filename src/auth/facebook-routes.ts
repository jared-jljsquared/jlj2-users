import type { Context } from 'hono'
import { nanoid } from 'nanoid'
import { createSessionToken, getSessionCookieName } from '../flows/session.ts'
import { getOidcConfig } from '../oidc/config.ts'
import { getFacebookAuthorizationUrl } from '../providers/facebook.ts'
import {
  FACEBOOK_TOKEN_URL,
  getFacebookConfig,
} from '../providers/facebook-config.ts'
import { authenticateWithFacebook } from '../users/service.ts'

/** In-memory state store for OAuth CSRF protection. TTL 10 minutes. */
const stateStore = new Map<string, { returnTo: string; expiresAt: number }>()
const STATE_TTL_MS = 10 * 60 * 1000

const pruneExpiredState = (): void => {
  const now = Date.now()
  for (const [key, value] of stateStore.entries()) {
    if (value.expiresAt < now) {
      stateStore.delete(key)
    }
  }
}

const isValidReturnTo = (value: string): boolean => {
  const normalized = value.replace(/\\/g, '/')
  return normalized.startsWith('/') && !normalized.startsWith('//')
}

const sanitizeReturnTo = (value: string | undefined): string => {
  const trimmed = value?.trim() ?? '/'
  const normalized = trimmed.replace(/\\/g, '/')
  return isValidReturnTo(normalized) ? normalized : '/'
}

const isSecureRequest = (c: Context): boolean => {
  try {
    const url = new URL(c.req.url)
    if (url.protocol === 'https:') return true
  } catch {
    // ignore
  }
  return c.req.header('x-forwarded-proto') === 'https'
}

const getRedirectUri = (): string => {
  const issuer = getOidcConfig().issuer
  return `${issuer.replace(/\/$/, '')}/auth/facebook/callback`
}

/**
 * GET /auth/facebook
 * Redirect to Facebook OAuth authorization URL.
 */
export const handleFacebookAuth = (c: Context) => {
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
  stateStore.set(state, {
    returnTo,
    expiresAt: Date.now() + STATE_TTL_MS,
  })
  pruneExpiredState()

  const redirectUri = getRedirectUri()
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

  const stateData = stateStore.get(state)
  stateStore.delete(state)
  pruneExpiredState()

  if (!stateData) {
    return c.redirect('/login?error=invalid_state', 302)
  }

  const returnTo = stateData.returnTo

  try {
    const redirectUri = getRedirectUri()
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
    const token = createSessionToken(user.sub)
    const cookieName = getSessionCookieName()
    const secureFlag = isSecureRequest(c) ? '; Secure' : ''
    const res = c.redirect(returnTo, 302)
    res.headers.set(
      'Set-Cookie',
      `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax${secureFlag}; Max-Age=900`,
    )
    return res
  } catch {
    return c.redirect(
      `/login?return_to=${encodeURIComponent(returnTo)}&error=facebook_auth_failed`,
      302,
    )
  }
}
