import type { Context } from 'hono'
import { Hono } from 'hono'
import {
  handleFacebookAuth,
  handleFacebookCallback,
} from '../auth/facebook-routes.ts'
import {
  handleGoogleAuth,
  handleGoogleCallback,
} from '../auth/google-routes.ts'
import {
  handleMicrosoftAuth,
  handleMicrosoftCallback,
} from '../auth/microsoft-routes.ts'
import { handleXAuth, handleXCallback } from '../auth/x-routes.ts'
import { requireAccessToken } from '../middleware/require-access-token.ts'
import { getFacebookConfig } from '../providers/facebook-config.ts'
import { getGoogleConfig } from '../providers/google-config.ts'
import { getMicrosoftConfig } from '../providers/microsoft-config.ts'
import { getXConfig } from '../providers/x-config.ts'
import { authenticateUser } from '../users/service.ts'
import { handleAuthorization } from './authorization.ts'
import { escapeHtml } from './escape-html.ts'
import { handleRevokeRequest } from './revoke.ts'
import { createSessionToken, getSessionCookieName } from './session.ts'
import { handleTokenRequest } from './token.ts'
import { handleUserInfo } from './userinfo.ts'

const isSecureRequest = (c: Context): boolean => {
  try {
    const url = new URL(c.req.url)
    if (url.protocol === 'https:') return true
  } catch {
    // ignore URL parse errors
  }
  return c.req.header('x-forwarded-proto') === 'https'
}

/**
 * Validate return_to to prevent open redirect.
 * Only allows relative paths (e.g. /authorize?client_id=...).
 * Rejects protocol-relative URLs (//evil.com) but allows // in query values (e.g. redirect_uri=https://...).
 * Normalizes backslash to slash before validation since browsers treat /\ as // in URLs.
 */
const isValidReturnTo = (value: string): boolean => {
  const normalized = value.replace(/\\/g, '/')
  return normalized.startsWith('/') && !normalized.startsWith('//')
}

const sanitizeReturnTo = (value: string | undefined): string => {
  const trimmed = value?.trim() ?? '/'
  const normalized = trimmed.replace(/\\/g, '/')
  return isValidReturnTo(normalized) ? normalized : '/'
}

const flows = new Hono()

flows.get('/authorize', handleAuthorization)

flows.post('/token', handleTokenRequest)

flows.post('/revoke', handleRevokeRequest)

flows.get('/userinfo', requireAccessToken(), handleUserInfo)

flows.get('/auth/google', handleGoogleAuth)
flows.get('/auth/google/callback', handleGoogleCallback)
flows.get('/auth/facebook', handleFacebookAuth)
flows.get('/auth/facebook/callback', handleFacebookCallback)
flows.get('/auth/microsoft', handleMicrosoftAuth)
flows.get('/auth/microsoft/callback', handleMicrosoftCallback)
flows.get('/auth/x', handleXAuth)
flows.get('/auth/x/callback', handleXCallback)

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  missing_credentials: 'Email and password are required.',
  invalid_credentials: 'Invalid email or password.',
  missing_callback_params: 'Sign-in failed: missing callback parameters.',
  invalid_state: 'Sign-in failed: invalid or expired state. Please try again.',
  x_email_required:
    'X OAuth is only allowed for tokens that include an email address. Your X integration works, but your X account did not provide an email. Please ensure you have granted email access to your X account when signing in with X.',
}

flows.get('/login', (c) => {
  const returnTo = sanitizeReturnTo(c.req.query('return_to'))
  const errorParam = c.req.query('error')
  const errorMessage =
    errorParam && LOGIN_ERROR_MESSAGES[errorParam]
      ? LOGIN_ERROR_MESSAGES[errorParam]
      : errorParam
        ? `Sign-in failed: ${escapeHtml(errorParam)}`
        : null
  const { isConfigured: isGoogleConfigured } = getGoogleConfig()
  const { isConfigured: isMicrosoftConfigured } = getMicrosoftConfig()
  const { isConfigured: isFacebookConfigured } = getFacebookConfig()
  const { isConfigured: isXConfigured } = getXConfig()
  const googleAuthSection = isGoogleConfigured
    ? `<p><a href="/auth/google?return_to=${encodeURIComponent(returnTo)}">Sign in with Google</a></p>`
    : ''
  const microsoftAuthSection = isMicrosoftConfigured
    ? `<p><a href="/auth/microsoft?return_to=${encodeURIComponent(returnTo)}">Sign in with Microsoft</a></p>`
    : ''
  const facebookAuthSection = isFacebookConfigured
    ? `<p><a href="/auth/facebook?return_to=${encodeURIComponent(returnTo)}">Sign in with Facebook</a></p>`
    : ''
  const xAuthSection = isXConfigured
    ? `<p><a href="/auth/x?return_to=${encodeURIComponent(returnTo)}">Sign in with X</a></p>`
    : ''

  const html = `<!DOCTYPE html>
<html>
<head><title>Sign in</title></head>
<body>
  <h1>Sign in</h1>
  ${errorMessage ? `<p style="color: #c00;">${escapeHtml(errorMessage)}</p>` : ''}
  <form method="POST" action="/login">
    <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}" />
    <p>
      <label>Email: <input type="email" name="email" required /></label>
    </p>
    <p>
      <label>Password: <input type="password" name="password" required /></label>
    </p>
    <p><button type="submit">Sign in</button></p>
  </form>
  ${googleAuthSection}
  ${microsoftAuthSection}
  ${facebookAuthSection}
  ${xAuthSection}
</body>
</html>`

  return c.html(html)
})

flows.post('/login', async (c) => {
  const body = await c.req.parseBody()
  const email = (body.email as string)?.trim()
  const password = body.password as string
  const returnTo = sanitizeReturnTo(body.return_to as string)

  if (!email || !password) {
    return c.redirect(
      `/login?return_to=${encodeURIComponent(returnTo)}&error=missing_credentials`,
      302,
    )
  }

  try {
    const user = await authenticateUser({ email, password })
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
      `/login?return_to=${encodeURIComponent(returnTo)}&error=invalid_credentials`,
      302,
    )
  }
})

export default flows
