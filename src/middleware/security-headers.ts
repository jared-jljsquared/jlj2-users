import type { Context, Next } from 'hono'
import { isHttps } from './is-https.ts'

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
}

const HSTS_HEADER = 'max-age=31536000; includeSubDomains; preload'

/**
 * Merges security headers into an existing Response. Used when handlers return
 * raw Response objects (e.g. token/revoke endpoints) — Hono does not apply
 * c.header() to those, so we must merge after next().
 */
const mergeSecurityHeadersIntoResponse = (
  res: Response,
  isHttpsRequest: boolean,
): Response => {
  const headers = new Headers(res.headers)
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value)
  }
  if (isHttpsRequest) {
    headers.set('Strict-Transport-Security', HSTS_HEADER)
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  })
}

/**
 * Security headers middleware. Sets standard security headers on all responses.
 * HSTS is only set when the request is over HTTPS.
 * Runs after next() to merge headers into raw Response returns (token, revoke).
 */
export const securityHeaders = async (
  c: Context,
  next: Next,
): Promise<Response | undefined> => {
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')

  if (isHttps(c)) {
    c.header('Strict-Transport-Security', HSTS_HEADER)
  }

  await next()

  if (c.res && c.res instanceof Response) {
    c.res = mergeSecurityHeadersIntoResponse(c.res, isHttps(c))
  }
  return undefined
}
