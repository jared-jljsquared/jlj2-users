import type { Context } from 'hono'
import { nanoid } from 'nanoid'
import { createSessionToken, getSessionCookieName } from '../flows/session.ts'
import { getOidcConfig } from '../oidc/config.ts'
import { getMicrosoftAuthorizationUrl } from '../providers/microsoft.ts'
import {
  getMicrosoftConfig,
  MICROSOFT_TOKEN_URL,
} from '../providers/microsoft-config.ts'
import { authenticateWithMicrosoft } from '../users/service.ts'

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
  return `${issuer.replace(/\/$/, '')}/auth/microsoft/callback`
}

/**
 * GET /auth/microsoft
 * Redirect to Microsoft OAuth authorization URL.
 */
export const handleMicrosoftAuth = (c: Context) => {
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
  stateStore.set(state, {
    returnTo,
    expiresAt: Date.now() + STATE_TTL_MS,
  })
  pruneExpiredState()

  const redirectUri = getRedirectUri()
  const authUrl = getMicrosoftAuthorizationUrl(redirectUri, state)
  return c.redirect(authUrl, 302)
}

/**
 * GET /auth/microsoft/callback
 * Handle Microsoft OAuth callback, exchange code for tokens, validate id_token, authenticate user.
 */
export const handleMicrosoftCallback = async (c: Context) => {
  const { isConfigured, clientId, clientSecret } = getMicrosoftConfig()
  if (!isConfigured) {
    return c.redirect('/login?error=microsoft_not_configured', 302)
  }

  const state = c.req.query('state')
  const code = c.req.query('code')
  const errorParam = c.req.query('error')

  if (errorParam) {
    return c.redirect(`/login?error=microsoft_${errorParam}`, 302)
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
    const tokenResponse = await fetch(MICROSOFT_TOKEN_URL, {
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

    const user = await authenticateWithMicrosoft(tokenData.id_token)
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
      `/login?return_to=${encodeURIComponent(returnTo)}&error=microsoft_auth_failed`,
      302,
    )
  }
}
