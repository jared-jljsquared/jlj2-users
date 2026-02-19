import type { Context, Next } from 'hono'

const isHttps = (c: Context): boolean => {
  try {
    const url = new URL(c.req.url)
    if (url.protocol === 'https:') return true
  } catch {
    // ignore
  }
  return c.req.header('x-forwarded-proto') === 'https'
}

/**
 * Security headers middleware. Sets standard security headers on all responses.
 * HSTS is only set when the request is over HTTPS.
 */
export const securityHeaders = async (
  c: Context,
  next: Next,
): Promise<Response | undefined> => {
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')

  if (isHttps(c)) {
    c.header(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    )
  }

  await next()
  return undefined
}
