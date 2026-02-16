import type { Context } from 'hono'
import { nanoid } from 'nanoid'
import { generateCodeChallenge, generateCodeVerifier } from '../flows/pkce.ts'
import { createSessionToken, getSessionCookieName } from '../flows/session.ts'
import { getOidcConfig } from '../oidc/config.ts'
import { getXAuthorizationUrl } from '../providers/x.ts'
import { getXConfig, X_TOKEN_URL } from '../providers/x-config.ts'
import { authenticateWithX } from '../users/service.ts'

/** In-memory state store for OAuth CSRF and PKCE. TTL 10 minutes. */
const stateStore = new Map<
  string,
  { returnTo: string; expiresAt: number; codeVerifier: string }
>()
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
  return `${issuer.replace(/\/$/, '')}/auth/x/callback`
}

/**
 * GET /auth/x
 * Redirect to X OAuth authorization URL with PKCE.
 */
export const handleXAuth = (c: Context) => {
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

  stateStore.set(state, {
    returnTo,
    expiresAt: Date.now() + STATE_TTL_MS,
    codeVerifier,
  })
  pruneExpiredState()

  const redirectUri = getRedirectUri()
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

  const stateData = stateStore.get(state)
  stateStore.delete(state)
  pruneExpiredState()

  if (!stateData) {
    return c.redirect('/login?error=invalid_state', 302)
  }

  const { returnTo, codeVerifier } = stateData

  try {
    const redirectUri = getRedirectUri()
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
      `/login?return_to=${encodeURIComponent(returnTo)}&error=x_auth_failed`,
      302,
    )
  }
}
