import type { Context } from 'hono'
import { Hono } from 'hono'
import { authenticateUser } from '../users/service.ts'
import { handleAuthorization } from './authorization.ts'
import { escapeHtml } from './escape-html.ts'
import { createSessionToken, getSessionCookieName } from './session.ts'
import { handleTokenRequest } from './token.ts'

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

flows.get('/login', (c) => {
  const returnTo = sanitizeReturnTo(c.req.query('return_to'))

  const html = `<!DOCTYPE html>
<html>
<head><title>Sign in</title></head>
<body>
  <h1>Sign in</h1>
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
