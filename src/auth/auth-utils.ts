import type { Context } from 'hono'
import { createSessionToken, getSessionCookieName } from '../flows/session.ts'
import { getOidcConfig } from '../oidc/config.ts'

export type OAuthProvider = 'google' | 'microsoft' | 'facebook' | 'x'

const isValidReturnTo = (value: string): boolean => {
  const normalized = value.replace(/\\/g, '/')
  return normalized.startsWith('/') && !normalized.startsWith('//')
}

export const sanitizeReturnTo = (value: string | undefined): string => {
  const trimmed = value?.trim() ?? '/'
  const normalized = trimmed.replace(/\\/g, '/')
  return isValidReturnTo(normalized) ? normalized : '/'
}

export const isSecureRequest = (c: Context): boolean => {
  try {
    const url = new URL(c.req.url)
    if (url.protocol === 'https:') return true
  } catch {
    // ignore
  }
  return c.req.header('x-forwarded-proto') === 'https'
}

export const getRedirectUri = (provider: OAuthProvider): string => {
  const issuer = getOidcConfig().issuer
  return `${issuer.replace(/\/$/, '')}/auth/${provider}/callback`
}

export const setSessionCookieAndRedirect = (
  c: Context,
  userSub: string,
  returnTo: string,
): Response => {
  const token = createSessionToken(userSub)
  const cookieName = getSessionCookieName()
  const secureFlag = isSecureRequest(c) ? '; Secure' : ''
  const res = c.redirect(returnTo, 302)
  res.headers.set(
    'Set-Cookie',
    `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax${secureFlag}; Max-Age=900`,
  )
  return res
}
