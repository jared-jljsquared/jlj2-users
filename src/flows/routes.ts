import { Hono } from 'hono'
import { authenticateUser } from '../users/service.ts'
import { handleAuthorization } from './authorization.ts'
import { createSessionToken, getSessionCookieName } from './session.ts'
import { handleTokenRequest } from './token.ts'

const flows = new Hono()

flows.get('/authorize', handleAuthorization)

flows.post('/token', handleTokenRequest)

flows.get('/login', (c) => {
  const returnTo = c.req.query('return_to') ?? '/'

  const html = `<!DOCTYPE html>
<html>
<head><title>Sign in</title></head>
<body>
  <h1>Sign in</h1>
  <form method="POST" action="/login">
    <input type="hidden" name="return_to" value="${returnTo.replace(/"/g, '&quot;')}" />
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
  const returnTo = (body.return_to as string)?.trim() ?? '/'

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
    const res = c.redirect(returnTo, 302)
    res.headers.set(
      'Set-Cookie',
      `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900`,
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
